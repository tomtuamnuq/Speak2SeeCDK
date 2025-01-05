import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
} from "aws-cdk-lib";
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
  IBucket,
} from "aws-cdk-lib/aws-s3";
import {
  AttributeType,
  BillingMode,
  Table,
  ITable,
} from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";

interface DataStackProps extends StackProps {
  bucketName: string;
  tableName: string;
  removalPolicy: RemovalPolicy;
  advancedSecurity: boolean;
  itemExpirationDays: number;
  logRetentionDays: number;
}

export class DataStack extends Stack {
  public readonly bucket: IBucket;
  public readonly table: ITable;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);
    // Create the S3 bucket
    this.bucket = new Bucket(this, "S3Bucket", {
      bucketName: props.bucketName, // unique bucket name
      removalPolicy: props.removalPolicy,
      autoDeleteObjects: props.removalPolicy === RemovalPolicy.DESTROY,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      encryption: BucketEncryption.S3_MANAGED,
      lifecycleRules: [
        {
          id: "optimize-storage-costs",
          enabled: true,
          expiration: Duration.days(props.itemExpirationDays),
        },
      ],
      serverAccessLogsBucket: new Bucket(this, "AccessLogsBucket", {
        enforceSSL: true,
        encryption: BucketEncryption.S3_MANAGED,
        lifecycleRules: [
          {
            expiration: Duration.days(props.logRetentionDays),
          },
        ],
      }),
    });

    new CfnOutput(this, "BucketName", {
      value: this.bucket.bucketName,
    });

    // Create the DynamoDB table
    this.table = new Table(this, "DynamoDBTable", {
      tableName: props.tableName,
      partitionKey: { name: "userID", type: AttributeType.STRING }, // Partition key: userID
      sortKey: { name: "itemID", type: AttributeType.STRING }, // key for common operations: itemID
      billingMode: BillingMode.PAY_PER_REQUEST, // On-demand pricing for scalability
      removalPolicy: props.removalPolicy,
      timeToLiveAttribute: "ttl", // Enable TTL for item expiration
      pointInTimeRecovery: props.advancedSecurity,
    });

    new CfnOutput(this, "TableName", {
      value: this.table.tableName,
    });
  }
}
