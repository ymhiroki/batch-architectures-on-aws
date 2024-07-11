import * as cdk from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';

export interface StateMachineS3Props {
  readonly stateMachine: sfn.IStateMachine;
  readonly bucket?: s3.IBucket;
}

/**
 * @description S3 Bucket -> EventBridge -> StepFunctions { -> LambdaInvoke}
 * @summary S3 Bucket -> SQS として、state-machine-queue に繋ぐ方式でも良い気がする
 */
export class StateMachineS3 extends Construct {
  constructor(scope: Construct, id: string, props: StateMachineS3Props) {
    super(scope, id);

    const { stateMachine } = props;

    const bucket =
      props.bucket ??
      new s3.Bucket(this, 'Bucket', {
        autoDeleteObjects: true,
        encryption: s3.BucketEncryption.KMS_MANAGED,
        enforceSSL: true,
        publicReadAccess: false,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        eventBridgeEnabled: true,
      });

    const rule = new events.Rule(this, 'Rule', {
      eventPattern: {
        source: ['aws.s3'],
        detailType: ['Object Created'],
        detail: {
          bucket: {
            name: [bucket.bucketName],
          },
        },
      },
    });

    const dlq = new sqs.Queue(this, 'Dlq', {
      encryption: sqs.QueueEncryption.KMS_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    rule.addTarget(
      new targets.SfnStateMachine(stateMachine, {
        deadLetterQueue: dlq,
      }),
    );

    const command = `echo "This is a test message." | aws s3 cp - s3://${bucket.bucketName}/$(date +"%Y%m%d_%H%M%S")_test.txt`;
    new cdk.CfnOutput(this, 'updateToBucketCommand', {
      value: command,
    });
  }
}

/**
 * イベントの例
{
  "version": "0",
  "id": "41ede7cf-b3be-4f4f-339d-0acec339f042",
  "detail-type": "Object Created",
  "source": "aws.s3",
  "account": "123456789012",
  "time": "2024-07-11T04:12:29Z",
  "region": "us-east-1",
  "resources": [
    "arn:aws:s3:::bucket-name"
  ],
  "detail": {
    "version": "0",
    "bucket": {
      "name": "bucket-name"
    },
    "object": {
      "key": "20240711_131227_test.txt",
      "size": 24,
      "etag": "dd4feeb772c1e06040ae6429f48b7cb1",
      "sequencer": "00668F5BAD4281536F"
    },
    "request-id": "G02D84PCS169V58P",
    "requester": "123456789012",
    "source-ip-address": "49.97.99.239",
    "reason": "PutObject"
  }
}
 */
