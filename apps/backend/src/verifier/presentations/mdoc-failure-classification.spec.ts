import { describe, expect, it } from "vitest";
import { PresentationsService } from "./presentations.service";

/**
 * An AV relying party acts differently on "this credential is bad" than on
 * "this issuer is not on the trust list". v7 collapses the second into the
 * first unless the failure is classified, so this mapping is load-bearing
 * product behaviour, not cosmetics.
 *
 * Guards the espuni fork's two corrections:
 *  - `verification_error` is the unclassified bucket, so inference must still
 *    run for it (the original `!mappedReason` guard disabled inference in
 *    exactly the case that needed it);
 *  - @owf/mdoc words an untrusted issuer as "No trusted certificate ...".
 */
describe("throwMdocVerificationFailure — trust failure classification", () => {
    const service = Object.create(
        PresentationsService.prototype,
    ) as PresentationsService & {
        throwMdocVerificationFailure: (attId: string, result: unknown) => never;
        logger: { warn: (...args: unknown[]) => void };
    };
    service.logger = { warn: () => {} };

    function reasonFor(result: unknown): string {
        try {
            service.throwMdocVerificationFailure("av-credential", result);
        } catch (error) {
            return String((error as { message?: string }).message ?? error);
        }
        throw new Error("expected it to throw");
    }

    it("reports an untrusted issuer as a trust failure, not a generic one", () => {
        expect(
            reasonFor({
                failureType: "verification_error",
                failureReason:
                    'No trusted certificate was found while validating the X.509 chain. chain=[{"subject":"C=DE, CN=Root Tenant"}]',
            }),
        ).toMatch(/does not match any trusted entity/i);
    });

    it("still reports a genuinely generic failure as generic", () => {
        expect(
            reasonFor({
                failureType: "verification_error",
                failureReason:
                    "The MSO must be valid at the time of verification",
            }),
        ).toMatch(/mDOC verification failed/i);
    });

    it("keeps upstream's explicit classifications untouched", () => {
        expect(
            reasonFor({
                failureType: "signature_invalid",
                failureReason: "Device signature must be valid",
            }),
        ).toMatch(/signature is invalid/i);
        expect(reasonFor({ failureType: "no_trust_chain_to_root" })).toMatch(
            /no trust chain to a trusted root/i,
        );
    });
});
