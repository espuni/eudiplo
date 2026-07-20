/**
 * Base error for all trusted-list processing failures.
 */
export class TrustedListError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "TrustedListError";
    }
}

/**
 * The XML could not be parsed as an ETSI TS 119 612 `TrustServiceStatusList`.
 */
export class TrustedListParseError extends TrustedListError {
    constructor(message: string) {
        super(message);
        this.name = "TrustedListParseError";
    }
}

/**
 * The trusted list's own XAdES/XMLDSig signature is missing, invalid, or does
 * not chain to a configured trust anchor. Callers MUST treat this as
 * fail-closed: a trusted list whose authenticity cannot be established must not
 * be used to trust credentials.
 */
export class TrustedListSignatureError extends TrustedListError {
    constructor(message: string) {
        super(message);
        this.name = "TrustedListSignatureError";
    }
}
