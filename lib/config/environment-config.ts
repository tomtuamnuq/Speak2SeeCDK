import { RemovalPolicy } from "aws-cdk-lib";

export interface EnvironmentConfig {
  readonly environment: string;
  readonly region: string;
  readonly account: string;
  readonly bucketName: string;
  readonly tableName: string;
  readonly restApiName: string;
  readonly userPoolName: string;
  readonly removalPolicy: RemovalPolicy;
  readonly advancedSecurity: boolean;
  readonly itemExpirationDays: number;
  readonly logRetentionDays: number;
  readonly tags: {
    readonly project: string;
    readonly environment: string;
    readonly costCenter: string;
  };
}

// Create stacks with environment-specific naming
export function stackName(baseName: string, stage: string) {
  return `speak2see-${baseName}-${stage}`;
}

export function getConfig(stage: string): EnvironmentConfig {
  const defaultConfig = {
    project: "Speak2See",
    costCenter: "Speech-Services",
  };

  const configs: { [key: string]: EnvironmentConfig } = {
    dev: {
      environment: "Development",
      region: "eu-west-2",
      account:
        process.env.CDK_DEPLOY_ACCOUNT || process.env.CDK_DEFAULT_ACCOUNT!,
      bucketName: "tuamnuq-speak2see-bucket-dev",
      tableName: "tuamnuq-speak2see-table-dev",
      restApiName: "tuamnuq-speak2see-api-dev",
      userPoolName: "tuamnuq-speak2see-users-dev",
      removalPolicy: RemovalPolicy.RETAIN,
      advancedSecurity: false,
      itemExpirationDays: 1,
      logRetentionDays: 1,
      tags: {
        ...defaultConfig,
        environment: "Development",
      },
    },
    prod: {
      environment: "Production",
      region: "eu-west-2",
      account:
        process.env.CDK_DEPLOY_ACCOUNT || process.env.CDK_DEFAULT_ACCOUNT!,
      bucketName: "tuamnuq-speak2see-bucket-prod",
      tableName: "tuamnuq-speak2see-table-prod",
      restApiName: "tuamnuq-speak2see-api-prod",
      userPoolName: "tuamnuq-speak2see-users-prod",
      removalPolicy: RemovalPolicy.RETAIN,
      advancedSecurity: true,
      itemExpirationDays: 30,
      logRetentionDays: 60,
      tags: {
        ...defaultConfig,
        environment: "Production",
      },
    },
  };

  const config = configs[stage];
  if (!config) {
    throw new Error(`No configuration found for stage: ${stage}`);
  }

  return config;
}
