import { S3 } from "@aws-sdk/client-s3";
import { DynamoDB } from "@aws-sdk/client-dynamodb";
import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from "aws-lambda";
import { randomUUID } from "crypto";
import {
  createAPIGatewayResult,
  DynamoDBTableSchema,
  getAudioKey,
  getEnvironment,
} from "./common";

const s3 = new S3();
const dynamoDb = new DynamoDB();

async function handler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  try {
    const { bucketName, tableName, userID } = getEnvironment(event);

    // Get the audio file from the request body (binary data)
    const body = event.body;
    const isBase64Encoded = event.isBase64Encoded;

    if (!body) {
      return createAPIGatewayResult(
        400,
        JSON.stringify({ message: "No file uploaded" })
      );
    }

    // Generate a UUID as directory name (S3 prefix)
    const prefix = randomUUID();
    // Decode the base64-encoded binary data
    const audioBuffer = Buffer.from(body, isBase64Encoded ? "base64" : "utf-8");

    // Upload the audio file to S3
    const putObjectResult = await s3.putObject({
      Bucket: bucketName,
      Key: getAudioKey(prefix),
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
    };

    const putItemResult = await dynamoDb.putItem({
      TableName: tableName,
      Item: {
        userID: { S: item.userID },
        UUID: { S: item.UUID },
        createdAt: { S: item.createdAt },
        status: { S: item.status },
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
