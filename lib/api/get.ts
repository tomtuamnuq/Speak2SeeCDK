import { S3 } from "@aws-sdk/client-s3";
import { DynamoDB } from "@aws-sdk/client-dynamodb";
import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from "aws-lambda";
import {
  createAPIGatewayResult,
  getEnvironment,
  getAudioKey,
  getImageKey,
} from "./common";

const s3 = new S3();
const dynamoDb = new DynamoDB();

async function handler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  try {
    const { bucketName, tableName, userID } = getEnvironment(event);

    const uuid = event.pathParameters?.uuid;
    if (!uuid) {
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
        UUID: { S: uuid },
      },
    });

    if (!getItemResult || !getItemResult.Item) {
      return createAPIGatewayResult(
        404,
        JSON.stringify({
          message: "No upload found for the given user and processing ID!",
        })
      );
    }

    const item = getItemResult.Item;
    const audioBlob = await getS3Blob(bucketName, getAudioKey(uuid));
    const status = item.status.S!;
    // If status is 'finished', fetch additional data
    if (status === "finished") {
      const imageBlob = await getS3Blob(bucketName, getImageKey(uuid));
      const transcription = item.transcription?.S;
      if (!transcription) {
        throw new Error("Missing transcription for finished audio processing!");
      }
      const prompt = item.prompt?.S;
      if (!prompt) {
        throw new Error("Missing prompt for finished audio processing!");
      }
      return createAPIGatewayResult(
        200,
        JSON.stringify({
          audio: audioBlob,
          image: imageBlob,
          transcription: transcription,
          prompt: prompt,
          status: status,
        })
      );
    } else {
      // If status is not 'finished', return the audio file only!
      return createAPIGatewayResult(
        200,
        JSON.stringify({
          audio: audioBlob,
          status: status,
        })
      );
    }
  } catch (error) {
    console.error("Error processing request:", error);
    return createAPIGatewayResult(
      500,
      JSON.stringify({ message: "Internal server error" })
    );
  }
}
async function getS3Blob(bucketName: string, key: string): Promise<string> {
  // Get the audio blob from S3
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
