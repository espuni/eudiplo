import { DeviceResponse, Verifier } from "@owf/mdoc";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MdocverifierService } from "./mdocverifier.service";

describe("MdocverifierService failure classification", () => {
    let service: MdocverifierService;

    beforeEach(() => {
        const chainValidation = {
            getTrustedCertificateBuffers: vi.fn().mockResolvedValue([]),
        };
        const logger = {
            setContext: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
        };

        service = new MdocverifierService(
            chainValidation as any,
            logger as any,
        );
    });

    it("maps chain_build_failed to no_trust_chain_to_root", () => {
        const failureType = (service as any).mapChainErrorToFailureType(
            "chain_build_failed",
        );

        expect(failureType).toBe("no_trust_chain_to_root");
    });

    it("keeps signature_invalid when chain probe does not fail", async () => {
        vi.spyOn(DeviceResponse, "decode").mockReturnValue({
            documents: [{}],
        } as any);

        vi.spyOn(service as any, "extractErrorDetails").mockResolvedValue({
            docType: "org.iso.18013.5.1.mDL",
            issuerCertInfo: "issuer",
            issuerThumbprint: "thumb",
            issuerValidity: "validity",
            trustedCertsSummary: "none",
        });

        vi.spyOn(
            service as any,
            "validateIssuerCertificateChain",
        ).mockResolvedValue({
            verified: true,
            matchedEntity: null,
        });

        const result = await (service as any).handleVerificationError(
            "AA",
            new Error(
                "Unable to verify deviceAuth signature (ECDSA/EdDSA): Device signature must be valid",
            ),
            {
                trustListSource: { lotes: [] },
                policy: { requireX5c: true },
            },
        );

        expect(result.failureType).toBe("signature_invalid");
    });

    it("overrides signature_invalid with trust-chain failure when probe fails", async () => {
        vi.spyOn(DeviceResponse, "decode").mockReturnValue({
            documents: [{}],
        } as any);

        vi.spyOn(service as any, "extractErrorDetails").mockResolvedValue({
            docType: "org.iso.18013.5.1.mDL",
            issuerCertInfo: "issuer",
            issuerThumbprint: "thumb",
            issuerValidity: "validity",
            trustedCertsSummary: "none",
        });

        vi.spyOn(
            service as any,
            "validateIssuerCertificateChain",
        ).mockResolvedValue({
            verified: false,
            matchedEntity: null,
            error: "chain_build_failed",
            errorDetails: "No issuer chain to trusted root",
        });

        const result = await (service as any).handleVerificationError(
            "AA",
            new Error(
                "Unable to verify deviceAuth signature (ECDSA/EdDSA): Device signature must be valid",
            ),
            {
                trustListSource: { lotes: [] },
                policy: { requireX5c: true },
            },
        );

        expect(result.failureType).toBe("no_trust_chain_to_root");
        expect(result.failureReason).toBe("No issuer chain to trusted root");
    });
});

describe("MdocverifierService status (revocation) validation gating", () => {
    const buildService = (statusCertBuffers: Uint8Array[]) => {
        const chainValidation = {
            getTrustedCertificateBuffers: vi.fn().mockResolvedValue([]),
            getTrustedStatusCertificateBuffers: vi
                .fn()
                .mockResolvedValue(statusCertBuffers),
        };
        const logger = {
            setContext: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
        };
        const service = new MdocverifierService(
            chainValidation as any,
            logger as any,
        );

        // A credential that carries a status/revocation list in its MSO: the
        // mDOC document only needs an x5chain (so trustedCertificates is built)
        // and no disclosed claims.
        vi.spyOn(DeviceResponse, "decode").mockReturnValue({
            documents: [
                {
                    docType: "eu.europa.ec.av.1",
                    issuerSigned: {
                        issuerNamespaces: { issuerNamespaces: new Map() },
                        getPrettyClaims: () => undefined,
                        issuerAuth: { x5chain: [new Uint8Array([1, 2, 3])] },
                    },
                },
            ],
        } as any);
        vi.spyOn(service as any, "buildDeviceRequest").mockReturnValue(
            {} as any,
        );
        vi.spyOn(
            service as any,
            "validateIssuerCertificateChain",
        ).mockResolvedValue({ verified: true, matchedEntity: null });
        const verifySpy = vi
            .spyOn(Verifier, "verifyDeviceResponse")
            .mockResolvedValue(undefined as any);

        return { service, verifySpy };
    };

    const run = (service: MdocverifierService) =>
        service.verify(
            "AA",
            { protocol: "iso-18013-7", sessionTranscript: {} as any },
            { trustListSource: undefined, policy: {} } as any,
        );

    afterEach(() => vi.restoreAllMocks());

    it("disables status validation when no revocation certs are available (opt-out)", async () => {
        const { service, verifySpy } = buildService([]);

        const result = await run(service);

        expect(result.verified).toBe(true);
        expect(verifySpy).toHaveBeenCalledWith(
            expect.objectContaining({ disableStatusValidation: true }),
            expect.anything(),
        );
    });

    it("keeps status validation enabled when revocation certs are configured", async () => {
        const { service, verifySpy } = buildService([new Uint8Array([9, 9])]);

        await run(service);

        expect(verifySpy).toHaveBeenCalledWith(
            expect.objectContaining({ disableStatusValidation: false }),
            expect.anything(),
        );
    });
});
