#!/usr/bin/env node
import "source-map-support/register";
import { Speak2SeeCdkStack } from "../lib/speak2_see_cdk-stack";
import { App } from "aws-cdk-lib";
import { AuthStack } from "../lib/auth-stack";
import { DataStack } from "../lib/data-stack";
import { ApiStack } from "../lib/api-stack";

const app = new App();
const envEU = {
  region: "eu-west-2", // important for available Bedrock Models
  account: process.env.CDK_DEFAULT_ACCOUNT, // TODO
};
const dataStack = new DataStack(app, "DataStack", {
  bucketName: "tomtuamnuq-speak2see-bucket",
  tableName: "tomtuamnuq-speak2see-table",
  env: envEU,
});

const authStack = new AuthStack(app, "AuthStack", { env: envEU });
const speak2SeeStack = new Speak2SeeCdkStack(app, "Speak2SeeCdkStack", {
  bucket: dataStack.bucket,
  table: dataStack.table,
  env: envEU,
});
new ApiStack(app, "ApiStack", {
  userPool: authStack.userPool,
  bucket: dataStack.bucket,
  table: dataStack.table,
  stateMachine: speak2SeeStack.stateMachine,
  env: envEU,
});
