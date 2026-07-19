import { z } from "zod";

/**
 * A single X.509 certificate published for a trust service, together with the
 * key identifier used for AKI-based trust queries.
 */
export const TrustedListCertificateSchema = z.object({
    /** base64-encoded DER of the certificate, exactly as it appears in the list. */
    base64: z.string(),
    /**
     * Lowercase-hex SubjectKeyIdentifier of the certificate, when derivable.
     * This is the value a verifier sends to a wallet as an `aki` trusted
     * authority (HAIP), and the basis for AKI-based chain matching.
     */
    subjectKeyIdentifier: z.string().optional(),
});
export type TrustedListCertificate = z.infer<typeof TrustedListCertificateSchema>;

/**
 * A trust service (TSPService) entry: its type, status, and digital identities.
 */
export const TrustedListServiceSchema = z.object({
    /** `ServiceTypeIdentifier` URI (e.g. an AV `.../service-type/paa`). */
    serviceTypeIdentifier: z.string(),
    /** `ServiceStatus` URI (e.g. an AV `.../service-status/recognized`). */
    serviceStatus: z.string(),
    /** Human-readable service name, if present. */
    serviceName: z.string().optional(),
    /** Certificates from the service's `ServiceDigitalIdentity` entries. */
    certificates: z.array(TrustedListCertificateSchema),
});
export type TrustedListService = z.infer<typeof TrustedListServiceSchema>;

/**
 * A Trust Service Provider (TSP) and the services it operates.
 */
export const TrustServiceProviderSchema = z.object({
    name: z.string().optional(),
    services: z.array(TrustedListServiceSchema),
});
export type TrustServiceProvider = z.infer<typeof TrustServiceProviderSchema>;

/**
 * A parsed ETSI TS 119 612 Trusted List (`TrustServiceStatusList`).
 */
export const TrustedListSchema = z.object({
    /** `TSLType` URI. */
    tslType: z.string().optional(),
    /** `SchemeOperatorName` (English name when available). */
    schemeOperatorName: z.string().optional(),
    /** `TSLSequenceNumber`. */
    sequenceNumber: z.number().optional(),
    /** `ListIssueDateTime` (ISO 8601). */
    listIssueDateTime: z.string().optional(),
    /** `NextUpdate` (ISO 8601), when present. */
    nextUpdate: z.string().optional(),
    providers: z.array(TrustServiceProviderSchema),
});
export type TrustedList = z.infer<typeof TrustedListSchema>;

/**
 * A flattened trust anchor: one certificate with the service context it was
 * published under. This is the normalized unit both certificate-chain
 * validation and AKI emission consume — the ETSI TS 119 612 counterpart of a
 * `@owf/eudi-lote` TrustedEntity service certificate.
 */
export const TrustAnchorSchema = z.object({
    base64: z.string(),
    subjectKeyIdentifier: z.string().optional(),
    serviceTypeIdentifier: z.string(),
    serviceStatus: z.string(),
    providerName: z.string().optional(),
});
export type TrustAnchor = z.infer<typeof TrustAnchorSchema>;
