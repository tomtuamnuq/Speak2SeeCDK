import { App, Stack } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { Text2Image, Text2ImageProps } from "../../../lib/workflow/bedrock";
import { prettyPrintTemplate } from "../utils";
import { DefinitionBody, StateMachine } from "aws-cdk-lib/aws-stepfunctions";

describe("Text2Image", () => {
  const bucketName = "test-bucket";
  const prefix = "test-prefix";
  const prompt = "Generate an image based on this prompt.";

  let app: App;
  let stack: Stack;
  let props: Text2ImageProps;

  beforeEach(() => {
    app = new App();
    stack = new Stack(app, "TestStack");
    props = { bucketName, prefix, prompt };
  });

  test("can add BedrockInvokeModel task to a StepFunction workflow", () => {
    const text2Image = new Text2Image(stack, "TestText2Image", props);
    const stateMachine = new StateMachine(stack, "TestStateMachine", {
      definitionBody: DefinitionBody.fromChainable(text2Image.task),
    });
    const template = Template.fromStack(stack);
    prettyPrintTemplate(template);
    // TODO check that template contains "TEXT_IMAGE" as task type
  });
});
