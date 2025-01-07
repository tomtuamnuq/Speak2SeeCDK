import { S3 } from "@aws-sdk/client-s3";
import { DynamoDB } from "@aws-sdk/client-dynamodb";
import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from "aws-lambda";
import { createAPIGatewayResult, getEnvironment } from "./api-utils";
import { getAudioKey, getImageKey } from "../utils";
import {
  ProcessingStatus,
  transcriptionHasNotBeenCreated,
} from "../../shared/common-utils";
import { ItemDetails } from "../../shared/types";

const s3 = new S3();
const dynamoDb = new DynamoDB();
/**
 * Handles requests to retrieve processing results by item ID.
 * @param event - The API Gateway event containing the request details.
 * @param context - The Lambda execution context.
 * @returns An API Gateway response with the requested data or an error message.
 */
async function handler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  try {
    const { bucketName, tableName, userID } = getEnvironment(event);

    const itemID = event.pathParameters?.itemID;
    if (!itemID) {
      return createAPIGatewayResult(
        400,
        JSON.stringify({ message: "Processing ID is required" })
      );
    }

    // Fetch the entry from DynamoDB
    const getItemResult = await dynamoDb.getItem({
      TableName: tableName,
      Key: {
        userID: { S: userID },
        itemID: { S: itemID },
      },
    });

    if (!getItemResult.Item) {
      return createAPIGatewayResult(
        404,
        JSON.stringify({
          message: "No upload found for the given user and processing ID!",
        })
      );
    }

    const item = getItemResult.Item;
    const audioBlob = await getS3Blob(bucketName, getAudioKey(itemID));
    const processingStatus = item.processingStatus.S! as ProcessingStatus;
    if (transcriptionHasNotBeenCreated(processingStatus)) {
      return createAPIGatewayResult(
        200,
        JSON.stringify({
          audio: audioBlob,
          processingStatus: processingStatus,
        })
      );
    }
    const transcription = item.transcription?.S;
    if (!transcription) {
      throw new Error("Missing transcription for finished audio processing!");
    }
    const prompt = item.prompt?.S;
    if (!prompt) {
      throw new Error("Missing prompt for finished audio processing!");
    }
    let imageBlob = "";
    // If processingStatus is 'finished', fetch additional data
    if (processingStatus === ProcessingStatus.FINISHED) {
      imageBlob = await getS3Blob(bucketName, getImageKey(itemID));
    }
    const getResponse: ItemDetails = {
      audio: audioBlob,
      image: imageBlob,
      transcription: transcription,
      prompt: prompt,
      processingStatus: processingStatus,
    };
    return createAPIGatewayResult(200, JSON.stringify(getResponse));
  } catch (error) {
    console.error("Error processing request:", error);
    return createAPIGatewayResult(
      500,
      JSON.stringify({ message: "Internal server error" })
    );
  }
}
/**
 * Fetches a base64-encoded blob from S3 for the given bucket and key.
 * @param bucketName - The name of the S3 bucket.
 * @param key - The key of the object in the S3 bucket.
 * @returns A base64-encoded string representing the blob.
 * @throws Error if the object is missing or cannot be retrieved.
 */
async function getS3Blob(bucketName: string, key: string): Promise<string> {
  const getObjectResponse = await s3.getObject({
    Bucket: bucketName,
    Key: key,
  });
  const blob = await getObjectResponse.Body?.transformToString("base64");
  if (!blob) {
    throw new Error("Missing S3 file for existing table item!");
  }
  return blob;
}
export { handler };
