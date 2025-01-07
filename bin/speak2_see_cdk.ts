#!/usr/bin/env node
import "source-map-support/register";
import { Speak2SeeCdkStack } from "../lib/speak2_see_cdk-stack";
import { App } from "aws-cdk-lib";
import { AuthStack } from "../lib/auth-stack";
import { DataStack } from "../lib/data-stack";
import { ApiStack } from "../lib/api-stack";
import { getConfig } from "../lib/config/environment-config";
import { stackName } from "../shared/common-utils";
import { addProjectTags } from "../lib/tagging";
import { addSecurityChecks } from "../lib/config/nag-config";

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
  removalPolicy: config.removalPolicy,
  advancedSecurity: config.advancedSecurity,
  itemExpirationDays: config.itemExpirationDays,
  logRetentionDays: config.logRetentionDays,
  env,
});
addProjectTags(dataStack, config.tags);

const authStack = new AuthStack(app, stackName("auth", stage), {
  userPoolName: config.userPoolName,
  removalPolicy: config.removalPolicy,
  advancedSecurity: config.advancedSecurity,
  env,
});
addProjectTags(authStack, config.tags);

const speak2SeeStack = new Speak2SeeCdkStack(app, stackName("core", stage), {
  bucket: dataStack.bucket,
  table: dataStack.table,
  logRemovalPolicy: config.removalPolicy,
  logRetentionDays: config.logRetentionDays,
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
  logRemovalPolicy: config.removalPolicy,
  logRetentionDays: config.logRetentionDays,
  itemExpirationDays: config.itemExpirationDays,
  env,
});
addProjectTags(apiStack, config.tags);

addSecurityChecks(app, stage);
