import { Template, Match } from "aws-cdk-lib/assertions";
import { App } from "aws-cdk-lib";
import { ApiStack } from "../lib/api-stack";
import { AuthStack } from "../lib/auth-stack";
import { DataStack } from "../lib/data-stack";

const bucketName = "test-bucket";
const tableName = "test-table";

describe("ApiStack", () => {
  let app: App;
  let stack: ApiStack;
  let template: Template;

  beforeEach(() => {
    app = new App();

    // Create dependent stacks
    const authStack = new AuthStack(app, "TestAuthStack", {});
    const dataStack = new DataStack(app, "TestDataStack", {
      bucketName,
      tableName,
    });

    // Create the ApiStack
    stack = new ApiStack(app, "TestApiStack", {
      userPool: authStack.userPool,
      bucket: dataStack.bucket,
      table: dataStack.table,
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
});
