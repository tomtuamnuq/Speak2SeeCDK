import { GetObjectCommandInput, S3 } from "@aws-sdk/client-s3";
import { BedrockRuntime } from "@aws-sdk/client-bedrock-runtime";
import { Context } from "aws-lambda";
import {
  getBucketName,
  ProcessingLambdaInput,
  ProcessingLambdaOutput,
} from "../utils";
import { TRANSCRIPTION_RESULT_FILENAME } from "../config/constants";

interface TranscribeResult {
  results: {
    transcripts: { transcript: string }[];
  };
}

interface TitanTextRequest {
  inputText: string;
  textGenerationConfig: {
    temperature: number;
    topP: number;
    maxTokenCount: number;
    stopSequences: string[];
  };
}

const s3 = new S3();
const bedrock = new BedrockRuntime();
const MAXIMUM_NUMBER_OF_CHARACTERS = 512;

/**
 * AWS Lambda handler for processing transcription results with Amazon Titan Text Express.
 * Generates an optimized image prompt from the transcription.
 * @param event - The input event containing the prefix of the transcription.
 * @param context - The AWS Lambda context.
 * @returns An object containing the transcription text and a generated prompt.
 * @throws Error if required inputs are missing or if processing fails.
 */
export const handler = async (
  event: ProcessingLambdaInput,
  context: Context
): Promise<ProcessingLambdaOutput> => {
  const { prefix } = event;
  if (!prefix) {
    throw new Error("UUID prefix (directoryName) not specified in input.");
  }

  const bucketName = getBucketName();
  let transcriptText: string;
  try {
    transcriptText = await getTranscriptionFromS3(bucketName, prefix);
  } catch (error) {
    console.error("Error getting transcript text from S3: ", error);
    throw error;
  }

  let generatedPrompt: string;
  try {
    generatedPrompt = await generatePromptWithTitan(transcriptText);
  } catch (error) {
    console.error("Error generating prompt with Titan model: ", error);
    generatedPrompt = transcriptText.substring(0, MAXIMUM_NUMBER_OF_CHARACTERS);
    console.log(
      `Falling back to first ${MAXIMUM_NUMBER_OF_CHARACTERS} characters of transcription: ${generatedPrompt}`
    );
  }

  return { transcription: transcriptText, prompt: generatedPrompt };
};

/**
 * Retrieves the transcription text from S3 for the given prefix.
 * @param bucketName - The name of the S3 bucket.
 * @param prefix - The prefix used to locate the transcription file.
 * @returns The transcription text.
 * @throws Error if the transcription file or text is missing.
 */
async function getTranscriptionFromS3(
  bucketName: string,
  prefix: string
): Promise<string> {
  const transcriptKey = `${prefix}/${TRANSCRIPTION_RESULT_FILENAME}`;

  const transcribeResult = await getObjectS3({
    Bucket: bucketName,
    Key: transcriptKey,
  });

  if (!transcribeResult) {
    throw new Error(
      `No transcribe result found in bucket ${bucketName} with key ${transcriptKey}`
    );
  }

  const transcriptText = transcribeResult.results.transcripts[0].transcript;
  if (!transcriptText) {
    throw new Error("Transcript text not found in transcribe result.");
  }
  return transcriptText;
}

/**
 * Fetches an object from S3 and parses it as JSON.
 * @param params - Parameters for the GetObject S3 command.
 * @returns The parsed JSON object or undefined if the object is missing.
 */
async function getObjectS3(
  params: GetObjectCommandInput
): Promise<TranscribeResult | undefined> {
  const s3ResponseStream = (await s3.getObject(params)).Body;
  const transcribeResult = s3ResponseStream?.transformToString();
  return transcribeResult
    ? JSON.parse(await transcribeResult)
    : transcribeResult;
}

/**
 * Generates an optimized image prompt using the Titan Text Express model.
 * @param transcriptText - The input transcription text.
 * @returns A generated prompt optimized for image generation.
 * @throws Error if the model invocation fails.
 */
async function generatePromptWithTitan(
  transcriptText: string
): Promise<string> {
  const promptTemplate = `You are an expert at converting text descriptions into high-quality image generation prompts. 
Your task is to create a detailed, visual prompt that captures the key elements and mood of the input text.
Guidelines for creating the prompt:
- Focus on visual elements and descriptions
- Include artistic style, mood, lighting, and composition
- Structure the prompt to work well with image generation models
- Keep the output concise but descriptive (aim for 100-150 characters)
- Maintain the core meaning and emotional tone of the original text
- Add relevant artistic details that would enhance the visual output
- Avoid any text, words, or numbers in the image description
- Only answer with the prompt itself
Text: ${transcriptText}
Prompt:`;

  const request: TitanTextRequest = {
    inputText: promptTemplate,
    textGenerationConfig: {
      temperature: 0,
      topP: 0.9,
      maxTokenCount: 256,
      stopSequences: [],
    },
  };

  const response = await bedrock.invokeModel({
    modelId: "amazon.titan-text-express-v1",
    contentType: "application/json",
    accept: "application/json",
    trace: "DISABLED",
    body: JSON.stringify(request),
  });
  // Decode and return the response.
  const decodedResponseBody = new TextDecoder().decode(response.body);
  /** @type {ResponseBody} */
  const responseBody = JSON.parse(decodedResponseBody);
  let prompt = responseBody.results[0].outputText.trim();
  if (prompt.length > MAXIMUM_NUMBER_OF_CHARACTERS) {
    console.log(
      `Limiting the selected key phrases to ${MAXIMUM_NUMBER_OF_CHARACTERS} characters: ${prompt}`
    );
    prompt = prompt.substring(0, MAXIMUM_NUMBER_OF_CHARACTERS);
  }
  return prompt;
}
