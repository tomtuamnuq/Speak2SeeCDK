import { Duration } from "aws-cdk-lib";
import {
  Choice,
  Condition,
  IChainable,
  INextable,
  JsonPath,
  State,
  StateMachineFragment,
  Wait,
  WaitTime,
} from "aws-cdk-lib/aws-stepfunctions";
import { CallAwsService } from "aws-cdk-lib/aws-stepfunctions-tasks";
import { Construct } from "constructs";
import {
  AUDIO_FILENAME,
  AUDIO_MEDIA_FORMAT,
  SPOKEN_LANGUAGE_CODE,
  TRANSCRIBE_POLLING_INTERVAL,
  TRANSCRIPTION_RESULT_FILENAME,
} from "../processing";
import { PolicyStatement, Role } from "aws-cdk-lib/aws-iam";

export interface TranscribeWorkflowProps {
  bucketName: string;
  directoryName: string;
  transcriptionCompleted: INextable & IChainable;
  transcriptionFailed: INextable & IChainable;
}

export class TranscribeWorkflow extends StateMachineFragment {
  public readonly startState: State;
  public readonly endStates: INextable[];

  constructor(scope: Construct, id: string, props: TranscribeWorkflowProps) {
    super(scope, id);

    const {
      bucketName,
      directoryName,
      transcriptionCompleted,
      transcriptionFailed,
    } = props;

    // Task: Start Transcription Job
    const startTranscriptionTask = new CallAwsService(
      this,
      "StartTranscriptionJob",
      {
        service: "transcribe",
        action: "startTranscriptionJob",
        parameters: {
          TranscriptionJobName: directoryName,
          LanguageCode: SPOKEN_LANGUAGE_CODE,
          MediaFormat: AUDIO_MEDIA_FORMAT,
          Media: {
            MediaFileUri: JsonPath.format(
              "s3://{}/{}/{}",
              bucketName,
              directoryName,
              AUDIO_FILENAME
            ),
          },
          OutputBucketName: bucketName,
          OutputKey: JsonPath.format(
            "{}/{}",
            directoryName,
            TRANSCRIPTION_RESULT_FILENAME
          ),
        },
        resultPath: "$.transcriptionJob",
        iamResources: ["*"], // TODO Restrict to specific resources if needed
      }
    );

    // Task: Wait for a few seconds
    const waitForTranscription = new Wait(this, "WaitForTranscription", {
      time: WaitTime.duration(Duration.seconds(TRANSCRIBE_POLLING_INTERVAL)),
    });

    // Task: Check Transcription Status
    const checkStatus = new CallAwsService(this, "CheckTranscriptionStatus", {
      service: "transcribe",
      action: "getTranscriptionJob",
      parameters: {
        TranscriptionJobName: directoryName,
      },
      resultPath: "$.transcriptionStatus",
      iamResources: ["*"], // TODO Restrict to specific resources if needed
    });

    // Choice: Is Transcription Complete?
    const isComplete = new Choice(this, "IsTranscriptionComplete")
      .when(
        Condition.stringEquals(
          "$.transcriptionStatus.TranscriptionJob.TranscriptionJobStatus",
          "COMPLETED"
        ),
        transcriptionCompleted
      )
      .when(
        Condition.stringEquals(
          "$.transcriptionStatus.TranscriptionJob.TranscriptionJobStatus",
          "FAILED"
        ),
        transcriptionFailed
      )
      .otherwise(waitForTranscription);

    // Assemble the Workflow
    this.startState = startTranscriptionTask;
    startTranscriptionTask
      .next(waitForTranscription)
      .next(checkStatus)
      .next(isComplete);
    this.endStates = [transcriptionCompleted, transcriptionFailed];
  }

  public addPermissions(role: Role) {
    // Grant the Role permissions to use Amazon Transcribe
    role.addToPolicy(
      new PolicyStatement({
        actions: [
          "transcribe:StartTranscriptionJob",
          "transcribe:GetTranscriptionJob",
          "transcribe:DeleteTranscriptionJob",
        ],
        resources: ["*"], // TODO restrict this to specific resources
      })
    );
  }
}
