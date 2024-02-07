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
  ValidateSignatureResult,
  CreateSignatureOptions,
  ValidateSignatureOptions,
};
