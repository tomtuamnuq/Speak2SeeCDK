import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import { handler } from "../../lib/api/upload";
import { audioFilename } from "../../lib/api/common";

// Mock AWS SDK clients
const s3Mock = mockClient(S3Client);
const dynamoDbMock = mockClient(DynamoDBClient);

describe("Upload Lambda Function", () => {
  const bucketName = "test-bucket";
  const tableName = "test-table";

  beforeEach(() => {
    // Reset mocks
    s3Mock.reset();
    dynamoDbMock.reset();

    // Set required environment variables
    process.env.BUCKET_NAME = bucketName;
    process.env.TABLE_NAME = tableName;
  });

  test("uploads audio to S3 and adds a valid item to DynamoDB", async () => {
    // Mock S3 and DynamoDB successful responses
    s3Mock
      .on(PutObjectCommand)
      .resolves({ $metadata: { httpStatusCode: 200 } });
    dynamoDbMock
      .on(PutItemCommand)
      .resolves({ $metadata: { httpStatusCode: 200 } });

    // Mock API Gateway event
    const mockEvent = {
      body: Buffer.from("dummy-audio-content").toString("base64"),
      isBase64Encoded: true,
      headers: {
        "Content-Type": "audio/wav",
      },
      requestContext: {
        authorizer: {
          claims: {
            sub: "mock-user-id",
          },
        },
      },
    };

    // Call the Lambda handler
    const response = await handler(mockEvent as any, {} as any);

    // Assertions
    expect(response.statusCode).toBe(200);
    const responseBody = JSON.parse(response.body);
    expect(responseBody).toHaveProperty("id");

    // Assert S3 was called to store the audio file
    expect(s3Mock.calls().length).toBe(1);
    const s3Call = s3Mock.calls()[0].args[0];
    expect(s3Call).toMatchObject({
      input: {
        Bucket: bucketName,
        Key: expect.stringMatching(audioFilename),
        ContentType: "audio/wav",
      },
    });

    // Assert DynamoDB was called
    expect(dynamoDbMock.calls().length).toBe(1);
    const dynamoCall = dynamoDbMock.calls()[0].args[0];
    // Validate the DynamoDB item
    expect(dynamoCall).toMatchObject({
      input: {
        TableName: tableName,
        Item: {
          userID: { S: "mock-user-id" },
          UUID: { S: expect.any(String) },
          createdAt: { S: expect.any(String) },
          status: { S: "in progress" },
          audio: {
            S: expect.stringMatching(audioFilename),
          },
        },
      },
    });
  });
});
