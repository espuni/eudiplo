import { describe, expect, it } from "vitest";
import {
    mapChainErrorToFailureType,
    shortVerificationMessage,
    type VerificationFailureType,
} from "./verification-failure";

describe("mapChainErrorToFailureType", () => {
    it("maps chain validation error codes to stable failure types", () => {
        expect(mapChainErrorToFailureType("x5c_required")).toBe("x5c_missing");
        expect(mapChainErrorToFailureType("chain_build_failed")).toBe(
            "no_trust_chain_to_root",
        );
        expect(mapChainErrorToFailureType("no_trusted_entity_match")).toBe(
            "trust_chain_not_trusted",
        );
        expect(mapChainErrorToFailureType("trust_list_unavailable")).toBe(
            "trust_list_unavailable",
        );
        expect(mapChainErrorToFailureType("certificate_expired")).toBe(
            "certificate_expired",
        );
    });

    it("falls back to verification_error for unknown/absent codes", () => {
        expect(mapChainErrorToFailureType("something_unexpected")).toBe(
            "verification_error",
        );
        expect(mapChainErrorToFailureType(undefined)).toBe(
            "verification_error",
        );
    });
});

describe("shortVerificationMessage", () => {
    const failureTypes: VerificationFailureType[] = [
        "signature_invalid",
        "no_trust_chain_to_root",
        "trust_chain_not_trusted",
        "trust_list_unavailable",
        "certificate_expired",
        "x5c_missing",
        "verification_error",
    ];

    it("returns a distinct, non-verbose message for every failure type", () => {
        const messages = failureTypes.map((t) => shortVerificationMessage(t));
        expect(messages.every((m) => m.length > 0)).toBe(true);
        // No certificate subjects, thumbprints or list URLs leak into UI text.
        expect(
            messages.every((m) => !/subject=|thumbprint|https?:\/\//i.test(m)),
        ).toBe(true);
        expect(new Set(messages).size).toBe(failureTypes.length);
    });

    it("falls back to the generic message for an unknown/undefined type", () => {
        expect(shortVerificationMessage(undefined)).toBe(
            "The credential could not be verified.",
        );
    });
});
