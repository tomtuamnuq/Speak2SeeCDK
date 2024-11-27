export const AUDIO_FILENAME = "audio.wav";
export const AUDIO_MEDIA_FORMAT = "wav";
export const IMAGE_FILENAME = "image.jpg";
export const TRANSCRIPTION_RESULT_FILENAME = "transcript.json";
export const TEXT2IMG_RESULT_FILENAME = "image.json";
export const WRITTEN_LANGUAGE_CODE = "en"; // TODO LanguageCode Enum in "@aws-sdk/client-comprehend"
export const SPOKEN_LANGUAGE_CODE = "en-US";
export const TRANSCRIBE_POLLING_INTERVAL = 5; // number of seconds to wait for Amazon Transcribe
export const WORKFLOW_TIMEOUT_DURATION = 1; // number of minutes to complete

export function getAudioKey(prefix: string) {
  // Define the S3 key for the audio file
  return `${prefix}/${AUDIO_FILENAME}`;
}
export function getImageKey(prefix: string) {
  // Define the S3 key for the generated image
  return `${prefix}/${IMAGE_FILENAME}`;
}
export enum ProcessingStatus {
  IN_PROGRESS = "in progress",
  FAILED = "failed",
  FINISHED = "finished",
}
// Schema definition with strongly typed attributes
export interface DynamoDBTableSchema {
  itemID: string; // primary key - used together with userID for queries
  userID: string; // User identifier - partition key
  createdAt: string; // ISO8601 timestamp
  executionID: string; // Arn of the Step Function Workflow execution
  processingStatus: ProcessingStatus; // Restricted processingStatus values
  transcription?: string; // Transcription text (optional)
  prompt?: string; // Prompt for image generation (optional)
}
