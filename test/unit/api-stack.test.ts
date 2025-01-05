import { Template, Match } from "aws-cdk-lib/assertions";
import { App, RemovalPolicy } from "aws-cdk-lib";
import { ApiStack } from "../../lib/api-stack";
import { AuthStack } from "../../lib/auth-stack";
import { DataStack } from "../../lib/data-stack";
import { Speak2SeeCdkStack } from "../../lib/speak2_see_cdk-stack";
import { getConfig } from "../../lib/config/environment-config";

const config = getConfig("prod");
describe("ApiStack", () => {
  let app: App;
  let template: Template;

  beforeEach(() => {
    app = new App();

    // Create dependent stacks
    const authStack = new AuthStack(app, "TestAuthStack", {
      userPoolName: config.userPoolName,
      removalPolicy: config.removalPolicy,
      advancedSecurity: config.advancedSecurity,
    });
    const dataStack = new DataStack(app, "TestDataStack", {
      bucketName: config.bucketName,
      tableName: config.tableName,
      removalPolicy: config.removalPolicy,
      advancedSecurity: config.advancedSecurity,
      itemExpirationDays: config.itemExpirationDays,
      logRetentionDays: config.logRetentionDays,
    });
    const workflowStack = new Speak2SeeCdkStack(app, "TestWorkflowStack", {
      bucket: dataStack.bucket,
      table: dataStack.table,
      logRemovalPolicy: config.removalPolicy,
      logRetentionDays: config.logRetentionDays,
    });

    // Create the ApiStack
    const stack = new ApiStack(app, "TestApiStack", {
      restApiName: config.restApiName,
      stage: "test",
      userPool: authStack.userPool,
      bucket: dataStack.bucket,
      table: dataStack.table,
      stateMachineStandard: workflowStack.stateMachineStandard,
      stateMachineExpress: workflowStack.stateMachineExpress,
      logRemovalPolicy: config.removalPolicy,
      logRetentionDays: config.logRetentionDays,
      itemExpirationDays: config.itemExpirationDays,
    });

    template = Template.fromStack(stack);
  });

  test("creates a Lambda function for /upload with environment variables set", () => {
    template.hasResourceProperties("AWS::Lambda::Function", {
      Handler: "index.handler",
      Runtime: "nodejs20.x",
      Environment: {
        Variables: {
          BUCKET_NAME: Match.objectLike({
            "Fn::ImportValue": Match.stringLikeRegexp(
              "^TestDataStack:ExportsOutputRefS3Bucket"
            ),
          }),
          TABLE_NAME: Match.objectLike({
            "Fn::ImportValue": Match.stringLikeRegexp(
              "^TestDataStack:ExportsOutputRefDynamoDBTable"
            ),
          }),
          STATE_MACHINE_STANDARD_ARN: Match.objectLike({
            "Fn::ImportValue": Match.stringLikeRegexp(
              "^TestWorkflowStack:ExportsOutputRefStandardStateMachine"
            ),
          }),
          STATE_MACHINE_EXPRESS_ARN: Match.objectLike({
            "Fn::ImportValue": Match.stringLikeRegexp(
              "^TestWorkflowStack:ExportsOutputRefExpressStateMachine"
            ),
          }),
        },
      },
    });

    template.hasResourceProperties("AWS::ApiGateway::Resource", {
      PathPart: "upload",
    });
  });

  test("upload lambda can only write to the S3 bucket and DynamoDB table", () => {
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: "Allow",
            Action: "s3:PutObject", // Ensure PutObject is the only action
          }),
          Match.objectLike({
            Effect: "Allow",
            Action: "dynamodb:PutItem", // Ensure PutItem is the only action
          }),
        ]),
      },
    });
  });

  test("creates a Lambda function for /getAll with environment variables set", () => {
    template.hasResourceProperties("AWS::Lambda::Function", {
      Handler: "index.handler",
      Runtime: "nodejs20.x",
      Environment: {
        Variables: {
          TABLE_NAME: Match.objectLike({
            "Fn::ImportValue": Match.stringLikeRegexp(
              "^TestDataStack:ExportsOutputRefDynamoDBTable"
            ),
          }),
        },
      },
    });

    template.hasResourceProperties("AWS::ApiGateway::Resource", {
      PathPart: "getAll",
    });
  });

  test("getAll lambda can only query the DynamoDB table", () => {
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: "Allow",
            Action: "dynamodb:Query", // Ensure Query is the only action
          }),
        ]),
      },
    });
  });

  test("creates a Lambda function for /get/{itemID} with environment variables set", () => {
    template.hasResourceProperties("AWS::Lambda::Function", {
      Handler: "index.handler",
      Runtime: "nodejs20.x",
      Environment: {
        Variables: {
          BUCKET_NAME: Match.objectLike({
            "Fn::ImportValue": Match.stringLikeRegexp(
              "^TestDataStack:ExportsOutputRefS3Bucket"
            ),
          }),
          TABLE_NAME: Match.objectLike({
            "Fn::ImportValue": Match.stringLikeRegexp(
              "^TestDataStack:ExportsOutputRefDynamoDBTable"
            ),
          }),
        },
      },
    });

    template.hasResourceProperties("AWS::ApiGateway::Resource", {
      PathPart: "{itemID}",
    });
  });

  test("get lambda can only get from DynamoDB and S3", () => {
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: "Allow",
            Action: "s3:GetObject", // Ensure GetObject is the only S3 action
          }),
          Match.objectLike({
            Effect: "Allow",
            Action: "dynamodb:GetItem", // Ensure GetItem is the only DynamoDB action
          }),
        ]),
      },
    });
  });
});
