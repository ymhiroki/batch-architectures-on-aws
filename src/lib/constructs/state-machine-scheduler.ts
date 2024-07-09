import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';

export interface StateMachineSchedulerProps {
  readonly stateMachine: sfn.IStateMachine;
  readonly enabled?: boolean;
}

export class StateMachineScheduler extends Construct {
  constructor(scope: Construct, id: string, props: StateMachineSchedulerProps) {
    super(scope, id);

    const { stateMachine } = props;
    // enabled は props で指定されている値を優先し、デフォルト false
    const enabled = props.enabled ?? false;

    const rule = new events.Rule(this, 'Rule', {
      schedule: events.Schedule.cron({ minute: '0/5' }), // 5min毎実行
      enabled,
    });

    rule.addTarget(new targets.SfnStateMachine(stateMachine));
  }
}
