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
  getEnvironment,
  getStateMachineArn,
  getItemExpirationDays,
} from "./api-utils";
import {
  calculateTTL,
  DynamoDBTableSchema,
  getAudioKey,
  requestFailed,
} from "../utils";
import { ProcessingStatus } from "../../shared/common-utils";
import { SFN } from "@aws-sdk/client-sfn";
import { MAX_BINARY_AUDIO_SIZE } from "../config/constants";
import { ProcessingItem } from "../../shared/types";

const s3 = new S3();
const sfn = new SFN();
const dynamoDb = new DynamoDB();
/**
 * Lambda function to handle file uploads, start a Step Function workflow, and create a DynamoDB entry.
 * @param event - The API Gateway event containing the upload request and audio file data.
 * @param context - The Lambda execution context.
 * @returns An API Gateway response with the created item details or an error message.
 */
async function handler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  try {
    const { bucketName, tableName, userID } = getEnvironment(event);
    const itemExpirationDays = getItemExpirationDays();
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
    if (audioBuffer.length > MAX_BINARY_AUDIO_SIZE) {
      return createAPIGatewayResult(
        413,
        JSON.stringify({
          message: `File too large. Maximum size is 3MB (approximately 1 minute).`,
        })
      );
    }
    const stateMachineArn = getStateMachineArn();
    // Generate a UUID as directory name (S3 prefix)
    const prefix = randomUUID();
    // Upload the audio file to S3
    const putObjectResult = await s3.putObject({
      Bucket: bucketName,
      Key: getAudioKey(prefix),
      Body: audioBuffer,
      ContentType: "audio/wav",
    });

    if (requestFailed(putObjectResult)) {
      console.error("Failed to upload audio to S3", putObjectResult);
      throw new Error("Failed to upload audio file to S3");
    }

    // Start the Step Function workflow
    const input = {
      userID: userID,
      prefix: prefix,
    };
    const startWorkflowResult = await sfn.startExecution({
      stateMachineArn: stateMachineArn,
      name: prefix,
      input: JSON.stringify({
        input,
      }),
    });
    if (!startWorkflowResult.startDate || !startWorkflowResult.executionArn) {
      console.error(
        "Step function workflow is missing start date or executionArn",
        startWorkflowResult
      );
      throw new Error("Failed to start workflow");
    }
    const createdAt = Math.floor(
      startWorkflowResult.startDate.getTime() / 1000
    ); // Get the current time in epoch second format

    // Create the DynamoDB entry
    const item: DynamoDBTableSchema = {
      userID: userID,
      itemID: prefix,
      createdAt: createdAt,
      expireAt: calculateTTL(createdAt, itemExpirationDays),
      executionID: startWorkflowResult.executionArn,
      processingStatus: ProcessingStatus.IN_PROGRESS,
    };

    const putItemResult = await dynamoDb.putItem({
      TableName: tableName,
      Item: {
        userID: { S: item.userID },
        itemID: { S: item.itemID },
        createdAt: { N: item.createdAt.toString() },
        expireAt: { N: item.expireAt.toString() },
        executionID: { S: item.executionID },
        processingStatus: { S: item.processingStatus },
      },
    });

    if (requestFailed(putItemResult)) {
      console.error("Failed to create DynamoDB item", putItemResult);
      throw new Error("Failed to create DynamoDB item");
    }
    const uploadResponse: ProcessingItem = {
      id: item.itemID,
      createdAt: item.createdAt,
      processingStatus: item.processingStatus,
    };

    return createAPIGatewayResult(200, JSON.stringify(uploadResponse));
  } catch (error) {
    console.error("Error processing upload:", error);
    return createAPIGatewayResult(
      500,
      JSON.stringify({ message: "Internal server error" })
    );
  }
}

export { handler };
