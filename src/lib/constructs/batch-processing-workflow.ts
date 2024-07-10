import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Construct } from 'constructs';

export interface BatchProcessingWorkflowProps {
  readonly task: tasks.EcsRunTask | tasks.LambdaInvoke;
  readonly notificationEmail?: string;
  /**
   * @description 呼び出し元に適した排他制御に使うパラメーターを指定する。SQS なら $[0].messageId など
   * @default '$.id'
   */
  readonly mutexKeyExpression?: string;
}

/**
 * @description 実行環境 (EcsRunTask or LambdaInvoke) を入力し、排他制御・エラー処理を追加する
 */
export class BatchProcessingWorkflow extends Construct {
  public readonly stateMachine: sfn.StateMachine;

  constructor(scope: Construct, id: string, props: BatchProcessingWorkflowProps) {
    super(scope, id);

    const table = new dynamodb.Table(this, 'Table', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    const mutexKeyExpression = props.mutexKeyExpression ?? '$.id';

    // at least once な呼び出し機構に対応するため、Dynamo DB で排他制御
    // 簡単のため PutItem を使っているが、起動要件によって Lambda を挟むことも選択肢となる
    const conditionalWriteTask = new tasks.DynamoPutItem(this, `PutItem/${id}`, {
      stateName: 'Execution Control',
      table,
      item: {
        id: tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt(`${mutexKeyExpression}`)),
        updatedAt: tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('$$.Execution.StartTime')),
      },
      conditionExpression: 'attribute_not_exists(id)',
      resultPath: sfn.JsonPath.DISCARD, // ワークフローへの入力をそのまま渡す
    });

    const retryProps: sfn.RetryProps = {
      errors: ['States.ALL'], // errors: https://docs.aws.amazon.com/ja_jp/step-functions/latest/dg/concepts-error-handling.html
      backoffRate: 1,
      interval: cdk.Duration.seconds(10),
      maxAttempts: 5,
    };

    const topic = new sns.Topic(this, 'Topic', {
      enforceSSL: true,
    });
    const errorNotification = new tasks.SnsPublish(this, `Notify/${id}`, {
      stateName: 'Notify',
      topic,
      message: sfn.TaskInput.fromText('task has failed.'),
    });

    // 通知先の指定
    if (props.notificationEmail) {
      topic.addSubscription(new subscriptions.EmailSubscription(props.notificationEmail));
    }

    const successState = new sfn.Succeed(this, 'Success');
    const failState = new sfn.Fail(this, 'Fail');

    const definition = sfn.Chain.start(
      conditionalWriteTask
        .addCatch(failState)
        .next(
          props.task
            .addRetry(retryProps)
            .addCatch(errorNotification.next(failState), {
              resultPath: '$.error',
            }))
        .next(successState));
    const logGroup = new logs.LogGroup(this, 'LogGroup', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_WEEK,
    });

    const stateMachine = new sfn.StateMachine(this, 'StateMachine', {
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      logs: {
        destination: logGroup,
        level: sfn.LogLevel.ALL,
      },
      tracingEnabled: true,
    });

    this.stateMachine = stateMachine;
  }
}
