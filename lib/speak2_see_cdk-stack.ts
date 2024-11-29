import { Duration, Stack, StackProps } from "aws-cdk-lib";
import { ITable } from "aws-cdk-lib/aws-dynamodb";
import { PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { IBucket } from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import { TranscribeWorkflow } from "./workflow/transcribe";
import {
  DefinitionBody,
  Fail,
  IStateMachine,
  JsonPath,
  LogLevel,
  Pass,
  StateMachine,
  TaskInput,
} from "aws-cdk-lib/aws-stepfunctions";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import {
  FinalLambdaInput,
  ProcessingLambdaInput,
  WORKFLOW_TIMEOUT_DURATION,
} from "./processing";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { join } from "path";
import { LambdaInvoke } from "aws-cdk-lib/aws-stepfunctions-tasks";
import { Text2Image } from "./workflow/bedrock";
interface Speak2SeeProps extends StackProps {
  bucket: IBucket;
  table: ITable;
}

export class Speak2SeeCdkStack extends Stack {
  public readonly stateMachine: IStateMachine;
  constructor(scope: Construct, id: string, props: Speak2SeeProps) {
    super(scope, id, props);
    const bucketName = props.bucket.bucketName;
    const tableName = props.table.tableName;

    const text2Image = new Text2Image(this, "Text2Image", {
      bucketName: bucketName,
      prefix: JsonPath.stringAt("$.prefix"),
      prompt: JsonPath.stringAt("$.transcription.prompt"),
    });
    // Define the Lambda task to save the final image as jpeg
    const finalLambda = new NodejsFunction(this, "FinalFunction", {
      runtime: Runtime.NODEJS_20_X,
      handler: "handler",
      entry: join(__dirname, "workflow", "finalize.ts"),
      environment: {
        BUCKET_NAME: bucketName,
        TABLE_NAME: tableName,
      },
    });
    const finalLambdaInput: FinalLambdaInput = {
      prefix: JsonPath.stringAt("$.prefix"),
      userID: JsonPath.stringAt("$.userID"),
      transcription: JsonPath.stringAt("$.transcription.text"),
      prompt: JsonPath.stringAt("$.transcription.prompt"),
    };
    const finalTask = new LambdaInvoke(this, "FinalTask", {
      lambdaFunction: finalLambda,
      payload: TaskInput.fromObject(finalLambdaInput),
      resultPath: JsonPath.DISCARD, // returns void
    });
    // Define the Lambda task to process transcription
    const processingLambda = new NodejsFunction(this, "ComprehendFunction", {
      runtime: Runtime.NODEJS_20_X,
      handler: "handler",
      entry: join(__dirname, "workflow", "comprehend.ts"),
      environment: {
        BUCKET_NAME: bucketName,
      },
    });
    const processingLambdaInput: ProcessingLambdaInput = {
      prefix: JsonPath.stringAt("$.input.prefix"),
    };
    const processTranscriptionTask = new LambdaInvoke(
      this,
      "ProcessTranscriptionTask",
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
    processTranscriptionTask.next(text2Image.task).next(finalTask);

    // Define the Amazon Transcribe Workflow
    const transcribeWorkflow = new TranscribeWorkflow(
      this,
      "TranscribeWorkflow",
      {
        bucketName: bucketName,
        prefix: JsonPath.stringAt("$.input.prefix"),
        transcriptionCompleted: processTranscriptionTask,
        transcriptionFailed: new Pass(this, "TranscriptionWorkflowFailed", {
          resultPath: JsonPath.DISCARD,
        }).next(
          new Fail(this, "FailState", {
            cause: "Transcription Failed",
          })
        ),
      }
    );

    const stateMachineRole = this.createStateMachineRole(
      props.bucket,
      props.table,
      transcribeWorkflow,
      processingLambda,
      text2Image,
      finalLambda
    );

    this.stateMachine = new StateMachine(this, "TestStateMachine", {
      definitionBody: DefinitionBody.fromChainable(transcribeWorkflow),
      role: stateMachineRole,
      timeout: Duration.minutes(WORKFLOW_TIMEOUT_DURATION),
      logs: {
        destination: new LogGroup(this, "StateMachineLogs"),
        level: LogLevel.ALL,
      },
    });
  }

  private createStateMachineRole(
    bucket: IBucket,
    table: ITable,
    transcribeWorkflow: TranscribeWorkflow,
    processingLambda: NodejsFunction,
    text2Image: Text2Image,
    finalLambda: NodejsFunction
  ): Role {
    const stateMachineRole = new Role(this, "StateMachineRole", {
      assumedBy: new ServicePrincipal("states.amazonaws.com"),
    });

    // Grant the State Machine permissions to read/write from the S3 bucket
    bucket.grantReadWrite(stateMachineRole);

    transcribeWorkflow.addPermissions(stateMachineRole);
    // Grant the text processing Lambda function permissions
    processingLambda.addToRolePolicy(
      new PolicyStatement({
        actions: ["comprehend:DetectKeyPhrases"],
        resources: ["*"], // TODO restrict
      })
    );
    processingLambda.addToRolePolicy(
      new PolicyStatement({
        actions: ["s3:GetObject"], // Only allow GetObject
        resources: [`${bucket.bucketArn}/*`], // Restrict to the bucket
      })
    );

    text2Image.addPermissions(stateMachineRole);

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
