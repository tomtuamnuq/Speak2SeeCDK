/**
 * Enum for processing statuses.
 * Represents the various states of an audio/image processing task.
 */
export enum ProcessingStatus {
  IN_PROGRESS = "in progress",
  TRANSCRIPTION_FAILED = "audio transcription failed",
  IMAGE_FAILED = "image generation failed",
  FINISHED = "finished",
}
/**
 * Checks if a transcription has not yet been created based on the processing status.
 * @param status - The current processing status.
 * @returns `true` if the transcription is not available; otherwise, `false`.
 */
export function transcriptionHasNotBeenCreated(
  status: ProcessingStatus
): boolean {
  return (
    status !== ProcessingStatus.IMAGE_FAILED &&
    status !== ProcessingStatus.FINISHED
  );
} // Create stacks with environment-specific naming

export function stackName(baseName: string, stage: string) {
  return `speak2see-${baseName}-${stage}`;
}
