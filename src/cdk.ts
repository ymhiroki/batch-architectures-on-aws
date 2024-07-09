import { App } from 'aws-cdk-lib';
import { BatchArchitecturesStack } from './lib/batch-architectures-stack';

const app = new App();

new BatchArchitecturesStack(app, 'BatchArchitecturesStack', {});

app.synth();
