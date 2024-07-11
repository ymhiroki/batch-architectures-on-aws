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
