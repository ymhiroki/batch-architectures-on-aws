import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as assets from 'aws-cdk-lib/aws-ecr-assets';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Construct } from 'constructs';

export interface BatchArchitecturesStackProps extends cdk.StackProps { }

export class BatchArchitecturesStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: BatchArchitecturesStackProps = {}) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'VPC');

    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
    });

    const imageDir = path.resolve(__dirname, '..', 'app', 'ticker');
    const image = ecs.ContainerImage.fromAsset(imageDir, {
      platform: assets.Platform.LINUX_AMD64,
    });

    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      cpu: 256,
      memoryLimitMiB: 512,
    });

    taskDefinition.addContainer('TickerContainer', {
      image,
      logging: ecs.AwsLogDriver.awsLogs({
        streamPrefix: 'TickerContainer',
        mode: ecs.AwsLogDriverMode.BLOCKING,
      }),
    });

    const runTask = new tasks.EcsRunTask(this, 'RunTask', {
      cluster,
      taskDefinition,
      integrationPattern: sfn.IntegrationPattern.RUN_JOB,
      launchTarget: new tasks.EcsFargateLaunchTarget({
        platformVersion: ecs.FargatePlatformVersion.LATEST,
      }),
      containerOverrides: [{
        containerDefinition: taskDefinition.defaultContainer!,
      }],
    });

    const stateMachine = new sfn.StateMachine(this, 'StateMachine', {
      definitionBody: sfn.DefinitionBody.fromChainable(
        runTask,
      ),
    });
    taskDefinition.grantRun(stateMachine);
  }
}
