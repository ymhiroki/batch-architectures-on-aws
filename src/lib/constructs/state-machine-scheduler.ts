import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';

export interface StateMachineSchedulerProps {
  readonly stateMachine: sfn.IStateMachine;
  readonly schedule: events.Schedule;
  readonly scheduleEnabled: boolean;
}

/**
 * @description StateMachine を入力し、EventBridge Scheduler を契機に起動する設定を追加
 */
export class StateMachineScheduler extends Construct {
  constructor(scope: Construct, id: string, props: StateMachineSchedulerProps) {
    super(scope, id);

    const { stateMachine, schedule, scheduleEnabled } = props;

    // at least once の起動であることに注意する
    // exactly once が必要な場合は One-time schedules を利用する (https://docs.aws.amazon.com/scheduler/latest/UserGuide/schedule-types.html#one-time)
    const rule = new events.Rule(this, 'Rule', {
      schedule: schedule, // 5min毎実行
      enabled: scheduleEnabled,
    });

    rule.addTarget(new targets.SfnStateMachine(stateMachine));
  }
}
