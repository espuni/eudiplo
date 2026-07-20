import { JWK } from "jose";

export type RulebookTrustListRef = {
    url: string; // e.g. https://.../pid-provider.jwt
    // material to verify the trustlist JWT (out of scope here)
    // could be JWK, PEM, kid, etc.
    verifierKey?: JWK;
    /**
     * Trusted list format. Defaults to `lote-json` (ETSI TS 119 602, a signed
     * JSON JWT). Use `etsi-xml` for a classic ETSI TS 119 612 XML
     * `TrustServiceStatusList` (e.g. the EU Age Verification trusted list).
     */
    format?: "lote-json" | "etsi-xml";
    /**
     * `etsi-xml` only: PEM or base64-DER scheme operator certificate(s) the
     * list's XAdES signature must be signed by. Required to establish trust —
     * without it the list's authenticity is not pinned.
     */
    signerCertificates?: string[];
    /**
     * `etsi-xml` only: `ServiceStatus` URIs that count as trusted (e.g. the AV
     * `.../service-status/recognized`). Services with any other status
     * (deprecated/withdrawn) are excluded. When omitted, all services are kept.
     */
    acceptedServiceStatus?: string[];
    /**
     * `etsi-xml` only: rename source `ServiceTypeIdentifier` URIs to the
     * internal identifiers used for matching. E.g. map the AV
     * `.../service-type/paa` to `http://uri.etsi.org/19602/SvcType/EAA/Issuance`
     * so AV anchors match the standard issuance service-type filter.
     */
    serviceTypeMap?: Record<string, string>;
};

export type ServiceTypeIdentifier = string;

/** Well-known service type identifiers from ETSI TS 119 602 */
export const ServiceTypeIdentifiers = {
    EaaIssuance: "http://uri.etsi.org/19602/SvcType/EAA/Issuance",
    EaaRevocation: "http://uri.etsi.org/19602/SvcType/EAA/Revocation",
    /** Wallet provider service type for wallet attestation validation */
    WalletProvider: "http://uri.etsi.org/19602/SvcType/WalletProvider",
} as const;

/**
 * A service certificate from a TrustedEntity in a LoTE.
 */
export type TrustedEntityServiceCert = {
    serviceTypeIdentifier: ServiceTypeIdentifier;
    certValue: string; // PEM or base64 DER
};

/**
 * A TrustedEntity from a LoTE, containing its services grouped together.
 * This preserves the relationship between issuance and revocation certificates
 * from the same entity.
 */
export type TrustedEntity = {
    /** Entity identifier, if available */
    entityId?: string;
    /** All services for this entity */
    services: TrustedEntityServiceCert[];
};

/**
 * Helper to find a specific service type within a TrustedEntity.
 */
function findServiceByType(
    entity: TrustedEntity,
    serviceType: ServiceTypeIdentifier,
): TrustedEntityServiceCert | undefined {
    return entity.services.find((s) => s.serviceTypeIdentifier === serviceType);
}

/**
 * Get the issuance certificate from a TrustedEntity.
 */
function _getIssuanceCert(
    entity: TrustedEntity,
): TrustedEntityServiceCert | undefined {
    return findServiceByType(entity, ServiceTypeIdentifiers.EaaIssuance);
}

/**
 * Get the revocation certificate from a TrustedEntity.
 */
export function getRevocationCert(
    entity: TrustedEntity,
): TrustedEntityServiceCert | undefined {
    return findServiceByType(entity, ServiceTypeIdentifiers.EaaRevocation);
}

export type FederationTrustMode = "federation-only" | "lote-only" | "hybrid";

type FederationTrustAnchorRef = {
    entityId: string;
    entityConfigurationUri: string;
};

export type FederationTrustSource = {
    mode?: FederationTrustMode;
    entityId?: string;
    trustAnchors: FederationTrustAnchorRef[];
    cacheTtlSeconds?: number;
    enforceSigningPolicy?: boolean;
};

export const DEFAULT_VERIFIER_SKEW_SECONDS = 60;

export type VerifierOptions = {
    trustListSource?: TrustListSource;
    federationTrustSource?: FederationTrustSource;
    policy: VerifyPolicy;
    /**
     * Transaction data from the OID4VP request.
     * When provided, the verifier will validate that the KB-JWT contains
     * transaction_data_hashes that match SHA-256 hashes of each transaction data string.
     * See OID4VP spec Appendix B.3.3.1 for details.
     */
    transactionData?: string[];
    /**
     * Expected KB-JWT audience for SD-JWT VC key binding validation.
     * Usually the verifier client_id from the presentation request.
     */
    keyBindingAudience?: string;
    /**
     * SD-JWT required disclosed claim keys.
     */
    requiredClaimKeys?: string[];
    /**
     * SD-JWT key binding nonce.
     */
    keyBindingNonce?: string;
    /**
     * Allow for clock skew when validating JWTs and SD-JWTs.
     * Default is 60 seconds.
     */
    skewSeconds?: number;
};

export type TrustListSource = {
    lotes: RulebookTrustListRef[];
    // which service types from LoTE you want to accept as issuer identities
    acceptedServiceTypes?: ServiceTypeIdentifier[];
};

/**
 * Verifier-side settings for a trust list, keyed by its URL. Kept out of the
 * DCQL `trusted_authorities` (which is sent to the wallet) so signer anchors and
 * mapping stay internal to the verifier.
 */
export type TrustListRefConfig = {
    /** Trust list URL, matching a `trusted_authorities` value (pre-`<TENANT_URL>`). */
    url: string;
    format?: "lote-json" | "etsi-xml";
    signerCertificates?: string[];
    serviceTypeMap?: Record<string, string>;
    acceptedServiceStatus?: string[];
};

/**
 * Build trust list refs from `trusted_authorities` values, merging any
 * per-URL verifier-side config (format, signer anchors, service-type mapping).
 */
export function buildTrustListRefs(
    values: string[],
    tenantHost: string,
    configs?: TrustListRefConfig[] | null,
): RulebookTrustListRef[] {
    return values.map((value) => {
        const url = value.replaceAll("<TENANT_URL>", tenantHost);
        const cfg = configs?.find((c) => c.url === value || c.url === url);
        return {
            url,
            format: cfg?.format,
            signerCertificates: cfg?.signerCertificates,
            serviceTypeMap: cfg?.serviceTypeMap,
            acceptedServiceStatus: cfg?.acceptedServiceStatus,
        };
    });
}

type VerifyPolicy = {
    requireX5c: boolean;
    revocation?: {
        enabled: boolean;
        failClosed?: boolean;
        fetchTimeoutMs?: number;
        cacheTtlMs?: number;
    };
    // If LoTE cert is CA=FALSE, treat it as pin:
    // - "leaf": require leaf cert to equal pinned cert
    // - "pathEnd": require chain to terminate at pinned cert (rare)
    pinnedCertMode?: "leaf" | "pathEnd";
};
