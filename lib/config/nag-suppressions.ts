import { App, Stack } from "aws-cdk-lib";
import { NagSuppressions } from "cdk-nag";

export function applyCommonSuppressions(app: App) {
  // Get all stacks in the app
  const stacks = app.node.children.filter((child) => child instanceof Stack);
  stacks.forEach((stack) => {
    // Step Functions X-Ray suppressions
    if (stack.node.id.includes("core")) {
      const xraySuppressions = [
        {
          id: "AwsSolutions-SF2",
          reason:
            "X-Ray tracing disabled due to cost considerations. Sufficient monitoring is achieved through CloudWatch logs and metrics. Reference: https://aws.amazon.com/xray/pricing/",
        },
      ];

      // Apply to both Standard and Express State Machines
      NagSuppressions.addResourceSuppressionsByPath(
        stack,
        `/${stack.node.id}/StandardStateMachine/Resource`,
        xraySuppressions
      );

      NagSuppressions.addResourceSuppressionsByPath(
        stack,
        `/${stack.node.id}/ExpressStateMachine/Resource`,
        xraySuppressions
      );
    }

    // API Gateway WAF suppressions
    if (stack.node.id.includes("api")) {
      NagSuppressions.addResourceSuppressionsByPath(
        stack,
        `/${stack.node.id}/Speak2SeeApi/DeploymentStage.${
          stack.node.id.includes("dev") ? "dev" : "prod"
        }/Resource`,
        [
          {
            id: "AwsSolutions-APIG3",
            reason:
              "WAF is not required as the API is already protected by: 1) Cognito Authentication 2) API Gateway throttling",
          },
        ]
      );
    }
  });
}
export function applyDevSuppressions(app: App) {
  // Get all stacks in the app
  const stacks = app.node.children.filter((child) => child instanceof Stack);
  stacks.forEach((stack) => {
    if (stack.node.id.includes("api") || stack.node.id.includes("core")) {
      NagSuppressions.addStackSuppressions(stack, [
        {
          id: "AwsSolutions-IAM4",
          reason:
            "The use of AWS managed policies. TODO create policies for production.",
        },
        {
          id: "AwsSolutions-IAM5",
          reason:
            "The use of wildcards in a policy. TODO create policies for production.",
        },
      ]);
    }

    // DynamoDB PITR suppression
    if (stack.node.id.includes("data")) {
      NagSuppressions.addResourceSuppressionsByPath(
        stack,
        `/${stack.node.id}/DynamoDBTable/Resource`,
        [
          {
            id: "AwsSolutions-DDB3",
            reason:
              "Point-in-time recovery is not required in development environment for cost optimization",
          },
        ]
      );
    }
    // Cognito suppressions
    if (stack.node.id.includes("auth")) {
      NagSuppressions.addResourceSuppressionsByPath(
        stack,
        `/${stack.node.id}/UserPool/Resource`,
        [
          {
            id: "AwsSolutions-COG3",
            reason:
              "Advanced security features are not required in development environment",
          },
        ]
      );
    }
  });
}
