import { GetObjectCommandInput, S3 } from "@aws-sdk/client-s3";
import { Comprehend } from "@aws-sdk/client-comprehend";
import { Context } from "aws-lambda";
import {
  getBucketName,
  MAXIMUM_NUMBER_OF_KEY_PHRASES,
  ProcessingLambdaInput,
  ProcessingLambdaOutput,
  TRANSCRIPTION_RESULT_FILENAME,
  WRITTEN_LANGUAGE_CODE,
} from "../processing";

interface TranscribeResult {
  results: {
    transcripts: { transcript: string }[];
  };
}

const s3 = new S3();
const comprehend = new Comprehend();
const MAXIMUM_NUMBER_OF_CHARACTERS = 256; // limit the resulting string

/**
 * AWS Lambda handler for processing transcription results with Amazon Comprehend.
 * Extracts key phrases from a transcription stored in S3 and generates a prompt string.
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

  let concatenatedKeyPhrases: string;
  try {
    // Call Amazon Comprehend to extract key phrases
    const uniqueKeyPhrases = await detectUniqueKeyPhrasesSortedByScore(
      transcriptText
    );
    concatenatedKeyPhrases = getKeyPhraseString(uniqueKeyPhrases);
  } catch (error) {
    console.error(
      "Error in extracting key phrases from transcription: ",
      error
    );
    concatenatedKeyPhrases = transcriptText.substring(
      0,
      MAXIMUM_NUMBER_OF_CHARACTERS
    );
    console.log(
      `Falling back to first ${MAXIMUM_NUMBER_OF_CHARACTERS} characters of transcription: ${concatenatedKeyPhrases}`
    );
  }

  return { transcription: transcriptText, prompt: concatenatedKeyPhrases };
};

/**
 * Retrieves the transcription text from S3 for the given prefix.
 * @param bucketName - The name of the S3 bucket.
 * @param prefix - The prefix used to locate the transcription file.
 * @returns The transcription text.
 * @throws Error if the transcription file or text is missing.
 */
async function getTranscriptionFromS3(bucketName: string, prefix: string) {
  const transcriptKey = `${prefix}/${TRANSCRIPTION_RESULT_FILENAME}`;

  // Read and parse the transcript file from S3
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
 * Detects unique key phrases from transcription text using Amazon Comprehend.
 * Filters and sorts key phrases by confidence score in descending order.
 * @param transcriptText - The transcription text.
 * @returns A set of unique key phrases sorted by confidence score.
 * @throws Error if no valid key phrases are found.
 */
async function detectUniqueKeyPhrasesSortedByScore(transcriptText: string) {
  const comprehendResponse = await comprehend.detectKeyPhrases({
    Text: transcriptText,
    LanguageCode: WRITTEN_LANGUAGE_CODE,
  });

  if (!comprehendResponse.KeyPhrases) {
    throw new Error("No key phrases in Comprehend response.");
  }

  // Sort key phrases by Score (descending) and filter out those without Text
  const sortedKeyPhrases = comprehendResponse.KeyPhrases.filter(
    (kp) => kp.Text && kp.Score
  ) // Ensure valid Text and Score
    .sort((a, b) => b.Score! - a.Score!) // Sort by descending Score
    .map((kp) => kp.Text!);
  // Deduplicate
  const uniqueSortedKeyPhrases = new Set(sortedKeyPhrases);

  if (uniqueSortedKeyPhrases.size === 0) {
    throw new Error("Found no valid key phrases!.");
  }
  return uniqueSortedKeyPhrases;
}

/**
 * Generates a concatenated string of key phrases from a set of unique key phrases.
 * Limits the result to a maximum number of characters.
 * @param sortedUniqueKeyPhrases - A set of sorted unique key phrases.
 * @returns A concatenated string of key phrases.
 */
function getKeyPhraseString(sortedUniqueKeyPhrases: Set<string>) {
  const numberOfKeyPhrases = Math.min(
    sortedUniqueKeyPhrases.size,
    MAXIMUM_NUMBER_OF_KEY_PHRASES
  );
  let count = 0;
  const keyPhrases: string[] = new Array(numberOfKeyPhrases);
  for (let keyPhrase of sortedUniqueKeyPhrases) {
    keyPhrases[count] = keyPhrase;
    count = count + 1;
    if (count === numberOfKeyPhrases) {
      break;
    }
  }
  // Concatenate the selected key phrases
  let concatenatedKeyPhrases = keyPhrases.join(", ");
  if (concatenatedKeyPhrases.length > MAXIMUM_NUMBER_OF_CHARACTERS) {
    console.log(
      `Limiting the selected key phrases to ${MAXIMUM_NUMBER_OF_CHARACTERS} characters: ${concatenatedKeyPhrases}`
    );
    concatenatedKeyPhrases = concatenatedKeyPhrases.substring(
      0,
      MAXIMUM_NUMBER_OF_CHARACTERS
    );
  }
  return concatenatedKeyPhrases;
}
