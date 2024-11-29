import { GetObjectCommandInput, S3 } from "@aws-sdk/client-s3";
import { Comprehend } from "@aws-sdk/client-comprehend";
import { Context } from "aws-lambda";
import {
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

export const handler = async (
  event: ProcessingLambdaInput,
  context: Context
): Promise<ProcessingLambdaOutput> => {
  const { bucketName, prefix } = event;
  try {
    if (!bucketName) {
      throw new Error("Bucket name not specified in input.");
    }

    if (!prefix) {
      throw new Error("UUID prefix (directoryName) not specified in input.");
    }
  } catch (error) {
    console.error("Missing required input: ", error);
    throw error;
  }
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

// Helper function to convert S3 stream to the expected JSON
async function getObjectS3(
  params: GetObjectCommandInput
): Promise<TranscribeResult | undefined> {
  const s3ResponseStream = (await s3.getObject(params)).Body;
  const transcribeResult = s3ResponseStream?.transformToString();
  return transcribeResult
    ? JSON.parse(await transcribeResult)
    : transcribeResult;
}

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
