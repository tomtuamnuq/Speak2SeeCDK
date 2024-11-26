import { Template } from "aws-cdk-lib/assertions";
import { DataStack } from "../../lib/data-stack";
import { App } from "aws-cdk-lib";
const testBucketName = "test-bucket-name";
const testTableName = "test-table-name";
describe("DataStack", () => {
  const app = new App();

  const stack = new DataStack(app, "TestDataStack", {
    bucketName: testBucketName,
    tableName: testTableName,
  });

  const template = Template.fromStack(stack);

  test("creates a DynamoDB table with correct schema", () => {
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      TableName: testTableName,
      KeySchema: [
        { AttributeName: "userID", KeyType: "HASH" }, // Partition key
        { AttributeName: "itemID", KeyType: "RANGE" }, // Sort key
      ],
      AttributeDefinitions: [
        { AttributeName: "userID", AttributeType: "S" },
        { AttributeName: "itemID", AttributeType: "S" },
      ],
      BillingMode: "PAY_PER_REQUEST",
    });
  });

  test("S3 bucket is not publicly accessible", () => {
    // Check that the bucket has PublicAccessBlockConfiguration to block public access
    template.hasResourceProperties("AWS::S3::Bucket", {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });
});
