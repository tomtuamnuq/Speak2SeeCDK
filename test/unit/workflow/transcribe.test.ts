import { App, Stack } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import {
  JsonPath,
  Pass,
  StateMachine,
  DefinitionBody,
} from "aws-cdk-lib/aws-stepfunctions";
import { TranscribeWorkflow } from "../../../lib/workflow/transcribe";

describe("TranscribeWorkflow", () => {
  const bucketName = "test-bucket";
  const directoryName = JsonPath.stringAt("$.directoryName");

  let app: App;
  let stack: Stack;

  beforeEach(() => {
    app = new App();
    stack = new Stack(app, "TestStack");
  });

  test("Check that TranscribeWorkflow can be chained.", () => {
    // Define a Pass state to inject directoryName into the state machine
    const injectParameters = new Pass(stack, "InjectParameters", {
      parameters: {
        directoryName: directoryName,
      },
    });
    // Chain the states
    const workflow = new TranscribeWorkflow(stack, "TestTranscribeWorkflow", {
      bucketName,
      directoryName,
      transcriptionCompleted: new Pass(stack, "WorkflowCompleted", {
        resultPath: JsonPath.DISCARD,
      }),
      transcriptionFailed: new Pass(stack, "WorkflowFailed", {
        resultPath: JsonPath.DISCARD,
      }),
    });
    const startState = injectParameters.next(workflow);
    new StateMachine(stack, "TestStateMachine", {
      definitionBody: DefinitionBody.fromChainable(startState),
    });

    const template = Template.fromStack(stack);
    console.log("Template:", JSON.stringify(template.toJSON(), null, 2));
    // TODO check that directoryName gets passed to both transcriptionCompleted and transcriptionFailed
  });
});
