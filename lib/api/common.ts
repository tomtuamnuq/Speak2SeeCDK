import { APIGatewayProxyEvent } from "aws-lambda";

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
/**
 * Retrieves the S3 bucket name from environment variables.
 * @throws Error if BUCKET_NAME is not defined.
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
 */
export function getTableName(): string {
  const tableName = process.env.TABLE_NAME;
  if (!tableName) {
    throw new Error("Table name not specified in environment variables.");
  }
  return tableName;
}

/**
 * Extracts the user ID from the API Gateway event's request context.
 * @param event - The API Gateway event.
 * @throws Error if user ID is not found in the request context.
 */
export function getUserID(event: APIGatewayProxyEvent): string {
  const userID = event.requestContext?.authorizer?.claims?.sub;
  if (!userID) {
    throw new Error("User ID not found in the request context.");
  }
  return userID;
}

export function getEnvironment(event: APIGatewayProxyEvent) {
  return {
    bucketName: getBucketName(),
    tableName: getTableName(),
    userID: getUserID(event),
  };
}
