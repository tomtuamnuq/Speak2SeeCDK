#!/usr/bin/env node
import "source-map-support/register";
import { Speak2SeeCdkStack } from "../lib/speak2_see_cdk-stack";
import { App } from "aws-cdk-lib";
import { AuthStack } from "../lib/auth-stack";

const app = new App();
const envEU = {
  region: "eu-west-2", // important for available Bedrock Models
  account: process.env.CDK_DEFAULT_ACCOUNT, // TODO
};
const authStack = new AuthStack(app, "AuthStack", { env: envEU });

new Speak2SeeCdkStack(app, "Speak2SeeCdkStack", {
  env: envEU,
});