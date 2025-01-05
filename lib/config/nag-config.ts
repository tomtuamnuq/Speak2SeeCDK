import { App, Aspects } from "aws-cdk-lib";
import { AwsSolutionsChecks } from "cdk-nag";
import {
  applyCommonSuppressions,
  applyDevSuppressions,
} from "./nag-suppressions";

/**
 * Applies AWS Solutions security checks and suppressions to the app
 */
export function addSecurityChecks(app: App, stage: string): void {
  // Add AWS Solutions security pack
  Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));
  applyCommonSuppressions(app);
  if (stage === "dev") {
    // Apply dev suppressions after all stacks are created
    applyDevSuppressions(app);
  }
}
