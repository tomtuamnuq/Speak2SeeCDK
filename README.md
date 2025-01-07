# Speak2See Project

## Overview

Speak2See is an AWS-based workflow for transforming an uploaded audio file into a final rich media result. The pipeline:

1. Accepts an uploaded `.wav` audio file via a REST API.
2. Uses Amazon Transcribe to convert speech to text.
3. Leverages Amazon Bedrock's Titan Text Express model to generate an optimized image generation prompt from the transcription.
4. Uses the generated prompt with Amazon Bedrock's Titan Image Generator to create an image.
5. Stores results (transcription, prompt, and image) in Amazon S3 and DynamoDB.
6. Allows retrieval of both in-progress and finished results via API endpoints.

The infrastructure is built with the AWS CDK, defining stacks for authentication (Cognito), data storage (S3, DynamoDB), workflow orchestration (Step Functions Express), and API integration (API Gateway + Lambda). The solution implements Express state machines to optimize costs for shorter-duration, higher-volume workloads, while maintaining AWS Solutions security best practices through `cdk-nag`.

## Architecture

### Stacks

- **AuthStack**: Creates a Cognito User Pool and Client for user authentication.
- **DataStack**: Creates the S3 bucket for audio/image files and the DynamoDB table that tracks processing items.
- **Speak2SeeCdkStack**: Defines the workflow (Step Functions), integrating Transcribe, and Bedrock tasks. Also configures Lambda functions to finalize and manage results, and updates the DynamoDB table.
- **ApiStack**: Integrates API Gateway with Lambda functions for `/upload`, `/getAll`, and `/get/{itemID}` endpoints, using Cognito for authentication.

### Workflow Parts

- **TranscribeWorkflow (lib/workflow/transcribe.ts)**:

  - Orchestrates Amazon Transcribe calls and waits until transcription is complete.
  - On success, proceeds to further processing steps; on failure, updates status in DynamoDB to `TRANSCRIPTION_FAILED`.
  - Implements polling with Express state machine for cost-efficient execution.

- **image-prompt Lambda (lib/workflow/image-prompt.ts)**:

  - Processes the transcription text using Amazon Bedrock's Titan Text Express model.
  - Generates an optimized image prompt that captures key visual elements and mood.
  - Handles failures by falling back to truncated transcription text.

- **Text2Image Construct (lib/workflow/bedrock.ts)**:

  - Uses Amazon Bedrock’s Titan model to generate an image from a prompt.
  - Outputs the result in S3 for the finalization step.

- **finalize Lambda (lib/workflow/finalize.ts)**:

  - Once the workflow is complete, fetches the generated data from S3.
  - Uploads final image to S3, updates DynamoDB with `FINISHED` status, and sets transcription/prompt.

### ProcessingStatus Enum

- `IN_PROGRESS`, `FINISHED`, `IMAGE_FAILURE`, `TRANSCRIPTION_FAILURE`

  This helps track each item’s state throughout the pipeline.

## Lambda Functions and API Endpoints

- **`POST /upload`**:

  - Uploads an audio file to S3 and starts a Step Functions workflow.
  - Size of the audio file is limited to 3 MB.
  - Returns a unique ID, creation timestamp, and initial processing status.
  - Creates a DynamoDB item with status `IN_PROGRESS`.

- **`GET /getAll`**:

  - Queries DynamoDB to retrieve all items for the authenticated user, including IDs and their current processing statuses.

- **`GET /get/{itemID}`**:

  - Returns the audio file, and for completed items, the generated image, transcription, and prompt.
  - Keeps the total size under the 6MB lambda response limit: 3MB audio + 1MB image + 100KB text (considering base64 encoding)
  - Handles failed or incomplete items gracefully, returning only the available data.

## Testing

The project includes extensive unit and integration tests:

### Unit Tests

- **test/unit/** directory contains tests for each Lambda and construct.
- **upload test (test/unit/api/upload.test.ts)** checks S3, Step Functions start execution, and DynamoDB creation.
- **getAll test (test/unit/api/getAll.test.ts)** checks DynamoDB query and returned structure.
- **get test (test/unit/api/get.test.ts)** validates behavior for `FINISHED` vs non-finished items.
- **image-prompt test (test/unit/workflow/image-prompt.test.ts)** ensures transcription processing and prompt generation.
- **finalize test (test/unit/workflow/finalize.test.ts)** ensures final step updates DynamoDB and saves image.
- **transcribe test (test/unit/workflow/transcribe.test.ts)** verifies the Step Functions fragment for transcription logic.
- **Text2Image test (test/unit/workflow/bedrock.test.ts)** checks the Bedrock image generation task configuration.

These tests mock AWS SDK calls with `aws-sdk-client-mock` to ensure logic correctness without hitting AWS services. They require an authentication token for ECR public repository to pull the `SAM` docker images for local execution of lambda functions. To resolve an ECR authentication error, run:

```bash
aws ecr-public get-login-password --region us-east-1 | docker login --username AWS --password-stdin public.ecr.aws
```

Run all the unit tests:

```bash
npm test -- test/unit
```

### Integration Tests

- **test/integration/speak2_see_cdk.test.ts**:
  - Tests the full stack after deployment.
  - At least one finished and one unfinished item should exist before all tests succeed (run two times if necessary to create the first finished item).
  - Creates a test user with the `client-cognito-identity-provider` AWS SDK.
  - Uses `axios` to call `/upload`, `/getAll`, `/get/{itemID}` endpoints.
  - Validates that finished items return all fields as truthy and unfinished items return at least audio and processingStatus.

Set `USERNAME`, `PASSWORD`, and `EMAIL` in a `.env` file for integration tests (in `/test/integration/.env`). Ensure that the deployment outputs exist in `shared/outputs-dev.json`.

Run the integration tests:

```bash
npm test -- test/integration
```

## Deployment

The project supports separate deployments for development and production environments.

### Development Environment

```bash
# Deploy development stack
npm run deploy:dev

# Review changes before deployment
npm run diff:dev

# Destroy development stack
npm run destroy:dev
```

For integration testing, the `dev` deployment outputs are written to `./shared/outputs-dev.json`.
