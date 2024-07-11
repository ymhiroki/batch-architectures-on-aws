import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as assets from 'aws-cdk-lib/aws-ecr-assets';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as events from 'aws-cdk-lib/aws-events';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
// eslint-disable-next-line import/no-extraneous-dependencies
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
// import { InvokeFunctionStateMachine } from './constructs/invoke-function-state-machine';
import { BatchProcessingWorkflow } from './constructs/batch-processing-workflow';
import { StateMachineQueue } from './constructs/state-machine-queue';
import { StateMachineS3 } from './constructs/state-machine-s3';
import { StateMachineScheduler } from './constructs/state-machine-scheduler';

export interface BatchArchitecturesStackProps extends cdk.StackProps {
  readonly vpc?: ec2.IVpc;
  /**
   * @description バッチ処理のタイムアウト時間
   * @default 1時間
   */
  readonly taskTimeout?: cdk.Duration;
  /**
   * @description バッチ処理の起動頻度
   * @default 5分毎
   */
  readonly schedule?: events.Schedule;
  readonly scheduleEnabled?: boolean;
}

export class BatchArchitecturesStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: BatchArchitecturesStackProps = {}) {
    super(scope, id, props);

    const vpc =
      props.vpc ??
      new ec2.Vpc(this, 'VPC', {
        natGateways: 1,
      });

    const taskTimeout = sfn.Timeout.duration(
      props.taskTimeout ??
      cdk.Duration.hours(1),
    );

    const schedule =
      props.schedule ??
      events.Schedule.cron({ minute: '0/5' });

    // enabled は props で指定されている値を優先し、デフォルト false
    const scheduleEnabled =
      props.scheduleEnabled ??
      false;

    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
      containerInsights: true,
    });

    // EcsRunTask で起動するコンテナの設定
    const ecsImageDir = path.resolve(__dirname, '../', 'app', 'ticker');
    const image = ecs.ContainerImage.fromAsset(ecsImageDir, {
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

    // Pattern 1-1: EventBridge Scheduler -> StepFunctions { -> EcsRunTask }
    new StateMachineScheduler(this, 'Scheduler', {
      stateMachine: new BatchProcessingWorkflow(this, 'SchedulerEcsWorkflow', {
        task: new tasks.EcsRunTask(this, 'SchedulerTask', {
          cluster,
          taskDefinition,
          integrationPattern: sfn.IntegrationPattern.RUN_JOB,
          launchTarget: new tasks.EcsFargateLaunchTarget({
            platformVersion: ecs.FargatePlatformVersion.LATEST,
          }),
          containerOverrides: [{
            containerDefinition: taskDefinition.defaultContainer!,
            environment: [{
              name: 'SFN_TASK_INPUT',
              value: sfn.JsonPath.stringAt('States.JsonToString($)'),
            }],
          }],
          taskTimeout,
        }),
      }).stateMachine,
      schedule,
      scheduleEnabled,
    });

    // Pattern 2-1: SQS -> EventBridge Pipes -> StepFunctions { -> EcsRunTask }
    new StateMachineQueue(this, 'Queue', {
      stateMachine: new BatchProcessingWorkflow(this, 'QueueEcsWorkflow', {
        task: new tasks.EcsRunTask(this, 'QueueTask', {
          cluster,
          taskDefinition,
          integrationPattern: sfn.IntegrationPattern.RUN_JOB,
          launchTarget: new tasks.EcsFargateLaunchTarget({
            platformVersion: ecs.FargatePlatformVersion.LATEST,
          }),
          containerOverrides: [{
            containerDefinition: taskDefinition.defaultContainer!,
            environment: [{
              name: 'SFN_TASK_INPUT',
              value: sfn.JsonPath.stringAt('States.JsonToString($)'),
            }],
          }],
        }),
        mutexKeyExpression: '$[0].messageId',
      }).stateMachine,
    });
    // TODO: exit code の確認, $.Containers[0].ExitCode で取得できるはず

    // LambdaInvoke で起動するLambda 関数の作成
    const lambdaImageDir = path.resolve(__dirname, '../', 'app', 'ticker-lambda');
    const tickerFunction = new lambda.DockerImageFunction(this, 'TickerFunctions', {
      code: lambda.DockerImageCode.fromImageAsset(lambdaImageDir, {
        platform: assets.Platform.LINUX_AMD64,
      }),
      timeout: cdk.Duration.minutes(3), // タイムアウトを2分に設定
      memorySize: 512, // メモリサイズを512MBに設定
    });

    // Pattern 1-2: EventBridge Scheduler -> StepFunctions { -> InvokeLambda }
    new StateMachineScheduler(this, 'EventBridgeSfn2', {
      stateMachine: new BatchProcessingWorkflow(this, 'SchedulerLambdaWorkflow', {
        task: new tasks.LambdaInvoke(this, 'SchedulerFunction', {
          lambdaFunction: tickerFunction,
          payloadResponseOnly: true,
          taskTimeout,
        }),
      }).stateMachine,
      schedule,
      scheduleEnabled,
    });

    // Pattern 2-2: SQS -> EventBridge Pipes -> StepFunctions { -> InvokeLambda }
    new StateMachineQueue(this, 'SfnQueue2', {
      stateMachine: new BatchProcessingWorkflow(this, 'QueueLambdaWorkflow', {
        task: new tasks.LambdaInvoke(this, 'QueueFunction', {
          lambdaFunction: tickerFunction,
          payloadResponseOnly: true,
          taskTimeout,
        }),
        mutexKeyExpression: '$[0].messageId',
      }).stateMachine,
    });

    // Pattern 3-2: S4 Bucket -> EventBridge -> StepFunctions { -> InvokeLambda }
    new StateMachineS3(this, 'SfnBucket', {
      stateMachine: new BatchProcessingWorkflow(this, 'BucketLambdaWorkflow', {
        task: new tasks.LambdaInvoke(this, 'BucketFunction', {
          lambdaFunction: tickerFunction,
          payloadResponseOnly: true,
          taskTimeout,
        }),
      }).stateMachine,
    });

    /**
     * pdg-nag suppressions
     */
    NagSuppressions.addStackSuppressions(this, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'default iam policy',
      },
      {
        id: 'AwsSolutions-IAM5',
        reason: 'default iam policy',
      },
      {
        id: 'AwsSolutions-SNS2',
        reason: 'no key is prepared',
      },
      {
        id: 'AwsSolutions-SNS3',
        reason: 'no key is prepared',
      },
      {
        id: 'AwsSolutions-SQS3',
        reason: 'dlq is not mandatory here',
      },
      {
        id: 'AwsSolutions-DDB3',
        reason: 'PITR is not mandatory here',
      },
      {
        id: 'AwsSolutions-VPC7',
        reason: 'flowlogs is not used here',
      },
      {
        id: 'AwsSolutions-S1',
        reason: 'access log is disabled here',
      },
    ]);
  }
}
