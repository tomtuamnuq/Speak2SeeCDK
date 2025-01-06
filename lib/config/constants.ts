// Constants for filenames and configurations

import { Duration } from "aws-cdk-lib";

export const AUDIO_FILENAME = "audio.wav"; // Default filename for uploaded audio

export const AUDIO_MEDIA_FORMAT = "wav"; // Audio format used for Transcribe

export const IMAGE_FILENAME = "image.jpg"; // Default filename for generated image

export const IMAGE_SIZE = 768; // image width and height (pixel)

export const TRANSCRIPTION_RESULT_FILENAME = "transcript.json"; // Filename for transcription result

export const TEXT2IMG_RESULT_FILENAME = "image.json"; // Filename for text-to-image result

export const SPOKEN_LANGUAGE_CODE = "en-US"; // Language code for Transcribe

export const EXPRESS_TRANSCRIBE_POLLING_INTERVAL = 3; // Polling interval in seconds for Transcribe

export const EXPRESS_TIMEOUT_DURATION = 1; // Workflow timeout in minutes

export const MAX_BINARY_AUDIO_SIZE = 3 * 1024 * 1024; // 3MB in bytes

export const LAMBDA_MEMORY_SIZE = 128; // 128 MB sufficient for 3 MB file and 768x768 image
export const LAMBDA_TIMEOUT = Duration.seconds(10); // 10 seconds sufficient for 3 MB file and possible network delays
