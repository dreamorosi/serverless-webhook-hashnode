import {
  Stack,
  type StackProps,
  RemovalPolicy,
  CfnOutput,
  Duration,
  Fn,
  Arn,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  AllowedMethods,
  CachePolicy,
  Distribution,
  LambdaEdgeEventType,
  OriginRequestPolicy,
  ResponseHeadersPolicy,
  ViewerProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import {
  BlockPublicAccess,
  Bucket,
  BucketAccessControl,
  ObjectOwnership,
} from "aws-cdk-lib/aws-s3";
import { HttpOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import { join } from "node:path";
import {
  Runtime,
  FunctionUrlAuthType,
  HttpMethod,
} from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import { Version } from "aws-cdk-lib/aws-lambda";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import { EventBus, Match, Rule } from "aws-cdk-lib/aws-events";
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  PhysicalResourceId,
} from "aws-cdk-lib/custom-resources";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";

export class ServerlessWebhookApiStack extends Stack {
  public readonly distribution: Distribution;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Import the function version from the webhook auth stack by using ssm
    const authFunctionVersionReader = new SSMParameterReader(
      this,
      "authAtEdgeFnVersionReader",
      {
        parameterName: "ServerlessWebhookAuthFunctionVersion",
        region: "us-east-1",
      }
    );
    const authFunctionVersion = Version.fromVersionArn(
      this,
      "authAtEdgeFnVersion",
      authFunctionVersionReader.getParameterValue()
    );

    // Create the DynamoDB table for storing idempotency records
    const table = new Table(this, "idempotencyTable", {
      partitionKey: {
        name: "id",
        type: AttributeType.STRING,
      },
      timeToLiveAttribute: "expiration",
      billingMode: BillingMode.PAY_PER_REQUEST,
    });

    // Create the EventBridge event bus for the events sent to the webhook
    const eventBus = new EventBus(this, "webhookEventBus", {
      eventBusName: "serverlessWebhookEvents",
    });

    // Create the webhook handler function
    const webhookHandlerFn = new NodejsFunction(this, "webhookFn", {
      runtime: Runtime.NODEJS_20_X,
      memorySize: 256,
      timeout: Duration.seconds(20),
      entry: join(__dirname, "./functions/api/index.ts"),
      handler: "handler",
      bundling: {
        minify: true,
        mainFields: ['module', 'main'],
        sourceMap: true,
        format: OutputFormat.ESM,
        platform: 'node',
        esbuildArgs: {
          '--packages': 'bundle'
        }
      },
      environment: {
        IDEMPOTENCY_TABLE_NAME: table.tableName,
        EVENT_BUS_NAME: eventBus.eventBusName,
      },
    });
    // Create a function URL for the webhook handler function
    const webhookHandlerFnUrl = webhookHandlerFn.addFunctionUrl({
      authType: FunctionUrlAuthType.AWS_IAM,
      cors: {
        allowedMethods: [HttpMethod.GET, HttpMethod.POST],
        allowedOrigins: ["*"],
        allowCredentials: true,
        allowedHeaders: ["*"],
      },
    });
    // Allow the webhook handler function to read/write to the DynamoDB table
    table.grantReadWriteData(webhookHandlerFn);
    // Allow the webhook handler function to publish events to the event bus
    eventBus.grantPutEventsTo(webhookHandlerFn);

    // Create the distribution for the webhook handler
    this.distribution = new Distribution(this, "webhookDistribution", {
      comment: "Webhook Distribution",
      defaultBehavior: {
        origin: new HttpOrigin(
          Fn.select(2, Fn.split("/", webhookHandlerFnUrl.url))
        ),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: CachePolicy.CACHING_DISABLED,
        originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        responseHeadersPolicy:
          ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT_AND_SECURITY_HEADERS,
        // Add the auth function as a Lambda@Edge function for the origin request
        edgeLambdas: [
          {
            functionVersion: authFunctionVersion,
            eventType: LambdaEdgeEventType.ORIGIN_REQUEST,
            includeBody: true,
          },
        ],
        allowedMethods: AllowedMethods.ALLOW_ALL,
      },
      errorResponses: [{ httpStatus: 404, responsePagePath: "/" }],
      enableLogging: true,
      logBucket: new Bucket(this, "cfAccessLogsBucket", {
        removalPolicy: RemovalPolicy.DESTROY,
        autoDeleteObjects: true,
        blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
        accessControl: BucketAccessControl.PRIVATE,
        objectOwnership: ObjectOwnership.BUCKET_OWNER_PREFERRED,
        enforceSSL: true,
      }),
    });

    // Set the distribution domain name as an output for easy access
    new CfnOutput(this, "distribution", {
      value: `https://${this.distribution.distributionDomainName}`,
    });

    // Create the consumer function for the EventBridge events
    const consumerFn = new NodejsFunction(this, "consumerFn", {
      runtime: Runtime.NODEJS_20_X,
      memorySize: 512,
      timeout: Duration.seconds(20),
      entry: join(__dirname, "./functions/consumer/index.ts"),
      handler: "handler",
      bundling: {
        minify: true,
        mainFields: ['module', 'main'],
        sourceMap: true,
        format: OutputFormat.ESM,
        platform: 'node',
        esbuildArgs: {
          '--packages': 'bundle'
        }
      },
    });

    const postEventRule = new Rule(this, "postEventRule", {
      eventBus: eventBus,
      eventPattern: {
        source: Match.exactString("serverlessWebhookApi"),
      },
    });
    postEventRule.addTarget(new LambdaFunction(consumerFn));
  }
}

interface SSMParameterReaderProps {
  parameterName: string;
  region: string;
}

function removeLeadingSlash(value: string): string {
  return value.slice(0, 1) === "/" ? value.slice(1) : value;
}

export class SSMParameterReader extends AwsCustomResource {
  constructor(scope: Construct, name: string, props: SSMParameterReaderProps) {
    const { parameterName, region } = props;

    super(scope, name, {
      onUpdate: {
        service: "SSM",
        action: "getParameter",
        parameters: {
          Name: parameterName,
        },
        region,
        physicalResourceId: PhysicalResourceId.of(Date.now().toString()),
      },
      policy: AwsCustomResourcePolicy.fromSdkCalls({
        resources: [
          Arn.format(
            {
              service: "ssm",
              region: props.region,
              resource: "parameter",
              resourceName: removeLeadingSlash(parameterName),
            },
            Stack.of(scope)
          ),
        ],
      }),
    });
  }

  public getParameterValue(): string {
    return this.getResponseField("Parameter.Value").toString();
  }
}
