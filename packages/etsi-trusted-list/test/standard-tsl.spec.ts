import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
    ACTIVE_SERVICE_STATUSES,
    getTrustAnchors,
    parseTrustedList,
    ServiceStatus,
    ServiceType,
    TSLType,
    validateTrustedList,
    verifyTrustedListSignature,
} from "../src/index";

/**
 * The library must handle a standard ETSI TS 119 612 eIDAS list, not just the
 * simplified EU Age Verification profile. Fixture: the ES national trusted list
 * (standard `TSLType/EUgeneric`, `TrstSvc/Svctype/*` types, `Svcstatus/*`
 * statuses, ServiceHistory, qualifiers, a LOTL pointer).
 */
const ES = readFileSync(join(__dirname, "fixtures", "eu-tl-es.xml"), "utf8");

describe("standard eIDAS trusted list (ES)", () => {
    it("verifies the enveloped XAdES signature", async () => {
        await expect(verifyTrustedListSignature(ES)).resolves.toBeDefined();
    });

    it("parses the standard structure and passes schema validation", () => {
        const tl = parseTrustedList(ES);
        expect(tl.tslType).toBe(TSLType.EUgeneric);
        expect(validateTrustedList(tl).valid).toBe(true);
        expect(tl.providers.length).toBeGreaterThan(50);

        const services = tl.providers.flatMap((p) => p.services);
        expect(services.length).toBeGreaterThan(400);

        // Standard ETSI service types and statuses are read as-is.
        const types = new Set(services.map((s) => s.serviceTypeIdentifier));
        expect(types.has(ServiceType.CA_QC)).toBe(true);
        const statuses = new Set(services.map((s) => s.serviceStatus));
        expect(statuses.has(ServiceStatus.Granted)).toBe(true);
        expect(statuses.has(ServiceStatus.Withdrawn)).toBe(true);
    });

    it("filters to active anchors and excludes withdrawn/ceased ones", () => {
        const tl = parseTrustedList(ES);
        const all = getTrustAnchors(tl);
        const active = getTrustAnchors(tl, {
            serviceStatus: ACTIVE_SERVICE_STATUSES,
        });
        expect(active.length).toBeGreaterThan(0);
        expect(active.length).toBeLessThan(all.length); // some are withdrawn
        expect(
            active.every((a) =>
                ACTIVE_SERVICE_STATUSES.includes(a.serviceStatus),
            ),
        ).toBe(true);
        // Anchors expose SubjectKeyIdentifiers for AKI use.
        expect(active.some((a) => !!a.subjectKeyIdentifier)).toBe(true);
    });
});
