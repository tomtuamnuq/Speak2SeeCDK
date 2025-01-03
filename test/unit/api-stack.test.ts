import { Template, Match } from "aws-cdk-lib/assertions";
import { App } from "aws-cdk-lib";
import { ApiStack } from "../../lib/api-stack";
import { AuthStack } from "../../lib/auth-stack";
import { DataStack } from "../../lib/data-stack";
import { Speak2SeeCdkStack } from "../../lib/speak2_see_cdk-stack";

const bucketName = "test-bucket";
const tableName = "test-table";

describe("ApiStack", () => {
  let app: App;
  let template: Template;

  beforeEach(() => {
    app = new App();

    // Create dependent stacks
    const authStack = new AuthStack(app, "TestAuthStack", {
      userPoolName: "test-users",
    });
    const dataStack = new DataStack(app, "TestDataStack", {
      bucketName,
      tableName,
    });
    const workflowStack = new Speak2SeeCdkStack(app, "TestWorkflowStack", {
      bucket: dataStack.bucket,
      table: dataStack.table,
    });

    // Create the ApiStack
    const stack = new ApiStack(app, "TestApiStack", {
      restApiName: "test-endpoint",
      stage: "test",
      userPool: authStack.userPool,
      bucket: dataStack.bucket,
      table: dataStack.table,
      stateMachine: workflowStack.stateMachine,
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
          STATE_MACHINE_ARN: Match.objectLike({
            "Fn::ImportValue": Match.stringLikeRegexp(
              "^TestWorkflowStack:ExportsOutputRefTestStateMachine"
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
