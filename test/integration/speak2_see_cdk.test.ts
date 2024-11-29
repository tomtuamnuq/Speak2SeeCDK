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
import { ProcessingStatus } from "../../lib/processing";

dotenv.config({
  path: join(__dirname, ".env"),
});

const outputs = JSON.parse(
  readFileSync(join(__dirname, "outputs.json"), "utf-8")
);

const apiEndpoint: string = outputs.ApiStack.ApiEndpoint;
const userPoolId: string = outputs.AuthStack.UserPoolId;
const userPoolClientId: string = outputs.AuthStack.UserPoolClientId;
const testAudioFilePath = join(__dirname, "resources", "audio.wav");
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

  /*   test("GET /getAll: Retrieve all itemIDs", async () => {
    const response = await axios.get(`${apiEndpoint}getAll`, {
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    });

    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty("itemIDs");
    expect(response.data.itemIDs).toBeInstanceOf(Array);
    expect(response.data.itemIDs.length).toBeGreaterThan(0);
    console.log(`Retrieved itemIDs: ${response.data.itemIDs}`);
  });

  test("GET /get/{itemID}: Retrieve audio blob and processingStatus", async () => {
    const getAllResponse = await axios.get(`${apiEndpoint}getAll`, {
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    });

    const itemIDs = getAllResponse.data.itemIDs;
    expect(itemIDs.length).toBeGreaterThan(0);

    const item = itemIDs[0];
    expect(item).toHaveProperty("id");
    expect(item.processingStatus).toBe(ProcessingStatus.IN_PROGRESS);
    const itemID: string = item.id!;
    console.log(`Using itemID for /get: ${itemID}`);

    const getResponse = await axios.get(`${apiEndpoint}get/${itemID}`, {
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    });

    expect(getResponse.status).toBe(200);
    expect(getResponse.data).toHaveProperty("audio");
    expect(getResponse.data.processingStatus).toBe(
      ProcessingStatus.IN_PROGRESS
    );
    console.log("Retrieved audio blob and processingStatus: 'in progress'.");
  }); */
});
