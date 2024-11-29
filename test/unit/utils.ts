import { sdkStreamMixin } from "@smithy/util-stream";
import { Readable } from "stream";

export function mockS3BodyStream(body: string) {
  const stream = new Readable();
  stream.push(body);
  stream.push(null);
  return sdkStreamMixin(stream);
}
export function encodeBase64(body: string) {
  return Buffer.from(body).toString("base64");
}
