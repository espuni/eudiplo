/**
 * @eudiplo/etsi-trusted-list
 *
 * Parse and verify ETSI TS 119 612 XML Trusted Lists and expose normalized
 * trust anchors. Companion to `@owf/eudi-lote` (ETSI TS 119 602, JSON): both
 * resolve to the same normalized notion of a trust anchor, so a verifier can
 * consume either format and, for example, derive AKIs to send to a wallet.
 */
export {
    ACTIVE_SERVICE_STATUSES,
    ServiceStatus,
    ServiceType,
    TSLType,
} from "./constants";
export {
    TrustedListError,
    TrustedListParseError,
    TrustedListSignatureError,
} from "./errors";
export {
    getTrustAnchors,
    parseTrustedList,
    type TrustAnchorFilter,
} from "./parse";
export {
    type DigitalIdentity,
    DigitalIdentitySchema,
    type ServiceHistoryInstance,
    ServiceHistoryInstanceSchema,
    type TrustAnchor,
    TrustAnchorSchema,
    type TrustedList,
    type TrustedListPointer,
    TrustedListPointerSchema,
    TrustedListSchema,
    type TrustedListService,
    TrustedListServiceSchema,
    type TrustServiceProvider,
    TrustServiceProviderSchema,
} from "./types";
export {
    assertValidTrustedList,
    type ProfileRule,
    type ValidationError,
    type ValidationResult,
    validateTrustedList,
    validateTrustedListProfile,
} from "./validate";
export {
    verifyTrustedListSignature,
    type VerifyTrustedListOptions,
    type VerifyTrustedListResult,
} from "./verify";

import { parseTrustedList } from "./parse";
import type { TrustedList } from "./types";
import {
    type VerifyTrustedListOptions,
    verifyTrustedListSignature,
} from "./verify";

/**
 * Verify the trusted list signature and, only if it is valid, parse it. This is
 * the safe entry point: it never returns a {@link TrustedList} whose
 * authenticity has not been established.
 */
export async function loadTrustedList(
    xml: string,
    options: VerifyTrustedListOptions = {},
): Promise<TrustedList> {
    await verifyTrustedListSignature(xml, options);
    return parseTrustedList(xml);
}
