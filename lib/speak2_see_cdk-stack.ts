import { Duration, Stack, StackProps } from "aws-cdk-lib";
import { ITable } from "aws-cdk-lib/aws-dynamodb";
import { Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
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
} from "aws-cdk-lib/aws-stepfunctions";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import { WORKFLOW_TIMEOUT_DURATION } from "./processing";
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

    const transcribeWorkflow = new TranscribeWorkflow(
      this,
      "TranscribeWorkflow",
      {
        bucketName: bucketName,
        directoryName: directoryName,
        transcriptionCompleted: new Pass(this, "WorkflowCompleted", {
          resultPath: JsonPath.DISCARD,
        }),
        transcriptionFailed: new Pass(this, "WorkflowFailed", {
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
      transcribeWorkflow
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
    transcribeWorkflow: TranscribeWorkflow
  ): Role {
    const stateMachineRole = new Role(this, "StateMachineRole", {
      assumedBy: new ServicePrincipal("states.amazonaws.com"),
    });

    // Grant the State Machine permissions to read/write from the S3 bucket
    bucket.grantReadWrite(stateMachineRole);
    transcribeWorkflow.addPermissions(stateMachineRole);
    return stateMachineRole;
  }
}
