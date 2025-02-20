import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import { handler } from "../../../lib/api/get";
import { getAudioKey, getImageKey } from "../../../lib/utils";
import { ProcessingStatus } from "../../../shared/common-utils";
import { encodeBase64, mockS3BodyStream } from "../utils";

// Mock AWS SDK clients
const s3Mock = mockClient(S3Client);
const dynamoDbMock = mockClient(DynamoDBClient);

describe("Get Lambda Function", () => {
  const bucketName = "test-bucket";
  const tableName = "test-table";
  const userID = "mock-user-id";
  const itemID = "mock-itemID";
  const audioFile = "mock-audio";
  const imageFile = "mock-image";

  beforeEach(() => {
    // Reset mocks
    s3Mock.reset();
    dynamoDbMock.reset();

    // Set required environment variables
    process.env.BUCKET_NAME = bucketName;
    process.env.TABLE_NAME = tableName;
  });

  test("returns audio and image when processing is finished", async () => {
    // Mock DynamoDB successful response for finished processingStatus
    dynamoDbMock.on(GetItemCommand).resolves({
      $metadata: { httpStatusCode: 200 },
      Item: {
        userID: { S: userID },
        itemID: { S: itemID },
        processingStatus: { S: "finished" },
        transcription: { S: "mock transcription" },
        prompt: { S: "mock prompt" },
      },
    });

    // Mock S3 successful response for audio and image
    s3Mock
      .on(GetObjectCommand, {
        Bucket: bucketName,
        Key: getAudioKey(itemID),
      })
      .resolves({
        $metadata: { httpStatusCode: 200 },
        Body: mockS3BodyStream(audioFile),
      });

    s3Mock
      .on(GetObjectCommand, {
        Bucket: bucketName,
        Key: getImageKey(itemID),
      })
      .resolves({
        $metadata: { httpStatusCode: 200 },
        Body: mockS3BodyStream(imageFile),
      });

    // Mock API Gateway event
    const mockEvent = {
      pathParameters: { itemID },
      requestContext: {
        authorizer: { claims: { sub: userID } },
      },
    };

    // Call the Lambda handler
    const response = await handler(mockEvent as any, {} as any);

    // Assertions
    expect(response.statusCode).toBe(200);
    const responseBody = JSON.parse(response.body);
    expect(responseBody).toEqual({
      audio: encodeBase64(audioFile),
      image: encodeBase64(imageFile),
      transcription: "mock transcription",
      prompt: "mock prompt",
      processingStatus: "finished",
    });

    // Verify calls
    expect(s3Mock.calls().length).toBe(2);
    expect(dynamoDbMock.calls().length).toBe(1);
  });

  test("returns only audio when audio processing has failed", async () => {
    // Mock DynamoDB successful response for failed processingStatus
    dynamoDbMock.on(GetItemCommand).resolves({
      $metadata: { httpStatusCode: 200 },
      Item: {
        userID: { S: userID },
        itemID: { S: itemID },
        processingStatus: { S: "audio transcription failed" },
      },
    });

    // Mock S3 successful response for audio only
    s3Mock
      .on(GetObjectCommand, {
        Bucket: bucketName,
        Key: getAudioKey(itemID),
      })
      .resolves({
        $metadata: { httpStatusCode: 200 },
        Body: mockS3BodyStream(audioFile),
      });

    // Mock API Gateway event
    const mockEvent = {
      pathParameters: { itemID },
      requestContext: {
        authorizer: { claims: { sub: userID } },
      },
    };

    // Call the Lambda handler
    const response = await handler(mockEvent as any, {} as any);

    // Assertions
    expect(response.statusCode).toBe(200);
    const responseBody = JSON.parse(response.body);
    expect(responseBody).toEqual({
      audio: encodeBase64(audioFile),
      processingStatus: ProcessingStatus.TRANSCRIPTION_FAILED,
    });

    // Verify calls
    expect(s3Mock.calls().length).toBe(1);
    expect(dynamoDbMock.calls().length).toBe(1);
  });
});
