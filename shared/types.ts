import { ProcessingStatus } from "./common-utils";

export interface ProcessingItem {
  id: string;
  createdAt: number;
  processingStatus: ProcessingStatus;
}

export interface ItemDetails {
  audio: string; // base64
  image?: string; // base64
  transcription?: string;
  prompt?: string;
  processingStatus: ProcessingStatus;
}
