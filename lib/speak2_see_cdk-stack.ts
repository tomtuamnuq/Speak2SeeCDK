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
import { ProcessingLambdaInput, WORKFLOW_TIMEOUT_DURATION } from "./processing";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { join } from "path";
import { LambdaInvoke } from "aws-cdk-lib/aws-stepfunctions-tasks";
interface Speak2SeeProps extends StackProps {
  bucket: IBucket;
  table: ITable;
}

export class Speak2SeeCdkStack extends Stack {
  public readonly stateMachine: IStateMachine;
  constructor(scope: Construct, id: string, props: Speak2SeeProps) {
    super(scope, id, props);
    const bucketName = props.bucket.bucketName;
    const directoryName = JsonPath.stringAt("$.directoryName");

    // Define the Lambda task to process transcription
    const processingLambda = new NodejsFunction(this, "ComprehendFunction", {
      runtime: Runtime.NODEJS_20_X,
      handler: "handler",
      entry: join(__dirname, "workflow", "comprehend.ts"),
    });
    const processingLambdaInput: ProcessingLambdaInput = {
      bucketName: bucketName,
      prefix: directoryName,
    };
    const processTranscriptionTask = new LambdaInvoke(
      this,
      "ProcessTranscriptionTask",
      {
        lambdaFunction: processingLambda,
        payload: TaskInput.fromObject(processingLambdaInput),
        resultPath: "$.processResult", // returns ProcessingLambdaOutput
        resultSelector: { "processResult.$": "$.Payload" },
      }
    );

    // Define the Amazon Transcribe Workflow
    const transcribeWorkflow = new TranscribeWorkflow(
      this,
      "TranscribeWorkflow",
      {
        bucketName: bucketName,
        directoryName: directoryName,
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
      transcribeWorkflow,
      processingLambda
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
    transcribeWorkflow: TranscribeWorkflow,
    processingLambda: NodejsFunction
  ): Role {
    const stateMachineRole = new Role(this, "StateMachineRole", {
      assumedBy: new ServicePrincipal("states.amazonaws.com"),
    });

    // Grant the State Machine permissions to read/write from the S3 bucket
    bucket.grantReadWrite(stateMachineRole);
    transcribeWorkflow.addPermissions(stateMachineRole);

    // Grant the State Machine permissions to invoke Lambda functions
    processingLambda.grantInvoke(stateMachineRole);
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

    return stateMachineRole;
  }
}
