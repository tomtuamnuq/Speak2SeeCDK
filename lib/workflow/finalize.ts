import { GetObjectCommandInput, S3 } from "@aws-sdk/client-s3";
import { Context } from "aws-lambda";
import {
  FinalLambdaInput,
  getImageKey,
  ProcessingStatus,
  requestFailed,
  TEXT2IMG_RESULT_FILENAME,
} from "../processing";
import { getBucketName, getTableName } from "../processing";
import { DynamoDB } from "@aws-sdk/client-dynamodb";

const s3 = new S3();
const dynamoDb = new DynamoDB();

/**
 * AWS Lambda handler for finalizing the processing workflow.
 * - Retrieves the generated image from S3 and uploads it to a separate S3 location.
 * - Updates the DynamoDB entry with the transcription, prompt, and processing status.
 * @param event - Input event containing the prefix, userID, transcription, and prompt.
 * @param context - The AWS Lambda context.
 * @throws Error if required inputs are missing or if S3/DynamoDB operations fail.
 */
export const handler = async (
  event: FinalLambdaInput,
  context: Context
): Promise<void> => {
  const { prefix, userID, transcription, prompt } = event;
  try {
    if (!prefix) {
      throw new Error("Prefix not specified in input.");
    }
    if (!userID) {
      throw new Error("UserID not specified in input.");
    }
    if (!transcription) {
      throw new Error("Transcription not specified in input.");
    }
    if (!prompt) {
      throw new Error("Prompt not specified in input.");
    }
  } catch (error) {
    console.log("Missing required input: ", error);
    throw error;
  }
  const bucketName = getBucketName();
  const tableName = getTableName();

  let imageBuffer: Buffer;
  try {
    // Read and parse the response file from S3
    imageBuffer = await getImageFromS3Json({
      Bucket: bucketName,
      Key: `${prefix}/${TEXT2IMG_RESULT_FILENAME}`,
    });
  } catch (error) {
    console.log("Error getting generated image from S3: ", error);
    throw error;
  }

  // Save the image to S3
  const putObjectResult = await s3.putObject({
    Bucket: bucketName,
    Key: getImageKey(prefix),
    Body: imageBuffer,
    ContentType: "image/jpeg",
  });

  if (requestFailed(putObjectResult)) {
    console.error("Failed to upload image to S3", putObjectResult);
    throw new Error("Failed to upload image file to S3");
  }

  const updateItemResult = await dynamoDb.updateItem({
    TableName: tableName,
    Key: {
      userID: { S: userID },
      itemID: { S: prefix },
    },
    UpdateExpression:
      "SET transcription = :transcription, prompt = :prompt, processingStatus = :status",
    ExpressionAttributeValues: {
      ":transcription": { S: transcription },
      ":prompt": { S: prompt },
      ":status": { S: ProcessingStatus.FINISHED },
    },
  });

  if (requestFailed(updateItemResult)) {
    console.error("Failed to update DynamoDB item", updateItemResult);
    throw new Error("Failed to update DynamoDB item with processing result.");
  }
};

/**
 * Helper function to retrieve and parse an image JSON file from S3.
 * - Converts the base64-encoded image to a Buffer.
 * @param params - Parameters for the GetObject S3 command.
 * @returns A Buffer containing the image data.
 * @throws Error if the image JSON file is missing or contains no images.
 */
async function getImageFromS3Json(
  params: GetObjectCommandInput
): Promise<Buffer> {
  const s3ResponseStream = (await s3.getObject(params)).Body;
  const bedrockImageResult = await s3ResponseStream?.transformToString();
  if (!bedrockImageResult) {
    throw new Error("Failed to retrieve bedrock images from S3!");
  }

  const imagesArray = JSON.parse(bedrockImageResult).images;
  if (!imagesArray || imagesArray.length === 0) {
    throw new Error("No images found in response images array.");
  }
  return Buffer.from(imagesArray[0], "base64");
}
