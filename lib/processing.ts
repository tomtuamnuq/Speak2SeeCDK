/**
 * File and processing-related constants and utility functions.
 * Provides key configurations and helpers for handling audio, image, transcription, and DynamoDB schema.
 */

import { __MetadataBearer } from "@aws-sdk/client-s3";

// Constants for filenames and configurations
export const AUDIO_FILENAME = "audio.wav"; // Default filename for uploaded audio
export const AUDIO_MEDIA_FORMAT = "wav"; // Audio format used for Transcribe
export const IMAGE_FILENAME = "image.jpg"; // Default filename for generated image
export const TRANSCRIPTION_RESULT_FILENAME = "transcript.json"; // Filename for transcription result
export const TEXT2IMG_RESULT_FILENAME = "image.json"; // Filename for text-to-image result
// TODO LanguageCode Enum in "@aws-sdk/client-comprehend"
export const WRITTEN_LANGUAGE_CODE = "en"; // Language code for Comprehend operations
export const MAXIMUM_NUMBER_OF_KEY_PHRASES = 10; // Maximum key phrases to extract
export const SPOKEN_LANGUAGE_CODE = "en-US"; // Language code for Transcribe
export const TRANSCRIBE_POLLING_INTERVAL = 15; // Polling interval in seconds for Transcribe
export const WORKFLOW_TIMEOUT_DURATION = 1; // Workflow timeout in minutes

/**
 * Generates the S3 key for the audio file.
 * @param prefix - The unique identifier (UUID) for the processing task.
 * @returns The S3 key for the audio file.
 */
export function getAudioKey(prefix: string): string {
  return `${prefix}/${AUDIO_FILENAME}`;
}

/**
 * Generates the S3 key for the generated image file.
 * @param prefix - The unique identifier (UUID) for the processing task.
 * @returns The S3 key for the image file.
 */
export function getImageKey(prefix: string): string {
  return `${prefix}/${IMAGE_FILENAME}`;
}

/**
 * Enum for processing statuses.
 * Represents the various states of an audio/image processing task.
 */
export enum ProcessingStatus {
  IN_PROGRESS = "in progress",
  TRANSCRIPTION_FAILED = "audio transcription failed",
  IMAGE_FAILED = "image generation failed",
  FINISHED = "finished",
}

/**
 * Checks if a transcription has not yet been created based on the processing status.
 * @param status - The current processing status.
 * @returns `true` if the transcription is not available; otherwise, `false`.
 */
export function transcriptionHasNotBeenCreated(
  status: ProcessingStatus
): boolean {
  return (
    status !== ProcessingStatus.IMAGE_FAILED &&
    status !== ProcessingStatus.FINISHED
  );
}

/**
 * DynamoDB table schema definition with strongly typed attributes.
 */
export interface DynamoDBTableSchema {
  itemID: string; // Primary key - used together with userID for queries
  userID: string; // User identifier - partition key
  createdAt: string; // ISO8601 timestamp
  executionID: string; // ARN of the Step Function Workflow execution
  processingStatus: ProcessingStatus; // Restricted processingStatus values
  transcription?: string; // Optional transcription text
  prompt?: string; // Optional prompt for image generation
}

/**
 * Input schema for Lambda processing tasks.
 */
export interface ProcessingLambdaInput {
  prefix: string; // Unique identifier for the processing task
}

/**
 * Output schema for Lambda processing tasks.
 */
export interface ProcessingLambdaOutput {
  transcription: string; // Transcription text
  prompt: string; // Generated prompt for image creation
}

/**
 * Input schema for the final processing Lambda.
 */
export interface FinalLambdaInput {
  prefix: string; // Unique identifier for the processing task
  userID: string; // User identifier
  transcription: string; // Transcription text
  prompt: string; // Generated prompt
}

/**
 * Retrieves the S3 bucket name from environment variables.
 * @throws Error if BUCKET_NAME is not defined.
 * @returns The name of the S3 bucket.
 */
export function getBucketName(): string {
  const bucketName = process.env.BUCKET_NAME;
  if (!bucketName) {
    throw new Error("Bucket name not specified in environment variables.");
  }
  return bucketName;
}

/**
 * Retrieves the DynamoDB table name from environment variables.
 * @throws Error if TABLE_NAME is not defined.
 * @returns The name of the DynamoDB table.
 */
export function getTableName(): string {
  const tableName = process.env.TABLE_NAME;
  if (!tableName) {
    throw new Error("Table name not specified in environment variables.");
  }
  return tableName;
}

/**
 * Checks if an HTTP request failed based on its metadata.
 * @param response - The metadata of the AWS SDK response.
 * @returns `true` if the HTTP status code is not 200; otherwise, `false`.
 */
export function requestFailed(response: __MetadataBearer): boolean {
  return response.$metadata.httpStatusCode !== 200;
}
