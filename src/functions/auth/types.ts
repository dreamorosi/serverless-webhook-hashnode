type HttpMessage = {
	headers: Headers;
	body?: unknown;
};

type HttpRequestOptions = Partial<HttpMessage> &
	Partial<URI> & {
		method?: string;
	};

type QueryParameters = Record<string, string | Array<string> | null>;

type Headers = Record<string, string>;

type URI = {
	protocol: string;
	hostname: string;
	port?: number;
	path: string;
	query?: QueryParameters;
	username?: string;
	password?: string;
	fragment?: string;
};

export interface HttpRequest extends HttpMessage, URI {
	method: string;
}

export declare class HttpRequest implements URI {
	method: string;
	protocol: string;
	hostname: string;
	port?: number;
	path: string;
	query: QueryParameters;
	headers: Headers;
	username?: string;
	password?: string;
	fragment?: string;
	body?: unknown;
	constructor(options: HttpRequestOptions);
	static isInstance(request: unknown): request is HttpRequest;
	clone(): HttpRequest;
}

type CreateSignatureOptions = {
	/**
	 * The timestamp of the signature.
	 */
	timestamp: number;
	/**
	 * The payload to be signed.
	 */
	payload?: Record<string, unknown>;
	/**
	 * The secret of your webhook (`whsec_...`).
	 */
	secret: string;
};

type ValidateSignatureOptions = {
	/**
	 * The content of the signature header.
	 */
	incomingSignatureHeader: string | null;
	/**
	 * The payload that was signed.
	 */
	payload?: Record<string, unknown>;
	/**
	 * The secret of your webhook (`whsec_...`).
	 */
	secret: string;
	/**
	 * The number of seconds that the timestamp can differ from the current time before the request is rejected. Provide 0 to disable the check.
	 */
	validForSeconds?: number;
};

type ValidateSignatureResult =
	| { isValid: true }
	| { isValid: false; reason: string };

export type {
	QueryParameters,
	Headers,
	HttpRequestOptions,
	ValidateSignatureResult,
	CreateSignatureOptions,
	ValidateSignatureOptions,
};
