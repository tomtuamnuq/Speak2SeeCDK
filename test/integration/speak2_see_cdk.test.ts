import axios from "axios";
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  UsernameExistsException,
  InitiateAuthCommand,
  AdminSetUserPasswordCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import * as dotenv from "dotenv";
import { readFileSync } from "fs";
import { join } from "path";
import { ProcessingStatus } from "../../lib/utils";
import { ProjectionResult } from "../../lib/api/getAll";
import { stackName } from "../../lib/config/environment-config";

dotenv.config({
  path: join(__dirname, ".env"),
});

const outputs = JSON.parse(
  readFileSync(join(__dirname, "outputs.json"), "utf-8")
);
const stage = "dev";
const userPoolStackName = stackName("auth", stage);
const apiEndpoint: string = outputs[stackName("api", stage)].ApiEndpoint;
const userPoolId: string = outputs[userPoolStackName].UserPoolId;
const userPoolClientId: string = outputs[userPoolStackName].UserPoolClientId;

const testAudioFilePath = join(__dirname, "resources", "audio_long.wav");
const email = process.env.EMAIL!;
const username = process.env.USERNAME!;
const password = process.env.PASSWORD!;

describe("Integration Test: Speak2See REST API", () => {
  let idToken: string;

  beforeAll(async () => {
    const cognitoClient = new CognitoIdentityProviderClient({
      region: "eu-west-2",
    });

    if (!username) {
      throw new Error("Environment variables are not properly set!");
    }
    try {
      console.log(`Ensuring user ${username} exists in Cognito User Pool...`);
      await cognitoClient.send(
        new AdminCreateUserCommand({
          UserPoolId: userPoolId,
          Username: username,
          MessageAction: "SUPPRESS", // Suppress invitation email
          UserAttributes: [{ Name: "email", Value: email }],
        })
      );
      console.log("User created.");
      await cognitoClient.send(
        new AdminSetUserPasswordCommand({
          UserPoolId: userPoolId,
          Username: username,
          Password: password,
          Permanent: true,
        })
      );
      console.log("User password set.");
    } catch (error) {
      if (error instanceof UsernameExistsException) {
        console.log("User already exists.");
      } else {
        throw error;
      }
    }

    // Authenticate the user and get ID token
    console.log(`Authenticating user ${username}...`);
    const authResponse = await cognitoClient.send(
      new InitiateAuthCommand({
        AuthFlow: "USER_PASSWORD_AUTH",
        ClientId: userPoolClientId,
        AuthParameters: {
          USERNAME: username,
          PASSWORD: password,
        },
      })
    );

    idToken = authResponse.AuthenticationResult!.IdToken!;
    console.log("Authenticated successfully.");
  });

  test("POST /upload: Upload audio file and retrieve ID", async () => {
    const audioFile = readFileSync(testAudioFilePath);

    const response = await axios.post(`${apiEndpoint}upload`, audioFile, {
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "audio/wav",
      },
    });

    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty("id");
    console.log(`Uploaded audio file. Received ID: ${response.data.id}`);
  }, 10000); // run up to 10 seconds

  test("GET /getAll: Retrieve all itemIDs with processingStatus", async () => {
    const response = await axios.get(`${apiEndpoint}getAll`, {
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    });

    // Assertions
    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty("itemIDs");
    expect(response.data.itemIDs).toBeInstanceOf(Array);

    // Ensure the array contains at least one valid item with expected properties
    const itemIDs = response.data.itemIDs;
    expect(itemIDs.length).toBeGreaterThan(0);
    itemIDs.forEach((item: { id: string; processingStatus: string }) => {
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("processingStatus");
      expect(typeof item.id).toBe("string");
      expect(Object.values(ProcessingStatus)).toContain(item.processingStatus);
    });

    console.log(`Retrieved items: ${JSON.stringify(itemIDs)}`);
  });

  test("GET /get/{itemID}: Verify responses for finished and unfinished items", async () => {
    // Step 1: Retrieve all itemIDs using /getAll
    const getAllResponse = await axios.get(`${apiEndpoint}getAll`, {
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    });

    // Assertions for /getAll
    const itemIDs: ProjectionResult[] = getAllResponse.data.itemIDs;
    expect(itemIDs.length).toBeGreaterThan(1);

    // Find items with finished and not finished statuses
    const finishedItem = itemIDs.find(
      (item) => item.processingStatus === ProcessingStatus.FINISHED
    );
    const unfinishedItem = itemIDs.find(
      (item) =>
        item.processingStatus &&
        item.processingStatus !== ProcessingStatus.FINISHED
    );

    // Step 2: Verify the finished item
    expect(finishedItem).toBeDefined();
    const finishedResponse = await axios.get(
      `${apiEndpoint}get/${finishedItem!.id}`,
      {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      }
    );

    expect(finishedResponse.status).toBe(200);
    expect(finishedResponse.data).toHaveProperty("audio");
    expect(finishedResponse.data).toHaveProperty("image");
    expect(finishedResponse.data).toHaveProperty("transcription");
    expect(finishedResponse.data).toHaveProperty("prompt");
    expect(finishedResponse.data.processingStatus).toBe(
      ProcessingStatus.FINISHED
    );

    // Ensure fields are truthy (not empty strings)
    expect(finishedResponse.data.audio).toBeTruthy();
    expect(finishedResponse.data.image).toBeTruthy();
    expect(finishedResponse.data.transcription).toBeTruthy();
    expect(finishedResponse.data.prompt).toBeTruthy();

    // Step 3: Verify the unfinished item
    expect(unfinishedItem).toBeDefined();
    const unfinishedResponse = await axios.get(
      `${apiEndpoint}get/${unfinishedItem!.id}`,
      {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      }
    );

    expect(unfinishedResponse.status).toBe(200);
    expect(unfinishedResponse.data).toHaveProperty("audio");
    expect(unfinishedResponse.data.processingStatus).not.toBe(
      ProcessingStatus.FINISHED
    );
    expect(unfinishedResponse.data.audio).toBeTruthy();
  }, 10000);
});
