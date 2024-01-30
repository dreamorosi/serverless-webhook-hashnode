import type { CloudFrontRequestEvent } from "aws-lambda";
import { SignatureV4 } from "@smithy/signature-v4";
import { Logger } from "@aws-lambda-powertools/logger";
import { SecretsProvider } from "@aws-lambda-powertools/parameters/secrets";
import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { HttpRequest, Sha256, validateSignature } from "./utils";

const logger = new Logger({ logLevel: "DEBUG" });

const signer = new SignatureV4({
	credentials: {
		accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
		secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
		sessionToken: process.env.AWS_SESSION_TOKEN || "",
	},
	region: process.env.AWS_REGION || "us-east-1",
	service: "lambda",
	sha256: Sha256,
});

const secretsProvider = new SecretsProvider({
	awsSdkV3Client: new SecretsManagerClient({
		region: "us-east-1",
	}),
});

const decoder = new TextDecoder();

export const handler = async (event: CloudFrontRequestEvent) => {
	const request = event.Records[0].cf.request;
	logger.debug("request", {
		request,
	});
	const { headers, uri, body, method } = request;
	const eventBody = JSON.parse(
		decoder.decode(
			Buffer.from(body?.data || "", body?.encoding as BufferEncoding),
		),
	);

	const hashnodeSecret = await secretsProvider.get<string>(
		"hashnode/webhook-secret",
	);
	const hashnodeSignature = headers["x-hashnode-signature"][0].value || null;

	const result = validateSignature({
		incomingSignatureHeader: hashnodeSignature,
		payload: eventBody,
		secret: hashnodeSecret || "",
	});
	if (result.isValid === false) {
		logger.error("invalid signature", {
			result: result.reason,
		});

		throw new Error("invalid signature");
	}

	const host = headers.host[0].value;
	const url = new URL(`https://${host}${uri}`);
	const req = new HttpRequest({
		hostname: url.hostname,
		path: `${url.pathname}${url.search}`,
		method,
		headers: {},
		body: body?.data
			? Buffer.from(body.data, body.encoding as BufferEncoding)
			: undefined,
	});

	for (const [key, value] of Object.entries(headers)) {
		if (key === "x-forwarded-for") continue;
		req.headers[key] = value[0].value;
	}
	const region = headers.host[0].value.split(".")[2];

	const signed = await signer.sign(req, {
		signingRegion: region,
	});

	for (const header in signed.headers) {
		request.headers[header.toLowerCase()] = [
			{
				key: header,
				value: signed.headers[header],
			},
		];
	}

	// biome-ignore lint/performance/noDelete: this is required to remove the x-forwarded-for header
	delete request.headers["x-forwarded-for"];

	return request;
};
