import { DynamoDB } from "@aws-sdk/client-dynamodb";
import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from "aws-lambda";
import { createAPIGatewayResult, getUserID } from "./common";
import { getTableName, requestFailed } from "../processing";
import { ProcessingStatus } from "../processing";

const dynamoDb = new DynamoDB();
export interface ProjectionResult {
  id: string;
  processingStatus: ProcessingStatus;
}
/**
 * Lambda function to retrieve all processing items for a specific user.
 * @param event - The API Gateway event containing the request details.
 * @param context - The Lambda execution context.
 * @returns An API Gateway response with the list of items or an error message.
 */
async function handler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  try {
    const tableName = getTableName();
    const userID = getUserID(event);

    // Query DynamoDB for items matching the userID
    const queryResult = await dynamoDb.query({
      TableName: tableName,
      KeyConditionExpression: "userID = :userID",
      ExpressionAttributeValues: {
        ":userID": { S: userID },
      },
      ProjectionExpression: "itemID, processingStatus",
    });

    // Check query result metadata
    if (requestFailed(queryResult)) {
      console.error("Failed to query DynamoDB", queryResult);
      throw new Error("Failed to query DynamoDB");
    }

    // Extract itemIDs from the query result or default to an empty array
    const itemIDs: ProjectionResult[] =
      queryResult.Items?.map((item) => ({
        id: item.itemID!.S!,
        processingStatus: item.processingStatus!.S! as ProcessingStatus,
      })) || [];

    // Return the list of items to the client
    return createAPIGatewayResult(
      200,
      JSON.stringify({
        itemIDs,
      })
    );
  } catch (error) {
    console.error("Error retrieving itemIDs:", error);
    return createAPIGatewayResult(
      500,
      JSON.stringify({ message: "Internal server error" })
    );
  }
}

export { handler };
