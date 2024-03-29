import {
	Stack,
	type StackProps,
	AssetHashType,
	RemovalPolicy,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import { Distribution, experimental } from "aws-cdk-lib/aws-cloudfront";
import { join, resolve } from "node:path";
import { Code, Runtime } from "aws-cdk-lib/aws-lambda";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { execSync } from "node:child_process";
import { StringParameter } from "aws-cdk-lib/aws-ssm";

export class ServerlessWebhookAuthStack extends Stack {
	public readonly distribution: Distribution;

	constructor(scope: Construct, id: string, props?: StackProps) {
		super(scope, id, props);

		// Import the secret from your account
		const secret = Secret.fromSecretNameV2(
			this,
			"hashnodeSecret",
			"hashnode/webhook-secret",
		);

		// Create the auth function that will be deployed to the edge
		const authFunctionBasePath = resolve("src", "functions", "auth");
		const authFunction = new experimental.EdgeFunction(this, "authAtEdgeFn", {
			handler: "index.handler",
			runtime: Runtime.NODEJS_20_X,
			currentVersionOptions: {
				removalPolicy: RemovalPolicy.DESTROY,
			},
			code: Code.fromAsset(authFunctionBasePath, {
				assetHashType: AssetHashType.OUTPUT,
				bundling: {
					// This is not used becuase we bundle locally, but it's required in the types
					image: Runtime.NODEJS_20_X.bundlingImage,
					local: {
						tryBundle(outputDir: string) {
							execSync(
								[
									"npx esbuild",
									`--bundle ${join(authFunctionBasePath, "index.ts")}`,
									`--outfile="${join(outputDir, "index.mjs")}"`,
									'--target="node20"',
									"--format=esm",
									'--platform="node"',
									'--main-fields="module,main"',
									"--minify",
									"--sourcemap",
									"--metafile=out.json",
									"--tree-shaking=true",
								].join(" "),
							);

							return true;
						},
					},
				},
			}),
		});
		// Allow the auth function to invoke the webhook function via function URL
		// here we keep the resource ARN generic so that we can avoid a circular
		// dependency between the stacks. For production use, you should specify
		// the full ARN of the webhook function.
		authFunction.addToRolePolicy(
			new PolicyStatement({
				sid: "AllowInvokeFunctionUrl",
				effect: Effect.ALLOW,
				actions: ["lambda:InvokeFunctionUrl"],
				resources: [`arn:aws:lambda:*:${this.account}:function:*-webhookFn*`],
				conditions: {
					StringEquals: { "lambda:FunctionUrlAuthType": "AWS_IAM" },
				},
			}),
		);
		// Allow the auth function to read the secret to validate the signature
		secret.grantRead(authFunction);

		// Store the version of the auth function that will be deployed to the edge
		new StringParameter(this, "authFunctionVersionParam", {
			parameterName: "ServerlessWebhookAuthFunctionVersion",
			stringValue: `${authFunction.functionArn}`,
		});
	}
}
