import { CfnOutput, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import {
  AdvancedSecurityMode,
  Mfa,
  UserPool,
  UserPoolClient,
} from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";

interface AuthStackProps extends StackProps {
  userPoolName: string;
  removalPolicy: RemovalPolicy;
  advancedSecurity: boolean;
}
export class AuthStack extends Stack {
  public readonly userPool: UserPool;
  public readonly userPoolClient: UserPoolClient;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);
    const advancedSecurityMode = props.advancedSecurity
      ? AdvancedSecurityMode.ENFORCED
      : AdvancedSecurityMode.OFF; // avoid additional costs
    const mfa = props.advancedSecurity ? Mfa.REQUIRED : Mfa.OPTIONAL;
    // Create a Cognito User Pool and a Client for simple username+password auth
    this.userPool = new UserPool(this, "UserPool", {
      userPoolName: props.userPoolName,
      selfSignUpEnabled: false,
      signInAliases: { username: true, email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: {
          required: true,
          mutable: false,
        },
      },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      removalPolicy: props.removalPolicy,
      advancedSecurityMode: advancedSecurityMode,
      mfa: mfa,
      mfaSecondFactor: {
        sms: false,
        otp: true,
      },
    });

    this.userPoolClient = this.userPool.addClient("UserPoolClient", {
      authFlows: {
        adminUserPassword: false,
        custom: false,
        userPassword: true,
        userSrp: false,
      },
      disableOAuth: true,
    });

    // Outputs
    new CfnOutput(this, "UserPoolId", {
      value: this.userPool.userPoolId,
    });

    new CfnOutput(this, "UserPoolClientId", {
      value: this.userPoolClient.userPoolClientId,
    });
  }
}
