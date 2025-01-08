import { handler } from "../../../lib/api/getAll";
import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import { ProcessingStatus } from "../../../shared/common-utils";

const dynamoDbMock = mockClient(DynamoDBClient);

describe("Retrieve items Lambda Function", () => {
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

  test("returns items for the given userID", async () => {
    const mockQueryResult = {
      $metadata: { httpStatusCode: 200 },
      Items: [
        {
          itemID: { S: "itemID-1" },
          createdAt: { N: "1234" },
          processingStatus: { S: "in progress" },
        },
        {
          itemID: { S: "itemID-2" },
          createdAt: { N: "12345" },
          processingStatus: { S: "image generation failed" },
        },
      ],
    };

    // Mock DynamoDB query
    dynamoDbMock.on(QueryCommand).resolves(mockQueryResult);
    const result = await handler(event as any, {} as any);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      items: [
        {
          id: "itemID-1",
          createdAt: 1234,
          processingStatus: ProcessingStatus.IN_PROGRESS,
        },
        {
          id: "itemID-2",
          createdAt: 12345,
          processingStatus: ProcessingStatus.IMAGE_FAILED,
        },
      ],
    });

    expect(dynamoDbMock.calls().length).toBe(1);
  });

  test("returns empty items array when no items are found", async () => {
    const mockQueryResult = {
      $metadata: { httpStatusCode: 200 },
      Items: [],
    };

    // Mock DynamoDB query
    dynamoDbMock.on(QueryCommand).resolves(mockQueryResult);
    const result = await handler(event as any, {} as any);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      items: [],
    });

    expect(dynamoDbMock.calls().length).toBe(1);
  });
});
