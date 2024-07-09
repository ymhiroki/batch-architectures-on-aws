import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
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
  /**
   * @description 呼び出し元に適した排他制御に使うパラメーターを指定する。SQS なら $[0].messageId など
   * @default '$.id'
   */
  readonly mutexKeyExpression?: string;
}

export class RunTaskStateMachine extends Construct {
  public readonly stateMachine: sfn.StateMachine;

  constructor(scope: Construct, id: string, props: RunTaskStateMachineProps) {
    super(scope, id);

    const cluster = props.cluster;

    const table = new dynamodb.Table(this, 'Table', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    const mutexKeyExpression = props.mutexKeyExpression ?? '$.id';

    const conditionalWriteTask = new tasks.DynamoPutItem(this, 'PutItem', {
      table,
      item: {
        id: tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt(`${mutexKeyExpression}`)),
        updatedAt: tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('$$.Execution.StartTime')),
      },
      conditionExpression: 'attribute_not_exists(id)',
    });

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

    const successState = new sfn.Succeed(this, 'Success');
    const failState = new sfn.Fail(this, 'Fail');

    const definition = sfn.Chain.start(
      conditionalWriteTask
        .addCatch(failState)
        .next(
          runTask
            .addRetry(retryProps)
            .addCatch(errorNotification.next(failState), {
              resultPath: '$.error',
            }))
        .next(successState));
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
