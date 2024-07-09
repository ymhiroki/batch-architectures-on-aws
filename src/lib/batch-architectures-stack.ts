import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as assets from 'aws-cdk-lib/aws-ecr-assets';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
// eslint-disable-next-line import/no-extraneous-dependencies
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
// import { InvokeFunctionStateMachine } from './constructs/invoke-function-state-machine';
import { BatchProcessingStateMachine } from './constructs/batch-processing-state-machine';
import { RunTaskStateMachine } from './constructs/runtask-state-machine';
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

    // Pattern 1-1: EventBridge Scheduler -> StepFunctions { -> EcsRunTask }
    const stateMachineForScheduler = new RunTaskStateMachine(this, 'RunTask', {
      cluster,
      // set email address if you need notification.
      // notificationEmail: 'example@example.com',
    });
    new StateMachineScheduler(this, 'EventBridgeSfn', {
      stateMachine: stateMachineForScheduler.stateMachine,
    });

    // Pattern 2-1: SQS -> EventBridge Pipes -> StepFunctions { -> EcsRunTask }
    const stateMachineForQueue = new RunTaskStateMachine(this, 'Queue', {
      cluster,
      mutexKeyExpression: '$[0].messageId',
    });
    new StateMachineQueue(this, 'SfnQueue', {
      stateMachine: stateMachineForQueue.stateMachine,
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
      stateMachine: new BatchProcessingStateMachine(this, 'BatchProcessing', {
        task: new tasks.LambdaInvoke(this, 'lambdaInvokeForQueue', {
          lambdaFunction: tickerFunction,
          payloadResponseOnly: true,
        }),
        mutexKeyExpression: '$[0].messageId',
      }).stateMachine,
    });
  }
}
