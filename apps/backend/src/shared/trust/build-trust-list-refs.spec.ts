import { describe, expect, it } from "vitest";
import { buildTrustListRefs, type TrustListRefConfig } from "./types";

describe("buildTrustListRefs", () => {
    const tenantHost = "https://verifier.example/issuers/demo";

    it("resolves <TENANT_URL> and defaults to a plain (lote-json) ref", () => {
        const refs = buildTrustListRefs(
            ["<TENANT_URL>/trust-list/pid"],
            tenantHost,
        );
        expect(refs).toHaveLength(1);
        expect(refs[0].url).toBe(`${tenantHost}/trust-list/pid`);
        expect(refs[0].format).toBeUndefined();
        expect(refs[0].signerCertificates).toBeUndefined();
    });

    it("merges per-URL etsi-xml config (matched by original or resolved URL)", () => {
        const configs: TrustListRefConfig[] = [
            {
                url: "https://trust.example/av-tl.xml",
                format: "etsi-xml",
                signerCertificates: ["<pem>"],
                serviceTypeMap: {
                    "http://trust.tech.ec.europa.eu/lists/age-verification/service-type/paa":
                        "http://uri.etsi.org/19602/SvcType/EAA/Issuance",
                },
                acceptedServiceStatus: [
                    "http://trust.tech.ec.europa.eu/lists/age-verification/service-status/recognized",
                ],
            },
        ];

        const refs = buildTrustListRefs(
            ["https://trust.example/av-tl.xml"],
            tenantHost,
            configs,
        );
        expect(refs[0].format).toBe("etsi-xml");
        expect(refs[0].signerCertificates).toEqual(["<pem>"]);
        expect(refs[0].serviceTypeMap).toBeDefined();
        expect(refs[0].acceptedServiceStatus?.length).toBe(1);
    });

    it("matches config by the <TENANT_URL>-resolved URL too", () => {
        const configs: TrustListRefConfig[] = [
            { url: `${tenantHost}/trust-list/av.xml`, format: "etsi-xml" },
        ];
        const refs = buildTrustListRefs(
            ["<TENANT_URL>/trust-list/av.xml"],
            tenantHost,
            configs,
        );
        expect(refs[0].format).toBe("etsi-xml");
    });

    it("leaves unmatched values as plain refs", () => {
        const refs = buildTrustListRefs(
            ["https://other.example/list.jwt"],
            tenantHost,
            [{ url: "https://trust.example/av-tl.xml", format: "etsi-xml" }],
        );
        expect(refs[0].format).toBeUndefined();
    });
});
