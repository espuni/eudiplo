import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
    getTrustAnchors,
    loadTrustedList,
    parseTrustedList,
    TrustedListSignatureError,
    verifyTrustedListSignature,
} from "../src/index";

const fixture = (name: string) =>
    readFileSync(join(__dirname, "fixtures", name), "utf8");

const acceptance = fixture("av-tl-acceptance.xml");
const production = fixture("av-tl-production.xml");

const AV_SERVICE_TYPE =
    "http://trust.tech.ec.europa.eu/lists/age-verification/service-type/paa";
const AV_STATUS_RECOGNIZED =
    "http://trust.tech.ec.europa.eu/lists/age-verification/service-status/recognized";

describe("verifyTrustedListSignature", () => {
    it("verifies the EU AV acceptance list (XAdES, RSA-SHA512)", async () => {
        const { signerCertificateBase64 } =
            await verifyTrustedListSignature(acceptance);
        expect(signerCertificateBase64.length).toBeGreaterThan(0);
    });

    it("verifies the EU AV production list", async () => {
        await expect(
            verifyTrustedListSignature(production),
        ).resolves.toBeDefined();
    });

    it("fails closed on a tampered list", async () => {
        // Flip a character inside a signed element -> signature must not verify.
        const tampered = acceptance.replace(
            "European Commission",
            "Evil Commission",
        );
        await expect(
            verifyTrustedListSignature(tampered),
        ).rejects.toBeInstanceOf(TrustedListSignatureError);
    });

    it("fails closed when the signer is not among the pinned trust anchors", async () => {
        await expect(
            verifyTrustedListSignature(acceptance, {
                trustAnchors: [new Uint8Array([1, 2, 3])],
            }),
        ).rejects.toBeInstanceOf(TrustedListSignatureError);
    });
});

describe("parseTrustedList", () => {
    it("parses the AV trusted list structure", () => {
        const tl = parseTrustedList(acceptance);
        expect(tl.schemeOperatorName).toBe("European Commission");
        expect(tl.sequenceNumber).toBe(17);
        expect(tl.nextUpdate).toBe("2026-12-16T13:30:00Z");
        expect(tl.providers.length).toBeGreaterThan(0);

        const services = tl.providers.flatMap((p) => p.services);
        expect(services.every((s) => s.serviceTypeIdentifier === AV_SERVICE_TYPE)).toBe(
            true,
        );
        // Every recognized service carries at least one certificate.
        const recognized = services.filter(
            (s) => s.serviceStatus === AV_STATUS_RECOGNIZED,
        );
        expect(recognized.length).toBeGreaterThan(0);
        expect(recognized.every((s) => s.certificates.length > 0)).toBe(true);
    });
});

describe("getTrustAnchors", () => {
    it("flattens to anchors and derives subjectKeyIdentifiers for AKI use", () => {
        const tl = parseTrustedList(acceptance);
        const anchors = getTrustAnchors(tl, {
            serviceStatus: [AV_STATUS_RECOGNIZED],
        });
        expect(anchors.length).toBeGreaterThan(0);
        // Deprecated services are excluded by the status filter.
        expect(
            anchors.every((a) => a.serviceStatus === AV_STATUS_RECOGNIZED),
        ).toBe(true);
        // At least some anchors expose an AKI (SubjectKeyIdentifier).
        expect(anchors.some((a) => !!a.subjectKeyIdentifier)).toBe(true);
    });
});

describe("loadTrustedList", () => {
    it("verifies then parses in one call", async () => {
        const tl = await loadTrustedList(production);
        expect(tl.providers.length).toBeGreaterThan(0);
    });
});
