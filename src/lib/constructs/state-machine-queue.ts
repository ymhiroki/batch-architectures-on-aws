import * as pipes from '@aws-cdk/aws-pipes-alpha';
import * as sources from '@aws-cdk/aws-pipes-sources-alpha';
import * as targets from '@aws-cdk/aws-pipes-targets-alpha';
import { CfnOutput } from 'aws-cdk-lib';
// import * as logs from 'aws-cdk-lib/aws-logs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';

export interface StateMachineQueueProps {
  readonly stateMachine: sfn.IStateMachine;
}

export class StateMachineQueue extends Construct {
  constructor(scope: Construct, id: string, props: StateMachineQueueProps) {
    super(scope, id);

    const { stateMachine } = props;

    const pipeTarget = new targets.SfnStateMachine(stateMachine, {
      invocationType: targets.StateMachineInvocationType.FIRE_AND_FORGET,
    });

    const queue = new sqs.Queue(this, 'Queue', {
      encryption: sqs.QueueEncryption.KMS_MANAGED,
    });

    const pipeSource = new sources.SqsSource(queue);
    // const logGroup = new logs.LogGroup(this, 'PipesLogGroup');
    // const logDestinationConfig: pipes.LogDestinationConfig = {
    //   parameters: {
    //     cloudwatchLogsLogDestination: {
    //       logGroupArn: logGroup.logGroupArn,
    //     },
    //   },
    // };
    new pipes.Pipe(this, 'Pipe', {
      source: pipeSource,
      target: pipeTarget,
      logLevel: pipes.LogLevel.INFO,
    });

    new CfnOutput(this, 'QueueArn', {
      value: `aws sqs send-message --queue-url ${queue.queueUrl} --message-body "Hello World"`,
    });
  }
}
