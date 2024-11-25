import { DynamoDB } from "@aws-sdk/client-dynamodb";
import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from "aws-lambda";
import { createAPIGatewayResult, getTableName, getUserID } from "./common";

const dynamoDb = new DynamoDB();

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
      ProjectionExpression: "UUID",
    });

    // Check query result metadata
    if (!queryResult || queryResult.$metadata.httpStatusCode !== 200) {
      console.error("Failed to query DynamoDB", queryResult);
      throw new Error("Failed to query DynamoDB");
    }

    // Extract UUIDs from the query result or default to an empty array
    const uuids: string[] =
      queryResult.Items?.map((item) => item.UUID!.S!) || [];

    // Return the list of UUIDs to the client
    return createAPIGatewayResult(
      200,
      JSON.stringify({
        uuids,
      })
    );
  } catch (error) {
    console.error("Error retrieving UUIDs:", error);
    return createAPIGatewayResult(
      500,
      JSON.stringify({ message: "Internal server error" })
    );
  }
}

export { handler };
