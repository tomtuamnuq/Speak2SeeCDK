export const AUDIO_FILENAME = "audio.wav";
export const IMAGE_FILENAME = "image.jpg";
export const TRANSCRIPTION_RESULT_FILENAME = "transcript.json";
export const TEXT2IMG_RESULT_FILENAME = "image.json";

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
  processingStatus: ProcessingStatus; // Restricted processingStatus values
  transcription?: string; // Transcription text (optional)
  prompt?: string; // Prompt for image generation (optional)
}
