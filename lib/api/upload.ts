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
} from "./common";
import {
  DynamoDBTableSchema,
  getAudioKey,
  ProcessingStatus,
} from "../processing";
import { SFN } from "@aws-sdk/client-sfn";

const s3 = new S3();
const sfn = new SFN();
const dynamoDb = new DynamoDB();

async function handler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  try {
    const { bucketName, tableName, userID } = getEnvironment(event);
    const stateMachineArn = getStateMachineArn();

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

    // Start the Step Function workflow
    const startWorkflowResult = await sfn.startExecution({
      stateMachineArn: stateMachineArn,
      name: prefix,
      input: JSON.stringify({
        directoryName: prefix,
      }),
    });
    if (!startWorkflowResult.startDate || !startWorkflowResult.executionArn) {
      console.error(
        "Step function workflow is missing start date or executionArn",
        startWorkflowResult
      );
      throw new Error("Failed to start workflow");
    }
    const createdAt = startWorkflowResult.startDate.toISOString();

    // Create the DynamoDB entry
    const item: DynamoDBTableSchema = {
      userID: userID,
      itemID: prefix,
      createdAt: createdAt,
      executionID: startWorkflowResult.executionArn,
      processingStatus: ProcessingStatus.IN_PROGRESS,
    };

    const putItemResult = await dynamoDb.putItem({
      TableName: tableName,
      Item: {
        userID: { S: item.userID },
        itemID: { S: item.itemID },
        createdAt: { S: item.createdAt },
        executionID: { S: item.executionID },
        processingStatus: { S: item.processingStatus },
      },
    });

    if (!putItemResult || putItemResult.$metadata.httpStatusCode !== 200) {
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
