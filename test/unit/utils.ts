import { sdkStreamMixin } from "@smithy/util-stream";
import { Template } from "aws-cdk-lib/assertions";
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
export function prettyPrintTemplate(template: Template) {
  console.log("Template:", JSON.stringify(template.toJSON(), null, 2));
}
