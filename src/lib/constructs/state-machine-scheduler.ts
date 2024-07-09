import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';

export interface StateMachineSchedulerProps {
  readonly stateMachine: sfn.IStateMachine;
}

export class StateMachineScheduler extends Construct {
  constructor(scope: Construct, id: string, props: StateMachineSchedulerProps) {
    super(scope, id);

    const { stateMachine } = props;

    const rule = new events.Rule(this, 'Rule', {
      schedule: events.Schedule.cron({ minute: '0' }), // 毎時0分実行
    });

    rule.addTarget(new targets.SfnStateMachine(stateMachine));
  }
}
