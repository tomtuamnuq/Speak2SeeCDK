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
  prefix: string;
  transcriptionCompleted: INextable & IChainable;
  transcriptionFailed: INextable & IChainable;
}

/**
 * A Step Function workflow for transcribing audio files using Amazon Transcribe.
 * - Initiates a transcription job for an audio file stored in S3.
 * - Polls the transcription job status at regular intervals.
 * - Branches to success or failure based on the transcription job's status.
 */
export class TranscribeWorkflow extends StateMachineFragment {
  public readonly startState: State;
  public readonly endStates: INextable[];
  /**
   * Constructs a new TranscribeWorkflow.
   * @param scope - The Construct scope.
   * @param id - The unique identifier for this workflow.
   * @param props - Workflow properties including S3 bucket, prefix, and transitions.
   */
  constructor(scope: Construct, id: string, props: TranscribeWorkflowProps) {
    super(scope, id);

    const { bucketName, prefix, transcriptionCompleted, transcriptionFailed } =
      props;

    // Task: Start Transcription Job
    const startTranscriptionTask = new CallAwsService(
      this,
      "StartTranscriptionJob",
      {
        service: "transcribe",
        action: "startTranscriptionJob",
        parameters: {
          TranscriptionJobName: prefix,
          LanguageCode: SPOKEN_LANGUAGE_CODE,
          MediaFormat: AUDIO_MEDIA_FORMAT,
          Media: {
            MediaFileUri: JsonPath.format(
              "s3://{}/{}/{}",
              bucketName,
              prefix,
              AUDIO_FILENAME
            ),
          },
          OutputBucketName: bucketName,
          OutputKey: JsonPath.format(
            "{}/{}",
            prefix,
            TRANSCRIPTION_RESULT_FILENAME
          ),
        },
        resultPath: "$.transcriptionJob",
        iamResources: ["*"], // TODO Restrict to specific resources in production
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
        TranscriptionJobName: prefix,
      },
      resultPath: "$.transcriptionStatus",
      iamResources: ["*"], // TODO Restrict to specific resources in production
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

  /**
   * Adds permissions to the provided IAM role for accessing Amazon Transcribe.
   * @param role - The IAM role to grant permissions.
   */
  public addPermissions(role: Role) {
    role.addToPolicy(
      new PolicyStatement({
        actions: [
          "transcribe:StartTranscriptionJob",
          "transcribe:GetTranscriptionJob",
          "transcribe:DeleteTranscriptionJob",
        ],
        resources: ["*"], // TODO restrict to specific resources in production
      })
    );
  }
}
