import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import { handler } from "../../lib/api/get";
import { getAudioKey, getImageKey } from "../../lib/api/common";
import { sdkStreamMixin } from "@smithy/util-stream";
import { Readable } from "stream";

// Mock AWS SDK clients
const s3Mock = mockClient(S3Client);
const dynamoDbMock = mockClient(DynamoDBClient);

function mockS3BodyStream(body: string) {
  const stream = new Readable();
  stream.push(body);
  stream.push(null);
  return sdkStreamMixin(stream);
}
function encodeBase64(body: string) {
  return Buffer.from(body).toString("base64");
}
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
    // Mock DynamoDB successful response for finished status
    dynamoDbMock.on(GetItemCommand).resolves({
      $metadata: { httpStatusCode: 200 },
      Item: {
        userID: { S: userID },
        itemID: { S: itemID },
        status: { S: "finished" },
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
      status: "finished",
    });

    // Verify calls
    expect(s3Mock.calls().length).toBe(2);
    expect(dynamoDbMock.calls().length).toBe(1);
  });

  test("returns only audio when processing has failed", async () => {
    // Mock DynamoDB successful response for failed status
    dynamoDbMock.on(GetItemCommand).resolves({
      $metadata: { httpStatusCode: 200 },
      Item: {
        userID: { S: userID },
        itemID: { S: itemID },
        status: { S: "failed" },
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
      status: "failed",
    });

    // Verify calls
    expect(s3Mock.calls().length).toBe(1);
    expect(dynamoDbMock.calls().length).toBe(1);
  });
});
