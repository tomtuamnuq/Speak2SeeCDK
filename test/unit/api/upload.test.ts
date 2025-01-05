import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import { mockClient } from "aws-sdk-client-mock";
import { handler } from "../../../lib/api/upload";
import { ProcessingStatus } from "../../../lib/utils";

// Mock AWS SDK clients
const s3Mock = mockClient(S3Client);
const dynamoDbMock = mockClient(DynamoDBClient);
const sfnMock = mockClient(SFNClient);

describe("Upload Lambda Function", () => {
  const mockBucket = "test-bucket";
  const mockTable = "test-table";
  const mockUserId = "mock-user-id";
  const mockExecutionArn = "mock-execution";
  const mockTime = new Date("2024-11-23T15:30:45.000Z");

  beforeEach(() => {
    // Reset mocks
    s3Mock.reset();
    dynamoDbMock.reset();
    sfnMock.reset();

    // Set required environment variables
    process.env.BUCKET_NAME = mockBucket;
    process.env.TABLE_NAME = mockTable;
    process.env.STATE_MACHINE_STANDARD_ARN = "mock-state-machine-standard";
    process.env.STATE_MACHINE_EXPRESS_ARN = "mock-state-machine-express";
    process.env.ITEM_EXPIRATION_DAYS = "1";
  });

  test("uploads audio to S3, starts the workflow, and adds a valid item to DynamoDB", async () => {
    // Mock S3, Step Functions, and DynamoDB successful responses
    s3Mock
      .on(PutObjectCommand)
      .resolves({ $metadata: { httpStatusCode: 200 } });
    sfnMock.on(StartExecutionCommand).resolves({
      executionArn: mockExecutionArn,
      startDate: mockTime,
    });
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
            sub: mockUserId,
          },
        },
      },
    };

    // Call the Lambda handler
    const response = await handler(mockEvent as any, {} as any);

    // Assertions
    expect(response.statusCode).toBe(200);
    const responseBody = JSON.parse(response.body);
    expect(responseBody).toEqual({
      id: expect.any(String),
      createdAt: mockTime.getTime() / 1000,
      processingStatus: ProcessingStatus.IN_PROGRESS,
    });

    // Assert S3 was called to store the audio file
    expect(s3Mock.calls().length).toBe(1);

    // Assert Step Functions was called to start the workflow
    expect(sfnMock.calls().length).toBe(1);

    // Assert DynamoDB was called
    expect(dynamoDbMock.calls().length).toBe(1);
  });
});
