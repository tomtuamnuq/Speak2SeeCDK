import { handler } from "../../../lib/workflow/finalize";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import { mockS3BodyStream } from "../utils";
import { FinalLambdaInput } from "../../../lib/processing";

// Mock AWS SDK clients
const s3Mock = mockClient(S3Client);
const dynamoDbMock = mockClient(DynamoDBClient);

describe("Finalize Lambda Function", () => {
  const bucketName = "test-bucket";
  const tableName = "test-table";
  const prefix = "test-prefix";
  const userID = "test-user-id";
  const transcription = "Test transcription.";
  const prompt = "Generated prompt.";
  const mockImageBase64 = Buffer.from("mock-image", "utf-8").toString("base64");
  const mockEvent: FinalLambdaInput = {
    prefix,
    userID,
    transcription,
    prompt,
  };

  beforeEach(() => {
    s3Mock.reset();
    dynamoDbMock.reset();
    process.env.BUCKET_NAME = bucketName;
    process.env.TABLE_NAME = tableName;
  });

  test("successfully processes and updates DynamoDB with processing results", async () => {
    // Mock S3 getObject response for reading JSON
    const mockImageJson = JSON.stringify({
      images: [mockImageBase64],
    });

    s3Mock.on(GetObjectCommand).resolves({
      Body: mockS3BodyStream(mockImageJson),
    });

    // Mock S3 putObject response for saving the image
    s3Mock.on(PutObjectCommand).resolves({
      $metadata: { httpStatusCode: 200 },
    });

    // Mock DynamoDB updateItem response
    dynamoDbMock.on(UpdateItemCommand).resolves({
      $metadata: { httpStatusCode: 200 },
    });

    // Call the Lambda handler
    await handler(mockEvent, {} as any);

    // Assert S3 was called to retrieve images and save the final image
    expect(s3Mock.calls().length).toBe(2);

    // Assert DynamoDB was called
    expect(dynamoDbMock.calls().length).toBe(1);
  });

  test("throws an error if the image JSON is missing", async () => {
    // Mock S3 getObject response to return an empty JSON
    const mockImageJson = JSON.stringify({ images: [] });

    s3Mock.on(GetObjectCommand).resolves({
      Body: mockS3BodyStream(mockImageJson),
    });

    await expect(handler(mockEvent, {} as any)).rejects.toThrow(
      "No images found in response images array."
    );
  });

  test("throws an error if DynamoDB update fails", async () => {
    // Mock S3 getObject response for reading JSON
    const mockImageJson = JSON.stringify({
      images: [mockImageBase64],
    });

    s3Mock.on(GetObjectCommand).resolves({
      Body: mockS3BodyStream(mockImageJson),
    });

    // Mock S3 putObject response for saving the image
    s3Mock.on(PutObjectCommand).resolves({
      $metadata: { httpStatusCode: 200 },
    });

    // Mock DynamoDB updateItem to fail
    dynamoDbMock
      .on(UpdateItemCommand)
      .rejects(
        new Error("Failed to update DynamoDB item with processing result.")
      );

    await expect(handler(mockEvent, {} as any)).rejects.toThrow(
      "Failed to update DynamoDB item with processing result."
    );
  });
});
