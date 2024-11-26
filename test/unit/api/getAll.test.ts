import { handler } from "../../../lib/api/getAll";
import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import { ProcessingStatus } from "../../../lib/api/common";

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
      Items: [
        { itemID: { S: "itemID-1" }, processingStatus: { S: "in progress" } },
        { itemID: { S: "itemID-2" }, processingStatus: { S: "failed" } },
      ],
    };

    // Mock DynamoDB query
    dynamoDbMock.on(QueryCommand).resolves(mockQueryResult);
    const result = await handler(event as any, {} as any);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      itemIDs: [
        { id: "itemID-1", processingStatus: ProcessingStatus.IN_PROGRESS },
        { id: "itemID-2", processingStatus: ProcessingStatus.FAILED },
      ],
    });

    expect(dynamoDbMock.calls().length).toBe(1);
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
  });
});
