import * as path from 'path';
import * as cdk from 'aws-cdk-lib';

import * as assets from 'aws-cdk-lib/aws-ecr-assets';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Construct } from 'constructs';

export interface RunTaskStateMachineProps {
  readonly cluster: ecs.ICluster;
  readonly notificationEmail?: string;
}

export class RunTaskStateMachine extends Construct {
  public readonly stateMachine: sfn.StateMachine;

  constructor(scope: Construct, id: string, props: RunTaskStateMachineProps) {
    super(scope, id);

    const cluster = props.cluster;

    const imageDir = path.resolve(__dirname, '../../', 'app', 'ticker');
    const image = ecs.ContainerImage.fromAsset(imageDir, {
      platform: assets.Platform.LINUX_AMD64,
    });

    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      cpu: 256,
      memoryLimitMiB: 512,
    });

    taskDefinition.addContainer('TickerContainer', {
      image,
      logging: ecs.AwsLogDriver.awsLogs({
        streamPrefix: 'TickerContainer',
        mode: ecs.AwsLogDriverMode.BLOCKING,
      }),
    });

    const runTask = new tasks.EcsRunTask(this, 'RunTask', {
      cluster,
      taskDefinition,
      integrationPattern: sfn.IntegrationPattern.RUN_JOB,
      launchTarget: new tasks.EcsFargateLaunchTarget({
        platformVersion: ecs.FargatePlatformVersion.LATEST,
      }),
      containerOverrides: [{
        containerDefinition: taskDefinition.defaultContainer!,
      }],
    });

    const retryProps: sfn.RetryProps = {
      errors: ['States.ALL'], // errors: https://docs.aws.amazon.com/ja_jp/step-functions/latest/dg/concepts-error-handling.html
      backoffRate: 1,
      interval: cdk.Duration.seconds(10),
      maxAttempts: 5,
    };

    const topic = new sns.Topic(this, 'Topic');
    const errorNotification = new tasks.SnsPublish(this, 'Notify', {
      topic,
      message: sfn.TaskInput.fromText('EcsRunTask has failed.'),
    });

    // 通知先の指定
    if (props.notificationEmail) {
      topic.addSubscription(new subscriptions.EmailSubscription(props.notificationEmail));
    }

    const definition = sfn.Chain.start(
      runTask
        .addRetry(retryProps)
        .addCatch(errorNotification, {
          resultPath: '$.error',
        }));
    const logGroup = new logs.LogGroup(this, 'LogGroup');

    const stateMachine = new sfn.StateMachine(this, 'StateMachine', {
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      logs: {
        destination: logGroup,
        level: sfn.LogLevel.ALL,
      },
    });
    taskDefinition.grantRun(stateMachine);

    this.stateMachine = stateMachine;
  }
}
