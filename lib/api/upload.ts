import { S3 } from "@aws-sdk/client-s3";
import { DynamoDB } from "@aws-sdk/client-dynamodb";
import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from "aws-lambda";
import { randomUUID } from "crypto";
import {
  audioFilename,
  createAPIGatewayResult,
  DynamoDBTableSchema,
} from "../common";

const s3 = new S3();
const dynamoDb = new DynamoDB();

async function handler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  try {
    // Generate a UUID as directory name (S3 prefix)
    const prefix = randomUUID();

    const bucketName = process.env.BUCKET_NAME;
    const tableName = process.env.TABLE_NAME;

    if (!bucketName) {
      throw new Error("Bucket name not specified in environment variables.");
    }

    if (!tableName) {
      throw new Error("Table name not specified in environment variables.");
    }

    // Extract the user ID from the request context (Cognito identity)
    const userID = event.requestContext?.authorizer?.claims?.sub;
    if (!userID) {
      throw new Error("User ID not found in the request context.");
    }

    // Get the audio file from the request body (binary data)
    const body = event.body;
    const isBase64Encoded = event.isBase64Encoded;

    if (!body) {
      return createAPIGatewayResult(
        400,
        JSON.stringify({ message: "No file uploaded" })
      );
    }

    // Decode the base64-encoded binary data
    const audioBuffer = Buffer.from(body, isBase64Encoded ? "base64" : "utf-8");

    // Define the S3 key for the audio file
    const audioKey = `${prefix}/${audioFilename}`;

    // Upload the audio file to S3
    const putObjectResult = await s3.putObject({
      Bucket: bucketName,
      Key: audioKey,
      Body: audioBuffer,
      ContentType: "audio/wav",
    });

    if (!putObjectResult || putObjectResult.$metadata.httpStatusCode !== 200) {
      console.error("Failed to upload audio to S3", putObjectResult);
      throw new Error("Failed to upload audio file to S3");
    }

    // Create the DynamoDB entry
    const item: DynamoDBTableSchema = {
      userID: userID,
      UUID: prefix,
      createdAt: new Date().toISOString(),
      status: "in progress",
      audio: `s3://${bucketName}/${audioKey}`,
    };

    const putItemResult = await dynamoDb.putItem({
      TableName: tableName,
      Item: {
        userID: { S: item.userID },
        UUID: { S: item.UUID },
        createdAt: { S: item.createdAt },
        status: { S: item.status },
        audio: { S: item.audio },
      },
    });

    if (!putItemResult || putItemResult.$metadata.httpStatusCode !== 200) {
      console.error("Failed to create DynamoDB item", putItemResult);
      throw new Error("Failed to create DynamoDB item");
    }

    // Return the UUID to the client
    return createAPIGatewayResult(
      200,
      JSON.stringify({
        id: prefix,
      })
    );
  } catch (error) {
    console.error("Error processing upload:", error);
    return createAPIGatewayResult(
      500,
      JSON.stringify({ message: "Internal server error" })
    );
  }
}

export { handler };
