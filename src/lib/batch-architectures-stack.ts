import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import { Construct } from 'constructs';
import { InvokeFunctionStateMachine } from './constructs/invoke-function-state-machine';
import { RunTaskStateMachine } from './constructs/runtask-state-machine';
import { StateMachineQueue } from './constructs/state-machine-queue';
import { StateMachineScheduler } from './constructs/state-machine-scheduler';

export interface BatchArchitecturesStackProps extends cdk.StackProps { }

export class BatchArchitecturesStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: BatchArchitecturesStackProps = {}) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'VPC');

    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
    });

    // Pattern 1-1: EventBridge Scheduler -> StepFunctions { -> EcsRunTask }
    const stateMachineForScheduler = new RunTaskStateMachine(this, 'RunTask', {
      cluster,
    });
    new StateMachineScheduler(this, 'EventBridgeSfn', {
      stateMachine: stateMachineForScheduler.stateMachine,
    });

    // Pattern 2-1: SQS -> EventBridge Pipes -> StepFunctions { -> EcsRunTask }
    const stateMachineForQueue = new RunTaskStateMachine(this, 'Queue', {
      cluster,
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
