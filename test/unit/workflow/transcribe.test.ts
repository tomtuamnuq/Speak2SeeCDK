import { App, Stack } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import {
  JsonPath,
  Pass,
  StateMachine,
  DefinitionBody,
} from "aws-cdk-lib/aws-stepfunctions";
import { TranscribeWorkflow } from "../../../lib/workflow/transcribe";
import { prettyPrintTemplate } from "../utils";

describe("TranscribeWorkflow", () => {
  const bucketName = "test-bucket";
  const prefix = JsonPath.stringAt("$.input.prefix");

  let app: App;
  let stack: Stack;

  beforeEach(() => {
    app = new App();
    stack = new Stack(app, "TestStack");
  });

  test("Check that TranscribeWorkflow can be chained.", () => {
    // Define a Pass state to inject prefix into the state machine
    const injectParameters = new Pass(stack, "InjectParameters", {
      parameters: {
        input: {
          prefix: "mock-prefix",
        },
      },
    });
    // Chain the states
    const workflow = new TranscribeWorkflow(stack, "TestTranscribeWorkflow", {
      bucketName,
      prefix: prefix,
      transcriptionCompleted: new Pass(stack, "WorkflowCompleted", {
        resultPath: JsonPath.DISCARD,
      }),
      transcriptionFailed: new Pass(stack, "WorkflowFailed", {
        resultPath: JsonPath.DISCARD,
      }),
      transcribePollingInterval: 1,
    });
    const startState = injectParameters.next(workflow);
    new StateMachine(stack, "TestStateMachine", {
      definitionBody: DefinitionBody.fromChainable(startState),
    });

    const template = Template.fromStack(stack);
    prettyPrintTemplate(template);
    // TODO check that prefix gets passed to both transcriptionCompleted and transcriptionFailed
  });
});
