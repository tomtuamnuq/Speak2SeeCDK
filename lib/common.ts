export const audioFilename = "audio.wav";
export function createAPIGatewayResult(statusCode: number, body: string) {
  return {
    statusCode: statusCode,
    body: body,
    headers: {
      "Access-Control-Allow-Origin": "*", // TODO
      "Access-Control-Allow-Methods": "*",
    },
  };
}

// Schema definition with strongly typed attributes
export interface DynamoDBTableSchema {
  UUID: string; // primary key - used together with userID for queries
  userID: string; // User identifier - partition key
  createdAt: string; // ISO8601 timestamp
  status: "in progress" | "failed" | "finished"; // Restricted status values
  audio: string; // S3 link to WAV file
  transcription?: string; // Transcription text (optional)
  prompt?: string; // Prompt for image generation (optional)
  image?: string; // S3 link to JPEG file (optional)
}
