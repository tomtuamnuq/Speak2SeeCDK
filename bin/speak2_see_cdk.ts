#!/usr/bin/env node
import "source-map-support/register";
import { Speak2SeeCdkStack } from "../lib/speak2_see_cdk-stack";
import { App } from "aws-cdk-lib";
import { AuthStack } from "../lib/auth-stack";
import { DataStack } from "../lib/data-stack";
import { ApiStack } from "../lib/api-stack";
import { getConfig, stackName } from "../lib/config/environment-config";
import { addProjectTags } from "../lib/tagging";

const app = new App();

// Get environment from context or default to 'dev'
const stage = app.node.tryGetContext("stage") || "dev";
const config = getConfig(stage);

const env = {
  region: config.region,
  account: config.account,
};

const dataStack = new DataStack(app, stackName("data", stage), {
  bucketName: config.bucketName,
  tableName: config.tableName,
  env,
});
addProjectTags(dataStack, config.tags);

const authStack = new AuthStack(app, stackName("auth", stage), {
  userPoolName: config.userPoolName,
  env,
});
addProjectTags(authStack, config.tags);

const speak2SeeStack = new Speak2SeeCdkStack(app, stackName("core", stage), {
  bucket: dataStack.bucket,
  table: dataStack.table,
  env,
});
addProjectTags(speak2SeeStack, config.tags);

const apiStack = new ApiStack(app, stackName("api", stage), {
  restApiName: config.restApiName,
  stage: stage,
  userPool: authStack.userPool,
  bucket: dataStack.bucket,
  table: dataStack.table,
  stateMachine: speak2SeeStack.stateMachine,
  env,
});
addProjectTags(apiStack, config.tags);
