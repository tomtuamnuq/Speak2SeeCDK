import { CfnOutput, Stack, StackProps } from "aws-cdk-lib";
import {
  AuthorizationType,
  CognitoUserPoolsAuthorizer,
  Cors,
  IResource,
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
  private props: ApiStackProps;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    this.props = props;
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

    const uploadLambda = this.createLambda("UploadFunction", "upload.ts");
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
    this.createRoute(uploadLambda, "upload", "POST", this.api.root);

    const getAllLambda = this.createLambda("GetAllFunction", "getAll.ts");
    // Attach specific permission for DynamoDB to the Lambda function's IAM role
    getAllLambda.addToRolePolicy(
      new PolicyStatement({
        actions: ["dynamodb:Query"], // Only allow Query
        resources: [props.table.tableArn], // Restrict to the DynamoDB table
      })
    );
    this.createRoute(getAllLambda, "getAll", "GET", this.api.root);

    const getLambda = this.createLambda("GetFunction", "get.ts");
    // Attach specific permissions for S3 and DynamoDB to the Lambda function's IAM role
    getLambda.addToRolePolicy(
      new PolicyStatement({
        actions: ["s3:GetObject"], // Only allow GetObject
        resources: [`${props.bucket.bucketArn}/*`], // Restrict to the bucket
      })
    );
    getLambda.addToRolePolicy(
      new PolicyStatement({
        actions: ["dynamodb:GetItem"], // Only allow GetItem
        resources: [props.table.tableArn], // Restrict to the DynamoDB table
      })
    );
    this.createRoute(
      getLambda,
      "{itemID}",
      "GET",
      this.api.root.addResource("get") // /get/{itemID}
    );

    // Output the API endpoint
    new CfnOutput(this, "ApiEndpoint", {
      value: this.api.url,
    });
  }
  private createLambda(id: string, file: string) {
    return new NodejsFunction(this, id, {
      runtime: Runtime.NODEJS_20_X,
      handler: "handler",
      entry: join(__dirname, "api", file),
      environment: {
        BUCKET_NAME: this.props.bucket.bucketName,
        TABLE_NAME: this.props.table.tableName,
      },
    });
  }
  private createRoute(
    lambda: NodejsFunction,
    route: string,
    method: string,
    parent: IResource
  ) {
    const resource = parent.addResource(route, {
      defaultCorsPreflightOptions: {
        allowOrigins: Cors.ALL_ORIGINS, // TODO
        allowMethods: [method],
      },
    });

    // Add method to the /route resource with Cognito Authorizer
    resource.addMethod(method, new LambdaIntegration(lambda), {
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
  }
}
