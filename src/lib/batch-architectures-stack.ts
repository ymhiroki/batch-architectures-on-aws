import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { InvokeFunctionStateMachine } from './constructs/invoke-function-state-machine';
import { RunTaskStateMachine } from './constructs/runtask-state-machine';
import { StateMachineQueue } from './constructs/state-machine-queue';
import { StateMachineScheduler } from './constructs/state-machine-scheduler';

export interface BatchArchitecturesStackProps extends cdk.StackProps { }

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

    const vpc = new ec2.Vpc(this, 'VPC');

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

    // Pattern 1-2: EventBridge Scheduler -> StepFunctions { -> InvokeLambda }
    const invokeFunctionStateMachine = new InvokeFunctionStateMachine(this, 'Invoke', {
    });
    new StateMachineScheduler(this, 'EventBridgeSfn2', {
      stateMachine: invokeFunctionStateMachine.stateMachine,
    });
  }
}
