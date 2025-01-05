/**
 * Defines the `Speak2SeeCdkStack`, which orchestrates the state machine for audio-to-image processing.
 * The stack includes workflows for transcription, text-to-image generation, and DynamoDB integration.
 */
import { Duration, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { ITable } from "aws-cdk-lib/aws-dynamodb";
import { PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { IBucket } from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import { TranscribeWorkflow } from "./workflow/transcribe";
import {
  DefinitionBody,
  IStateMachine,
  JsonPath,
  LogLevel,
  StateMachine,
  StateMachineType,
  TaskInput,
} from "aws-cdk-lib/aws-stepfunctions";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import {
  FinalLambdaInput,
  ProcessingLambdaInput,
  ProcessingStatus,
} from "./utils";
import {
  EXPRESS_TIMEOUT_DURATION,
  EXPRESS_TRANSCRIBE_POLLING_INTERVAL,
  STANDARD_TIMEOUT_DURATION,
  STANDARD_TRANSCRIBE_POLLING_INTERVAL,
} from "./config/constants";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { join } from "path";
import {
  DynamoAttributeValue,
  DynamoUpdateItem,
  LambdaInvoke,
} from "aws-cdk-lib/aws-stepfunctions-tasks";
import { Text2Image } from "./workflow/bedrock";

interface Speak2SeeProps extends StackProps {
  bucket: IBucket; // S3 bucket used for storing audio, transcriptions, and images.
  table: ITable; // DynamoDB table used for tracking processing status and metadata.
  logRemovalPolicy: RemovalPolicy;
  logRetentionDays: RetentionDays;
}

export class Speak2SeeCdkStack extends Stack {
  public readonly stateMachineStandard: IStateMachine;
  public readonly stateMachineExpress: IStateMachine;
  constructor(scope: Construct, id: string, props: Speak2SeeProps) {
    super(scope, id, props);

    // Define the Lambda task to save the final image as jpeg
    const finalLambda = new NodejsFunction(this, "FinalFunction", {
      runtime: Runtime.NODEJS_20_X,
      handler: "handler",
      entry: join(__dirname, "workflow", "finalize.ts"),
      environment: {
        BUCKET_NAME: props.bucket.bucketName,
        TABLE_NAME: props.table.tableName,
      },
      memorySize: 128, // TODO set w.r.t. maximum file size of uploaded file and resulting transcription text
      timeout: Duration.seconds(60),
    });
    // Define the Lambda task to process transcription
    const processingLambda = new NodejsFunction(this, "ImagePromptFunction", {
      runtime: Runtime.NODEJS_20_X,
      handler: "handler",
      entry: join(__dirname, "workflow", "image-prompt.ts"),
      environment: {
        BUCKET_NAME: props.bucket.bucketName,
      },
      memorySize: 128, // TODO set w.r.t. maximum file size of uploaded file and resulting transcription text
      timeout: Duration.seconds(60),
    });
    const stateMachineRole = this.createStateMachineRole(
      props.bucket,
      props.table,
      processingLambda,
      finalLambda
    );

    const transcribeWorkflowStandard = this.createTranscribeWorkflow(
      props.bucket.bucketName,
      props.table,
      processingLambda,
      finalLambda,
      STANDARD_TRANSCRIBE_POLLING_INTERVAL,
      (id) => `${id}-Standard`
    );
    transcribeWorkflowStandard.addPermissions(stateMachineRole);
    const transcribeWorkflowExpress = this.createTranscribeWorkflow(
      props.bucket.bucketName,
      props.table,
      processingLambda,
      finalLambda,
      EXPRESS_TRANSCRIBE_POLLING_INTERVAL,
      (id) => `${id}-Express`
    );
    transcribeWorkflowExpress.addPermissions(stateMachineRole);

    this.stateMachineStandard = new StateMachine(this, "StandardStateMachine", {
      definitionBody: DefinitionBody.fromChainable(transcribeWorkflowStandard),
      role: stateMachineRole,
      stateMachineType: StateMachineType.STANDARD,
      timeout: Duration.minutes(STANDARD_TIMEOUT_DURATION),
      logs: {
        destination: new LogGroup(this, "StateMachineLogsStandard", {
          retention: props.logRetentionDays,
          removalPolicy: props.logRemovalPolicy,
        }),
        includeExecutionData: false,
        level: LogLevel.ALL,
      },
      tracingEnabled: false, // Disable X-Ray tracing (default)
    });
    this.stateMachineExpress = new StateMachine(this, "ExpressStateMachine", {
      definitionBody: DefinitionBody.fromChainable(transcribeWorkflowExpress),
      role: stateMachineRole,
      stateMachineType: StateMachineType.EXPRESS,
      timeout: Duration.minutes(EXPRESS_TIMEOUT_DURATION),
      logs: {
        destination: new LogGroup(this, "StateMachineLogsExpress", {
          retention: props.logRetentionDays,
          removalPolicy: props.logRemovalPolicy,
        }),
        includeExecutionData: false,
        level: LogLevel.ALL,
      },
      tracingEnabled: false, // Disable X-Ray tracing (default)
    });
  }

  private createTranscribeWorkflow(
    bucketName: string,
    table: ITable,
    processingLambda: NodejsFunction,
    finalLambda: NodejsFunction,
    transcribePollingInterval: number,
    idCallback: (id: string) => string
  ): TranscribeWorkflow {
    const text2Image = new Text2Image(this, idCallback("Text2Image"), {
      bucketName: bucketName,
      prefix: JsonPath.stringAt("$.prefix"),
      prompt: JsonPath.stringAt("$.transcription.prompt"),
    });
    const finalLambdaInput: FinalLambdaInput = {
      prefix: JsonPath.stringAt("$.prefix"),
      userID: JsonPath.stringAt("$.userID"),
      transcription: JsonPath.stringAt("$.transcription.text"),
      prompt: JsonPath.stringAt("$.transcription.prompt"),
    };
    const finalTask = new LambdaInvoke(this, idCallback("FinalTask"), {
      lambdaFunction: finalLambda,
      payload: TaskInput.fromObject(finalLambdaInput),
      resultPath: JsonPath.DISCARD, // returns void
    });
    const processingLambdaInput: ProcessingLambdaInput = {
      prefix: JsonPath.stringAt("$.input.prefix"),
    };
    const processTranscriptionTask = new LambdaInvoke(
      this,
      idCallback("ProcessTranscriptionTask"),
      {
        lambdaFunction: processingLambda,
        payload: TaskInput.fromObject(processingLambdaInput),
        resultPath: "$.input.transcription", // injects transcription.prompt
        resultSelector: {
          "text.$": "$.Payload.transcription",
          "prompt.$": "$.Payload.prompt",
        },
        outputPath: "$.input", // this moves nested input.prefix and input.userID to the top-level
      }
    );
    // Define the Image Generation workflow
    const handleImageGenerationFailure = new DynamoUpdateItem(
      this,
      idCallback("UpdateImageGenerationFailure"),
      {
        table: table,
        key: {
          userID: DynamoAttributeValue.fromString(
            JsonPath.stringAt("$.userID")
          ),
          itemID: DynamoAttributeValue.fromString(
            JsonPath.stringAt("$.prefix")
          ),
        },
        updateExpression:
          "SET transcription = :transcription, prompt = :prompt, processingStatus = :status",
        expressionAttributeValues: {
          ":transcription": DynamoAttributeValue.fromString(
            JsonPath.stringAt("$.transcription.text")
          ),
          ":prompt": DynamoAttributeValue.fromString(
            JsonPath.stringAt("$.transcription.prompt")
          ),
          ":status": DynamoAttributeValue.fromString(
            ProcessingStatus.IMAGE_FAILED
          ),
        },
      }
    );
    // Define the Image Generation workflow
    const handleTranscriptionFailure = new DynamoUpdateItem(
      this,
      idCallback("UpdateTranscriptionFailure"),
      {
        table: table,
        key: {
          userID: DynamoAttributeValue.fromString(
            JsonPath.stringAt("$.input.userID")
          ),
          itemID: DynamoAttributeValue.fromString(
            JsonPath.stringAt("$.input.prefix")
          ),
        },
        updateExpression: "SET processingStatus = :status",
        expressionAttributeValues: {
          ":status": DynamoAttributeValue.fromString(
            ProcessingStatus.TRANSCRIPTION_FAILED
          ),
        },
      }
    );
    processTranscriptionTask
      .addCatch(handleTranscriptionFailure, {
        resultPath: "$.error-info",
      })
      .next(
        text2Image.task.addCatch(handleImageGenerationFailure, {
          resultPath: "$.error-info",
        })
      )
      .next(
        finalTask.addCatch(handleImageGenerationFailure, {
          resultPath: "$.error-info",
        })
      );

    return new TranscribeWorkflow(this, idCallback("TranscribeWorkflow"), {
      bucketName: bucketName,
      prefix: JsonPath.stringAt("$.input.prefix"),
      transcriptionCompleted: processTranscriptionTask,
      transcriptionFailed: handleTranscriptionFailure,
      transcribePollingInterval: transcribePollingInterval,
    });
  }

  /**
   * Creates an IAM Role for the State Machine, granting permissions for S3, DynamoDB, and Lambda integrations.
   * @param bucket - S3 bucket used in the workflow.
   * @param table - DynamoDB table used for processing state tracking.
   * @param processingLambda - Lambda function for transcription processing.
   * @param finalLambda - Lambda function for final processing.
   * @returns The configured IAM Role.
   */
  private createStateMachineRole(
    bucket: IBucket,
    table: ITable,
    processingLambda: NodejsFunction,
    finalLambda: NodejsFunction
  ): Role {
    const stateMachineRole = new Role(this, "StateMachineRole", {
      assumedBy: new ServicePrincipal("states.amazonaws.com"),
    });

    // Grant the State Machine permissions for S3 bucket and DynamoDB table
    bucket.grantReadWrite(stateMachineRole);
    table.grantWriteData(stateMachineRole);

    // Grant the text processing Lambda function permissions
    processingLambda.addToRolePolicy(
      new PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: [
          `arn:aws:bedrock:${
            Stack.of(this).region
          }::foundation-model/amazon.titan-text-express-v1`,
        ],
      })
    );
    processingLambda.addToRolePolicy(
      new PolicyStatement({
        actions: ["s3:GetObject"], // Only allow GetObject
        resources: [`${bucket.bucketArn}/*`], // Restrict to the bucket
      })
    );

    // Grant the final Lambda function permissions
    finalLambda.addToRolePolicy(
      new PolicyStatement({
        actions: ["s3:GetObject", "s3:PutObject"], // Only allow GetObject and PutObject
        resources: [`${bucket.bucketArn}/*`], // Restrict to the bucket
      })
    );
    finalLambda.addToRolePolicy(
      new PolicyStatement({
        actions: ["dynamodb:UpdateItem"], // Only allow UpdateItem
        resources: [table.tableArn], // Restrict to the DynamoDB table
      })
    );

    // Grant the State Machine permissions to invoke Lambda functions
    processingLambda.grantInvoke(stateMachineRole);
    finalLambda.grantInvoke(stateMachineRole);
    return stateMachineRole;
  }
}
