import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface BatchArchitecturesStackProps extends cdk.StackProps {}

export class BatchArchitecturesStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: BatchArchitecturesStackProps = {}) {
    super(scope, id, props);
  }
}
