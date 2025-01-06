import {
  FoundationModel,
  FoundationModelIdentifier,
} from "aws-cdk-lib/aws-bedrock";
import { JsonPath, TaskInput } from "aws-cdk-lib/aws-stepfunctions";
import { BedrockInvokeModel } from "aws-cdk-lib/aws-stepfunctions-tasks";
import { Construct } from "constructs";
import { IMAGE_SIZE, TEXT2IMG_RESULT_FILENAME } from "../config/constants";

interface Text2ImageConfig {
  taskType: "TEXT_IMAGE";
  textToImageParams: {
    text: string;
  };
  imageGenerationConfig: {
    numberOfImages: number;
    height: number;
    width: number;
    cfgScale: number;
    seed: number;
  };
}
export interface Text2ImageProps {
  /**
   * The name of the S3 bucket where the generated image will be stored.
   */
  bucketName: string;
  /**
   * The S3 key prefix for storing the generated image.
   */
  prefix: string;
  /**
   * The textual description used as a prompt for generating the image.
   */
  prompt: string;
}

export class Text2Image extends Construct {
  /**
   * The Bedrock task for invoking the image generation model in AWS Step Functions.
   */
  public readonly task: BedrockInvokeModel;

  /**
   * Constructs a new instance of the Text2Image task for integrating with AWS Bedrock.
   * @param scope - The parent construct.
   * @param id - The unique identifier for the construct.
   * @param props - The properties required to configure the Text2Image task.
   */
  constructor(scope: Construct, id: string, props: Text2ImageProps) {
    super(scope, id);
    // https://docs.aws.amazon.com/step-functions/latest/dg/connect-bedrock.html
    // https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-titan-image.html
    const text2ImageConfig: Text2ImageConfig = {
      taskType: "TEXT_IMAGE",
      textToImageParams: {
        text: props.prompt,
      },
      imageGenerationConfig: {
        numberOfImages: 1,
        height: IMAGE_SIZE,
        width: IMAGE_SIZE,
        cfgScale: 8.0, // 1.1 - 10.0 Default 8.0
        seed: 42,
      },
    };
    const model = FoundationModel.fromFoundationModelId(
      this,
      "Titan",
      FoundationModelIdentifier.AMAZON_TITAN_IMAGE_GENERATOR_G1_V1
    );
    const imageGenerationOutputUri = JsonPath.format(
      "s3://{}/{}/{}",
      props.bucketName,
      props.prefix,
      TEXT2IMG_RESULT_FILENAME
    );
    this.task = new BedrockInvokeModel(this, "StartImageGenerationTask", {
      model: model,
      body: TaskInput.fromObject(text2ImageConfig),
      resultPath: JsonPath.DISCARD,
      output: {
        s3OutputUri: imageGenerationOutputUri,
      },
    });
  }
}
