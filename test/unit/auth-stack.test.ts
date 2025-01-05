import { App, RemovalPolicy } from "aws-cdk-lib";
import { AuthStack } from "../../lib/auth-stack";
import { Match, Template } from "aws-cdk-lib/assertions";
const userPoolName = "test-users";
describe("AuthStack", () => {
  let app: App;
  let stack: AuthStack;
  let template: Template;

  beforeEach(() => {
    app = new App();
    stack = new AuthStack(app, "TestAuthStack", {
      userPoolName: userPoolName,
      removalPolicy: RemovalPolicy.RETAIN,
      advancedSecurity: true,
    });
    template = Template.fromStack(stack);
  });

  test("creates a Cognito User Pool", () => {
    template.hasResourceProperties("AWS::Cognito::UserPool", {
      UserPoolName: userPoolName,
      AutoVerifiedAttributes: ["email"],
      Policies: {
        PasswordPolicy: {
          MinimumLength: 12,
          RequireLowercase: true,
          RequireUppercase: true,
          RequireNumbers: true,
          RequireSymbols: true,
        },
      },
    });
  });

  test("creates a Cognito User Pool Client", () => {
    template.hasResourceProperties("AWS::Cognito::UserPoolClient", {
      ExplicitAuthFlows: [
        "ALLOW_USER_PASSWORD_AUTH",
        "ALLOW_REFRESH_TOKEN_AUTH",
      ],
    });
  });

  test("outputs the UserPoolId", () => {
    template.hasOutput("UserPoolId", {
      Value: Match.objectLike({
        Ref: Match.stringLikeRegexp("UserPool"),
      }),
    });
  });

  test("outputs the UserPoolClientId", () => {
    template.hasOutput("UserPoolClientId", {
      Value: Match.objectLike({
        Ref: Match.stringLikeRegexp("UserPoolUserPoolClient"),
      }),
    });
  });
});
