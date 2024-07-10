import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as assets from 'aws-cdk-lib/aws-ecr-assets';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
// eslint-disable-next-line import/no-extraneous-dependencies
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
// import { InvokeFunctionStateMachine } from './constructs/invoke-function-state-machine';
import { BatchProcessingStateMachine } from './constructs/batch-processing-state-machine';
import { StateMachineQueue } from './constructs/state-machine-queue';
import { StateMachineScheduler } from './constructs/state-machine-scheduler';

export interface BatchArchitecturesStackProps extends cdk.StackProps {
}

export class BatchArchitecturesStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: BatchArchitecturesStackProps = {}) {
    super(scope, id, props);

    NagSuppressions.addStackSuppressions(this, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'default iam policy',
      },
      {
        id: 'AwsSolutions-IAM5',
        reason: 'default iam policy',
      },
    ]);

    const vpc = new ec2.Vpc(this, 'VPC', {
      natGateways: 1,
    });

    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
      containerInsights: true,
    });


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
      stateMachine: new BatchProcessingStateMachine(this, 'BatchProcessing', {
        task: new tasks.EcsRunTask(this, 'RunTaskScheduler', {
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
      }).stateMachine,
    });

    // Pattern 2-1: SQS -> EventBridge Pipes -> StepFunctions { -> EcsRunTask }
    new StateMachineQueue(this, 'Queue', {
      stateMachine: new BatchProcessingStateMachine(this, 'BatchProcessing2', {
        task: new tasks.EcsRunTask(this, 'RunTaskQueue', {
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

    // Lambda 関数の作成
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
      stateMachine: new BatchProcessingStateMachine(this, 'BatchProcessingForScheduler', {
        task: new tasks.LambdaInvoke(this, 'lambdaInvokeForScheduler', {
          lambdaFunction: tickerFunction,
          payloadResponseOnly: true,
        }),
      }).stateMachine,
    });

    // Patter 2-2: SQS -> EventBridge Pipes -> StepFunctions { -> InvokeLambda }
    new StateMachineQueue(this, 'SfnQueue2', {
      stateMachine: new BatchProcessingStateMachine(this, 'BatchProcessingForQueue', {
        task: new tasks.LambdaInvoke(this, 'lambdaInvokeForQueue', {
          lambdaFunction: tickerFunction,
          payloadResponseOnly: true,
        }),
        mutexKeyExpression: '$[0].messageId',
      }).stateMachine,
    });
  }
}
