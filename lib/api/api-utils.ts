import { APIGatewayProxyEvent } from "aws-lambda";
import {
  DynamoDBTableSchema,
  getBucketName,
  getTableName,
  ProcessingStatus,
} from "../utils";

interface UploadResponse {
  id: string;
  createdAt: number;
  processingStatus: ProcessingStatus;
}

/**
 * Projects a DynamoDB table item into a structured response object.
 * @param item - The DynamoDB table item to project.
 * @returns An object containing the item's ID, creation timestamp, and processing status.
 */
export function projectTableItem(item: DynamoDBTableSchema): UploadResponse {
  return {
    id: item.itemID,
    createdAt: item.createdAt,
    processingStatus: item.processingStatus,
  };
}

/**
 * Creates a standardized API Gateway response object.
 * @param statusCode - The HTTP status code for the response.
 * @param body - The stringified JSON body for the response.
 * @returns An object with status code, body, and CORS headers.
 */
export function createAPIGatewayResult(statusCode: number, body: string) {
  return {
    statusCode: statusCode,
    body: body,
    headers: {
      "Access-Control-Allow-Origin": "*", // TODO: Restrict origins in production
      "Access-Control-Allow-Methods": "*",
    },
  };
}

/**
 * Extracts the user ID from the API Gateway event's request context.
 * @param event - The API Gateway event.
 * @throws Error if user ID is not found in the request context.
 * @returns The user ID as a string.
 */
export function getUserID(event: APIGatewayProxyEvent): string {
  const userID = event.requestContext?.authorizer?.claims?.sub;
  if (!userID) {
    throw new Error("User ID not found in the request context.");
  }
  return userID;
}

/**
 * Retrieves the environment variables and user ID required for processing.
 * @param event - The API Gateway event.
 * @returns An object containing the bucket name, table name, and user ID.
 */
export function getEnvironment(event: APIGatewayProxyEvent) {
  return {
    bucketName: getBucketName(),
    tableName: getTableName(),
    userID: getUserID(event),
  };
}

/**
 * Retrieves the State Machine ARN from environment variables.
 * @throws Error if STATE_MACHINE_ARN is not defined.
 * @returns The State Machine ARN as a string.
 */
export function getStateMachineArn(): string {
  const stateMachineArn = process.env.STATE_MACHINE_ARN;
  if (!stateMachineArn) {
    throw new Error(
      "State Machine ARN not specified in environment variables."
    );
  }
  return stateMachineArn;
}

/**
 * Retrieves the item expiration days from environment variables.
 * @throws Error if ITEM_EXPIRATION_DAYS is not defined.
 * @returns The number of days until an item gets deleted.
 */
export function getItemExpirationDays(): number {
  const itemExpirationDays = process.env.ITEM_EXPIRATION_DAYS;
  if (!itemExpirationDays) {
    throw new Error(
      "Number of days for keeping records in DynamoDB is not specified in environment variables!"
    );
  }
  return Number(itemExpirationDays);
}
