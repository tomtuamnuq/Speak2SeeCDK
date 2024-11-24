import { CfnOutput, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { BlockPublicAccess, Bucket, IBucket } from "aws-cdk-lib/aws-s3";
import {
  AttributeType,
  BillingMode,
  Table,
  ITable,
} from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";

// Schema definition with strongly typed attributes
export interface DynamoDBTableSchema {
  UUID: string; // primary key - used together with userID for queries
  userID: string; // User identifier - partition key
  createdAt: string; // ISO8601 timestamp
  status: "in progress" | "failed" | "finished"; // Restricted status values
  audio: string; // S3 link to WAV file
  transcription?: string; // Transcription text (optional)
  prompt?: string; // Prompt for image generation (optional)
  image?: string; // S3 link to JPEG file (optional)
}

interface DataStackProps extends StackProps {
  bucketName: string;
  tableName: string;
}

export class DataStack extends Stack {
  public readonly bucket: IBucket;
  public readonly table: ITable;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    // Create the S3 bucket
    this.bucket = new Bucket(this, "S3Bucket", {
      bucketName: props.bucketName, // unique bucket name
      removalPolicy: RemovalPolicy.DESTROY, // for simple recreation and testing purposes
      autoDeleteObjects: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
    });

    new CfnOutput(this, "BucketName", {
      value: this.bucket.bucketName,
    });

    // Create the DynamoDB table
    this.table = new Table(this, "DynamoDBTable", {
      tableName: props.tableName,
      partitionKey: { name: "userID", type: AttributeType.STRING }, // Partition key: userID
      sortKey: { name: "UUID", type: AttributeType.STRING }, // key for common operations: UUID
      billingMode: BillingMode.PAY_PER_REQUEST, // On-demand pricing for scalability
      removalPolicy: RemovalPolicy.DESTROY, // Automatically delete the table when the stack is destroyed
    });

    new CfnOutput(this, "TableName", {
      value: this.table.tableName,
    });
  }
}
