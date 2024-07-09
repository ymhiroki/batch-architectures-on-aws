import { App } from 'aws-cdk-lib';
// import { PDKNag } from '@aws/pdk/pdk-nag';
import { BatchArchitecturesStack } from './lib/batch-architectures-stack';

const app = new App();
// const app = PDKNag.app();

new BatchArchitecturesStack(app, 'BatchArchitecturesStack', {});

app.synth();
