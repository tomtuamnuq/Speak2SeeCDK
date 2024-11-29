import { App, Stack } from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
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

  test("adds permissions to invoke Bedrock model", () => {
    const text2Image = new Text2Image(stack, "TestText2Image", props);
    const role = new Role(stack, "TestRole", {
      assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
    });
    text2Image.addPermissions(role);

    const template = Template.fromStack(stack);
    // Verify the IAM Policy for Bedrock invocation
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: "bedrock:InvokeModel",
            Effect: "Allow",
          }),
        ]),
      },
    });
  });
});
