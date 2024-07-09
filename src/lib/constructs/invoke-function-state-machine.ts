import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as assets from 'aws-cdk-lib/aws-ecr-assets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Construct } from 'constructs';

export interface InvokeFunctionStateMachineProps {
}

export class InvokeFunctionStateMachine extends Construct {
  public readonly stateMachine: sfn.StateMachine;

  constructor(scope: Construct, id: string, _?: InvokeFunctionStateMachineProps) {
    super(scope, id);

    const imageDir = path.resolve(__dirname, '../../', 'app', 'ticker-lambda');

    // Lambda 関数の作成
    const tickerFunction = new lambda.DockerImageFunction(this, 'TickerFunctions', {
      code: lambda.DockerImageCode.fromImageAsset(imageDir, {
        platform: assets.Platform.LINUX_AMD64,
      }),
      timeout: cdk.Duration.minutes(3), // タイムアウトを2分に設定
      memorySize: 512, // メモリサイズを512MBに設定
    });

    const lambdaInvoke = new tasks.LambdaInvoke(this, 'lambdaInvoke', {
      lambdaFunction: tickerFunction,
      payloadResponseOnly: true,
    });

    const definition = sfn.Chain.start(lambdaInvoke);
    const logGroup = new logs.LogGroup(this, 'TickerMachineLogGroup');

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
