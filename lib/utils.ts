/**
 * File, table and processing-related utility functions.
 * Provides key configurations and helpers for handling audio, image, transcription, and DynamoDB schema.
 */

import { __MetadataBearer } from "@aws-sdk/client-s3";
import { AUDIO_FILENAME, IMAGE_FILENAME } from "./config/constants";

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
  createdAt: number; // Current time in epoch second format
  expireAt: number; // Unix timestamp in seconds for TTL
  executionID: string; // ARN of the Step Function Workflow execution
  processingStatus: ProcessingStatus; // Restricted processingStatus values
  transcription?: string; // Optional transcription text
  prompt?: string; // Optional prompt for image generation
}

/**
 * Helper function to calculate TTL timestamp.
 * @param currentTime - The current time in epoch second format
 * @returns The expireAt time (ITEM_EXPIRATION_DAYS from now) in epoch second format
 *
 */
export function calculateTTL(
  currentTime: number,
  itemExpirationDays: number
): number {
  // https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/time-to-live-ttl-before-you-start.html
  return currentTime + itemExpirationDays * 24 * 60 * 60;
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
