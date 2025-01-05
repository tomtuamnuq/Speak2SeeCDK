import { handler } from "../../../lib/workflow/image-prompt";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { mockClient } from "aws-sdk-client-mock";
import { ProcessingLambdaInput } from "../../../lib/utils";
import { mockS3BodyStream } from "../utils";
import { Uint8ArrayBlobAdapter } from "@smithy/util-stream";

// Mock AWS SDK clients
const s3Mock = mockClient(S3Client);
const bedrockMock = mockClient(BedrockRuntimeClient);

describe("Processing Lambda Function", () => {
  const bucketName = "test-bucket";
  const prefix = "test-prefix";
  const transcription = "This is a test transcription.";
  const mockTranscriptionResult = JSON.stringify({
    results: {
      transcripts: [{ transcript: transcription }],
    },
  });
  const event: ProcessingLambdaInput = {
    prefix,
  };

  beforeEach(() => {
    s3Mock.reset();
    bedrockMock.reset();
    process.env.BUCKET_NAME = bucketName;
  });

  test("returns transcription and generated prompt successfully", async () => {
    // Mock S3 response
    s3Mock.on(GetObjectCommand).resolves({
      Body: mockS3BodyStream(mockTranscriptionResult),
    });

    // Mock Bedrock response
    const mockBedrockResponse = {
      body: Uint8ArrayBlobAdapter.fromString(
        JSON.stringify({
          results: [
            { outputText: "A serene landscape with dramatic lighting" },
          ],
        })
      ),
    };
    bedrockMock.on(InvokeModelCommand).resolves(mockBedrockResponse);

    const result = await handler(event, {} as any);
    expect(result.transcription).toBe(transcription);
    expect(result.prompt).toBe("A serene landscape with dramatic lighting");

    // Verify Bedrock was called with correct parameters
    const bedrockCalls = bedrockMock.commandCalls(InvokeModelCommand);
    expect(bedrockCalls.length).toBe(1);
  });

  test("falls back to truncated transcription if Bedrock fails", async () => {
    // Mock S3 response
    s3Mock.on(GetObjectCommand).resolves({
      Body: mockS3BodyStream(mockTranscriptionResult),
    });

    // Mock Bedrock failure
    bedrockMock.on(InvokeModelCommand).rejects(new Error("Bedrock failed"));

    const result = await handler(event, {} as any);
    expect(result.transcription).toBe(transcription);
    expect(result.prompt).toBe(transcription);
  });

  test("truncates long prompts to maximum length", async () => {
    // Mock S3 response
    s3Mock.on(GetObjectCommand).resolves({
      Body: mockS3BodyStream(mockTranscriptionResult),
    });

    // Create a very long response
    const longPrompt = "A".repeat(1000);
    const mockBedrockResponse = {
      body: Uint8ArrayBlobAdapter.fromString(
        JSON.stringify({
          results: [{ outputText: longPrompt }],
        })
      ),
    };
    bedrockMock.on(InvokeModelCommand).resolves(mockBedrockResponse);

    const result = await handler(event, {} as any);
    expect(result.prompt.length).toBeLessThanOrEqual(512);
  });

  test("throws error if S3 fails", async () => {
    // Mock S3 failure
    s3Mock.on(GetObjectCommand).rejects(new Error("S3 failed"));

    await expect(handler(event, {} as any)).rejects.toThrow("S3 failed");
  });
});
