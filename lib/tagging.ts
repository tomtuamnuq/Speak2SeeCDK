import { Tags } from "aws-cdk-lib";
import { Construct } from "constructs";

export interface ProjectTags {
  project: string;
  environment: string;
  costCenter: string;
}

export function addProjectTags(scope: Construct, tags: ProjectTags) {
  // Add tags to all resources in the scope
  Tags.of(scope).add("Project", tags.project);
  Tags.of(scope).add("Environment", tags.environment);
  Tags.of(scope).add("CostCenter", tags.costCenter);
}
