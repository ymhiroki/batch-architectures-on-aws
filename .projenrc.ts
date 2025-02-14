import { awscdk } from 'projen';
const project = new awscdk.AwsCdkTypeScriptApp({
  appEntrypoint: 'cdk.ts',
  cdkVersion: '2.1.0',
  defaultReleaseBranch: 'main',
  name: 'batch-architectures-on-aws',
  projenrcTs: true,
  github: false,
  autoMerge: false,
  deps: ['@aws-cdk/aws-pipes-alpha', '@aws-cdk/aws-pipes-sources-alpha', '@aws-cdk/aws-pipes-targets-alpha', '@aws/pdk', 'cdk-nag'], /* Runtime dependencies of this module. */
  // description: undefined,  /* The description is just a string that helps people understand the purpose of the package. */
  // devDeps: [],             /* Build dependencies for this module. */
  // packageName: undefined,  /* The "name" in package.json. */
});
project.synth();
