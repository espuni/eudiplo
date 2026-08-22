import { Buffer } from "node:buffer";
import { Crypto } from "@peculiar/webcrypto";
import { DOMParser } from "@xmldom/xmldom";
import * as xadesjs from "xadesjs";
import { TrustedListSignatureError } from "./errors";

const XMLDSIG_NS = "http://www.w3.org/2000/09/xmldsig#";

let engineInitialized = false;

/**
 * xadesjs needs a WebCrypto engine. Set it once, lazily, so importing this
 * package has no side effects until a signature is actually verified.
 */
function ensureEngine(): void {
    if (!engineInitialized) {
        xadesjs.Application.setEngine("NodeJS", new Crypto());
        engineInitialized = true;
    }
}

export interface VerifyTrustedListOptions {
    /**
     * DER-encoded certificates the trusted list's signer certificate must match.
     * When provided, verification fails closed unless the embedded signer
     * certificate equals one of these anchors — establishing that the list was
     * signed by the expected scheme operator, not merely by *some* key.
     *
     * When omitted, only the cryptographic validity of the enveloped signature
     * is checked; that proves integrity, NOT trust. Production callers should
     * always pin the scheme operator certificate(s).
     */
    trustAnchors?: Uint8Array[];
}

export interface VerifyTrustedListResult {
    /** base64-encoded DER of the signer certificate from the signature KeyInfo. */
    signerCertificateBase64: string;
}

/**
 * Verify the enveloped XAdES/XMLDSig signature of an ETSI TS 119 612 Trusted
 * List. Throws {@link TrustedListSignatureError} when the signature is missing,
 * invalid, or (with `trustAnchors`) not signed by a pinned scheme operator.
 *
 * Verified against the EU Age Verification acceptance and production lists
 * (RSA-SHA512, exclusive C14N, XAdES SignedProperties).
 */
export async function verifyTrustedListSignature(
    xml: string,
    options: VerifyTrustedListOptions = {},
): Promise<VerifyTrustedListResult> {
    ensureEngine();

    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const signatures = doc.getElementsByTagNameNS(XMLDSIG_NS, "Signature");
    if (signatures.length === 0) {
        throw new TrustedListSignatureError(
            "No ds:Signature found in the trusted list",
        );
    }

    // xadesjs is typed against the lib.dom DOM; @xmldom implements the same
    // shape at runtime, so bridge the two nominal types at this boundary only.
    const signedXml = new xadesjs.SignedXml(doc as unknown as Document);
    signedXml.LoadXml(signatures[0] as unknown as Element);

    let valid: boolean;
    try {
        valid = await signedXml.Verify();
    } catch (error) {
        throw new TrustedListSignatureError(
            `Trusted list signature could not be verified: ${
                error instanceof Error ? error.message : String(error)
            }`,
        );
    }
    if (!valid) {
        throw new TrustedListSignatureError(
            "Trusted list signature is invalid",
        );
    }

    // The signature KeyInfo carries the signer certificate (ds:X509Certificate,
    // namespace-scoped so it never picks up service certificates).
    const signerCertEl = signatures[0].getElementsByTagNameNS(
        XMLDSIG_NS,
        "X509Certificate",
    )[0];
    if (!signerCertEl?.textContent) {
        throw new TrustedListSignatureError(
            "Trusted list signature has no X509Certificate in KeyInfo",
        );
    }
    const signerCertificateBase64 = signerCertEl.textContent.replace(/\s/g, "");

    if (options.trustAnchors && options.trustAnchors.length > 0) {
        const signerDer = Buffer.from(signerCertificateBase64, "base64");
        const trusted = options.trustAnchors.some((anchor) =>
            Buffer.from(anchor).equals(signerDer),
        );
        if (!trusted) {
            throw new TrustedListSignatureError(
                "Trusted list signer certificate is not among the configured trust anchors",
            );
        }
    }

    return { signerCertificateBase64 };
}
