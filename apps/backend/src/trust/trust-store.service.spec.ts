import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TrustStoreService } from "./trust-store.service";
import { ServiceTypeIdentifiers, type TrustListSource } from "./types";

const AV_XML = readFileSync(
    join(__dirname, "av-tl-acceptance.fixture.xml"),
    "utf8",
);
const AV_SERVICE_TYPE_PAA =
    "http://trust.tech.ec.europa.eu/lists/age-verification/service-type/paa";
const AV_STATUS_RECOGNIZED =
    "http://trust.tech.ec.europa.eu/lists/age-verification/service-status/recognized";

/**
 * Integration of the @eudiplo/etsi-trusted-list library into TrustStoreService:
 * an `etsi-xml` ref is fetched, its XAdES signature verified, and its recognized
 * services mapped onto the internal TrustedEntity model.
 */
// Rebased onto v7: the pinned XAdES signer now travels in `verifierX509Der`,
// v7's own field for trust-list verifier material, instead of the pre-v7
// fork's separate `signerCertificates` array.
describe("TrustStoreService — ETSI TS 119 612 (etsi-xml) source", () => {
    let trustListJwt: { fetchText: ReturnType<typeof vi.fn> };
    let service: TrustStoreService;

    beforeEach(() => {
        trustListJwt = { fetchText: vi.fn().mockResolvedValue(AV_XML) };
        service = new TrustStoreService(
            trustListJwt as any,
            {} as any, // loteParser — unused on the XML path
        );
    });

    function source(ref: Partial<TrustListSource["lotes"][number]> = {}) {
        return {
            lotes: [
                {
                    url: "https://trust.example/av-tl.xml",
                    format: "etsi-xml" as const,
                    acceptedServiceStatus: [AV_STATUS_RECOGNIZED],
                    ...ref,
                },
            ],
        } satisfies TrustListSource;
    }

    it("maps recognized AV services onto trusted entities with certificates", async () => {
        const store = await service.getTrustStore(source());

        expect(store.entities.length).toBeGreaterThan(0);
        const services = store.entities.flatMap((e) => e.services);
        expect(services.length).toBeGreaterThan(0);
        // Preserves the AV service type when no mapping is given.
        expect(
            services.every((s) => s.serviceTypeIdentifier === AV_SERVICE_TYPE_PAA),
        ).toBe(true);
        expect(services.every((s) => s.certValue.length > 0)).toBe(true);
        expect(store.nextUpdate).toBe("2026-12-16T13:30:00Z");
    });

    it("renames the AV service type via serviceTypeMap so it matches /Issuance", async () => {
        const store = await service.getTrustStore(
            source({
                serviceTypeMap: {
                    [AV_SERVICE_TYPE_PAA]: ServiceTypeIdentifiers.EaaIssuance,
                },
            }),
        );
        const services = store.entities.flatMap((e) => e.services);
        expect(services.length).toBeGreaterThan(0);
        expect(
            services.every(
                (s) =>
                    s.serviceTypeIdentifier ===
                    ServiceTypeIdentifiers.EaaIssuance,
            ),
        ).toBe(true);
    });

    it("fails closed when the list signer is not the pinned scheme operator", async () => {
        await expect(
            service.getTrustStore(
                source({
                    verifierX509Der: Buffer.from([1, 2, 3]).toString(
                        "base64",
                    ),
                }),
            ),
        ).rejects.toThrow();
    });

    it("caches by source (single fetch for repeated calls)", async () => {
        const src = source();
        await service.getTrustStore(src);
        await service.getTrustStore(src);
        expect(trustListJwt.fetchText).toHaveBeenCalledTimes(1);
    });
});
