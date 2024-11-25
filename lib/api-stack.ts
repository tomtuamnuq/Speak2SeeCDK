import { CfnOutput, Stack, StackProps } from "aws-cdk-lib";
import {
  AuthorizationType,
  CognitoUserPoolsAuthorizer,
  Cors,
  LambdaIntegration,
  RestApi,
} from "aws-cdk-lib/aws-apigateway";
import { IUserPool } from "aws-cdk-lib/aws-cognito";
import { IBucket } from "aws-cdk-lib/aws-s3";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";
import { join } from "path";
import { ITable } from "aws-cdk-lib/aws-dynamodb";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";

interface ApiStackProps extends StackProps {
  userPool: IUserPool;
  bucket: IBucket;
  table: ITable;
}

export class ApiStack extends Stack {
  private api: RestApi;
  private authorizer: CognitoUserPoolsAuthorizer;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    // Create the Lambda function
    const uploadLambda = new NodejsFunction(this, "UploadFunction", {
      runtime: Runtime.NODEJS_20_X,
      handler: "handler",
      entry: join(__dirname, "api", "upload.ts"),
      environment: {
        BUCKET_NAME: props.bucket.bucketName,
        TABLE_NAME: props.table.tableName,
      },
    });

    // Attach specific permissions for S3 and DynamoDB to the Lambda function's IAM role
    uploadLambda.addToRolePolicy(
      new PolicyStatement({
        actions: ["s3:PutObject"], // Only allow PutObject
        resources: [`${props.bucket.bucketArn}/*`], // Restrict to the bucket
      })
    );

    uploadLambda.addToRolePolicy(
      new PolicyStatement({
        actions: ["dynamodb:PutItem"], // Only allow PutItem
        resources: [props.table.tableArn], // Restrict to the DynamoDB table
      })
    );

    // Create an API Gateway REST API
    this.api = new RestApi(this, "Speak2SeeApi", {
      restApiName: "Speak2SeeService",
      description:
        "This service handles audio uploads and downloads of processing results.",
      binaryMediaTypes: ["audio/wav"],
    });

    // Create a Cognito User Pool Authorizer
    this.authorizer = new CognitoUserPoolsAuthorizer(this, "ApiAuthorizer", {
      cognitoUserPools: [props.userPool],
      identitySource: "method.request.header.Authorization",
    });

    // Define the /upload resource
    const uploadResource = this.api.root.addResource("upload", {
      defaultCorsPreflightOptions: {
        allowOrigins: Cors.ALL_ORIGINS, // TODO
        allowMethods: ["POST"],
      },
    });

    // Add POST method to the /upload resource with Cognito Authorizer
    uploadResource.addMethod("POST", new LambdaIntegration(uploadLambda), {
      authorizer: this.authorizer,
      authorizationType: AuthorizationType.COGNITO,
      requestParameters: {
        "method.request.header.Content-Type": true,
      },
      methodResponses: [
        {
          statusCode: "200",
          responseParameters: {
            "method.response.header.Content-Type": true,
          },
        },
      ],
    });

    // Output the API endpoint
    new CfnOutput(this, "ApiEndpoint", {
      value: this.api.url,
    });
  }
}
