import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { BatchArchitecturesStack } from '../src/lib/batch-architectures-stack';

test('Snapshot', () => {
  const app = new App();
  const stack = new BatchArchitecturesStack(app, 'test');

  const template = Template.fromStack(stack);
  expect(template.toJSON()).toMatchSnapshot();
});
