import { handler } from "../../../lib/workflow/comprehend";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import {
  ComprehendClient,
  DetectKeyPhrasesCommand,
} from "@aws-sdk/client-comprehend";
import { mockClient } from "aws-sdk-client-mock";
import {
  MAXIMUM_NUMBER_OF_KEY_PHRASES,
  ProcessingLambdaInput,
} from "../../../lib/processing";
import { mockS3BodyStream } from "../utils";

// Mock AWS SDK clients
const s3Mock = mockClient(S3Client);
const comprehendMock = mockClient(ComprehendClient);

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
    bucketName,
    prefix,
  };

  beforeEach(() => {
    s3Mock.reset();
    comprehendMock.reset();
  });

  test("returns transcription and key phrases successfully", async () => {
    // Mock S3 response
    s3Mock.on(GetObjectCommand).resolves({
      Body: mockS3BodyStream(mockTranscriptionResult),
    });

    // Mock Comprehend response
    comprehendMock.on(DetectKeyPhrasesCommand).resolves({
      KeyPhrases: [{ Text: "test transcription", Score: 0.99 }],
    });

    const result = await handler(event, {} as any);

    expect(result.transcription).toBe(transcription);
    expect(result.prompt).toBe("test transcription");
  });

  test("falls back to truncated transcription if Comprehend fails", async () => {
    // Mock S3 response
    s3Mock.on(GetObjectCommand).resolves({
      Body: mockS3BodyStream(mockTranscriptionResult),
    });

    // Mock Comprehend failure
    comprehendMock
      .on(DetectKeyPhrasesCommand)
      .rejects(new Error("Comprehend failed"));

    const result = await handler(event, {} as any);

    expect(result.transcription).toBe(transcription);
    expect(result.prompt).toBe(transcription);
  });

  test("Limits the maximum number of key phrases", async () => {
    // Mock S3 response
    s3Mock.on(GetObjectCommand).resolves({
      Body: mockS3BodyStream(mockTranscriptionResult),
    });

    const mockKeyPhrases = Array.from(
      { length: MAXIMUM_NUMBER_OF_KEY_PHRASES + 1 },
      (_, i) => ({
        Text: i.toString(),
        Score: i === 0 ? 0 : 1 / i, // sorted descendend except 0
      })
    ); // Mock Comprehend response
    comprehendMock.on(DetectKeyPhrasesCommand).resolves({
      KeyPhrases: mockKeyPhrases,
    });

    const result = await handler(event, {} as any);
    const concatenatedIntegers = Array.from(
      { length: MAXIMUM_NUMBER_OF_KEY_PHRASES },
      (_, i) => i + 1
    ).join(", ");
    expect(result.prompt).toBe(concatenatedIntegers);
  });
});
