// eslint-disable-next-line import/no-extraneous-dependencies
import * as pipes from '@aws-cdk/aws-pipes-alpha';
// eslint-disable-next-line import/no-extraneous-dependencies
import * as sources from '@aws-cdk/aws-pipes-sources-alpha';
// eslint-disable-next-line import/no-extraneous-dependencies
import * as targets from '@aws-cdk/aws-pipes-targets-alpha';
import { CfnOutput, RemovalPolicy } from 'aws-cdk-lib';
// import * as logs from 'aws-cdk-lib/aws-logs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';

export interface StateMachineQueueProps {
  readonly stateMachine: sfn.IStateMachine;
  readonly queue?: sqs.IQueue;
}

/**
 * @description StateMachine を入力し、SQS へのキューイングを契機に起動する設定を追加
 */
export class StateMachineQueue extends Construct {
  constructor(scope: Construct, id: string, props: StateMachineQueueProps) {
    super(scope, id);

    const { stateMachine } = props;

    const pipeTarget = new targets.SfnStateMachine(stateMachine, {
      invocationType: targets.StateMachineInvocationType.FIRE_AND_FORGET,
    });

    const queue =
      props.queue ??
      new sqs.Queue(this, 'Queue', {
        encryption: sqs.QueueEncryption.KMS_MANAGED,
        enforceSSL: true,
        removalPolicy: RemovalPolicy.DESTROY,
      });

    const pipeSource = new sources.SqsSource(queue);
    new pipes.Pipe(this, 'Pipe', {
      source: pipeSource,
      target: pipeTarget,
      logLevel: pipes.LogLevel.INFO,
    });

    new CfnOutput(this, 'SendMessageCommand', {
      value: `aws sqs send-message --queue-url ${queue.queueUrl} --message-body "Hello World"`,
    });
  }
}
