import { handler } from "../../lib/api/getAll";
import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { mockClient } from "aws-sdk-client-mock";

const dynamoDbMock = mockClient(DynamoDBClient);

describe("Retrieve itemIDs Lambda Function", () => {
  const tableName = "test-table";
  const userID = "mock-user-id";

  const event = {
    requestContext: {
      authorizer: {
        claims: { sub: userID },
      },
    },
  };
  beforeEach(() => {
    dynamoDbMock.reset();
    process.env.TABLE_NAME = tableName;
  });

  test("returns itemIDs for the given userID", async () => {
    const mockQueryResult = {
      $metadata: { httpStatusCode: 200 },
      Items: [{ itemID: { S: "itemID-1" } }, { itemID: { S: "itemID-2" } }],
    };

    // Mock DynamoDB query
    dynamoDbMock.on(QueryCommand).resolves(mockQueryResult);
    const result = await handler(event as any, {} as any);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      itemIDs: ["itemID-1", "itemID-2"],
    });

    expect(dynamoDbMock.calls().length).toBe(1);
    expect(dynamoDbMock.calls()[0].args[0]).toMatchObject({
      input: {
        TableName: tableName,
        KeyConditionExpression: "userID = :userID",
        ExpressionAttributeValues: {
          ":userID": { S: userID },
        },
        ProjectionExpression: "itemID",
      },
    });
  });

  test("returns empty itemIDs array when no items are found", async () => {
    const mockQueryResult = {
      $metadata: { httpStatusCode: 200 },
      Items: [],
    };

    // Mock DynamoDB query
    dynamoDbMock.on(QueryCommand).resolves(mockQueryResult);
    const result = await handler(event as any, {} as any);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      itemIDs: [],
    });

    expect(dynamoDbMock.calls().length).toBe(1);
    expect(dynamoDbMock.calls()[0].args[0]).toMatchObject({
      input: {
        TableName: tableName,
        KeyConditionExpression: "userID = :userID",
        ExpressionAttributeValues: {
          ":userID": { S: userID },
        },
        ProjectionExpression: "itemID",
      },
    });
  });
});
