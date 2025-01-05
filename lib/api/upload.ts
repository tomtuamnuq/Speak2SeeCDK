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
  projectTableItem,
  getEnvironment,
  getStateMachineArn,
} from "./api-utils";
import {
  calculateTTL,
  DynamoDBTableSchema,
  getAudioKey,
  ProcessingStatus,
  requestFailed,
} from "../utils";
import { EXPRESS_SIZE_THRESHOLD } from "../config/constants";
import { SFN } from "@aws-sdk/client-sfn";

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
    const useExpress = audioBuffer.length < EXPRESS_SIZE_THRESHOLD;
    const stateMachineArn = getStateMachineArn(useExpress);
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
      expireAt: calculateTTL(createdAt),
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

    return createAPIGatewayResult(200, JSON.stringify(projectTableItem(item)));
  } catch (error) {
    console.error("Error processing upload:", error);
    return createAPIGatewayResult(
      500,
      JSON.stringify({ message: "Internal server error" })
    );
  }
}

export { handler };
