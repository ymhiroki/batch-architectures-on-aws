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

/**
 * イベントの例
[
  {
    "messageId": "4635b1c5-7da7-4fe0-87cd-f006ba5b7c20",
    "receiptHandle": "AQEBvOxGOiLZXIfxVE2I1bY5E/bi1c+pK6yrVOZdcEgSiQivffELz0sfBU/5d6SWQcL1pfj8UvC0y0eyxX6P9Uci9/udcfIq9eCYyhKQTMt+7NM0PDI/XUlMoI3fu9up2oeeIfF8cAluchSs8yidFs1KTqrQfcea89ROWDMZ9Imv4kjsdISMfB0BukDU87dkdgbrbfIgDA4NJWkDIb3aVPCestR2ChtZZBUpl3zK1zZtzJmJK3UjIN1MJp+8pU/JR7myv54kInowx9sNItjHHIHK+fQQ3MhO3d536h1P7N+0wHfTS6HmRP9KJ8fGe2A8e5JqEK+qVFNsb3NZhT4eFSFc2rd0ok547dASB5SK9eTucaKKYZPEen7WsUCqbdpjtDAcv+MleMLZ4e6lhDI1NrInb0ZXrd4uOQQEkhzOIR0L1EiytwUPwCt5ijcWZjsQp3yV",
    "body": "Hello World",
    "attributes": {
      "ApproximateReceiveCount": "1",
      "SentTimestamp": "1720575338030",
      "SenderId": "AIDAUGIKGMBFZF4XOWBLB",
      "ApproximateFirstReceiveTimestamp": "1720575338037"
    },
    "messageAttributes": {},
    "md5OfBody": "b10a8db164e0754105b7a99be72e3fe5",
    "eventSource": "aws:sqs",
    "eventSourceARN": "arn:aws:sqs:us-east-1:123456789012:queue-arn",
    "awsRegion": "us-east-1"
  }
]
 */
