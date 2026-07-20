import type { z } from "zod";
import { TrustedListParseError } from "./errors";
import { type TrustedList, TrustedListSchema } from "./types";

/** A single validation problem, mirroring @owf/eudi-lote's ValidationError. */
export interface ValidationError {
    path: string;
    message: string;
}

/** Result of a validation, mirroring @owf/eudi-lote's ValidationResult. */
export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
}

function fromZodError(error: z.ZodError): ValidationError[] {
    return error.issues.map((issue) => ({
        path: issue.path.map((p) => String(p)).join("."),
        message: issue.message,
    }));
}

/**
 * Structurally validate an object against the ETSI TS 119 612 trusted-list
 * schema (the same zod-based approach `@owf/eudi-lote` uses for TS 119 602).
 * For XML input, parse it first with `parseTrustedList` (XML → object), then
 * validate the object here.
 */
export function validateTrustedList(value: unknown): ValidationResult {
    const result = TrustedListSchema.safeParse(value);
    return result.success
        ? { valid: true, errors: [] }
        : { valid: false, errors: fromZodError(result.error) };
}

/**
 * Structurally validate and return the typed trusted list, throwing
 * {@link TrustedListParseError} when it does not conform to the schema.
 */
export function assertValidTrustedList(value: unknown): TrustedList {
    const result = TrustedListSchema.safeParse(value);
    if (!result.success) {
        const details = fromZodError(result.error)
            .map((e) => `${e.path}: ${e.message}`)
            .join("; ");
        throw new TrustedListParseError(`Invalid trusted list: ${details}`);
    }
    return result.data;
}

/**
 * Known trusted-list profiles, mirroring `@owf/eudi-lote`'s `LoTEProfile`.
 */
export enum TrustedListProfile {
    /** EU Age Verification trusted list. */
    AgeVerification = "eu-age-verification",
}

interface ProfileRule {
    /** Expected `TSLType` (compared scheme-insensitively). */
    tslType: string;
    /** Service type URIs the profile permits (scheme-insensitive). */
    serviceTypes: string[];
    /** Service status URIs the profile permits (scheme-insensitive). */
    serviceStatuses: string[];
}

const PROFILE_RULES: Record<TrustedListProfile, ProfileRule> = {
    [TrustedListProfile.AgeVerification]: {
        // Acceptance uses https, production uses http — compared without scheme.
        tslType: "https://trust.tech.ec.europa.eu/lists/age-verification/tsl-type",
        serviceTypes: [
            "http://trust.tech.ec.europa.eu/lists/age-verification/service-type/paa",
        ],
        serviceStatuses: [
            "http://trust.tech.ec.europa.eu/lists/age-verification/service-status/recognized",
            "http://trust.tech.ec.europa.eu/lists/age-verification/service-status/deprecated",
        ],
    },
};

const stripScheme = (uri: string | undefined): string =>
    (uri ?? "").replace(/^https?:\/\//, "");

function profileErrors(
    trustedList: TrustedList,
    profile: TrustedListProfile,
): ValidationError[] {
    const rule = PROFILE_RULES[profile];
    const errors: ValidationError[] = [];

    if (stripScheme(trustedList.tslType) !== stripScheme(rule.tslType)) {
        errors.push({
            path: "tslType",
            message: `[${profile}] expected TSLType ${rule.tslType}, got ${trustedList.tslType ?? "none"}`,
        });
    }

    const allowedTypes = new Set(rule.serviceTypes.map(stripScheme));
    const allowedStatuses = new Set(rule.serviceStatuses.map(stripScheme));
    trustedList.providers.forEach((provider, pi) => {
        provider.services.forEach((service, si) => {
            if (!allowedTypes.has(stripScheme(service.serviceTypeIdentifier))) {
                errors.push({
                    path: `providers.${pi}.services.${si}.serviceTypeIdentifier`,
                    message: `[${profile}] unexpected service type ${service.serviceTypeIdentifier}`,
                });
            }
            if (!allowedStatuses.has(stripScheme(service.serviceStatus))) {
                errors.push({
                    path: `providers.${pi}.services.${si}.serviceStatus`,
                    message: `[${profile}] unexpected service status ${service.serviceStatus}`,
                });
            }
        });
    });

    return errors;
}

/**
 * Validate that a trusted list conforms to one (or any, given several) of the
 * known profiles — structural schema first, then profile-specific rules.
 * Mirrors `@owf/eudi-lote`'s `validateLoTEProfile`.
 */
export function validateTrustedListProfile(
    value: unknown,
    profile: TrustedListProfile | TrustedListProfile[],
): ValidationResult {
    const structural = validateTrustedList(value);
    if (!structural.valid) return structural;

    const trustedList = value as TrustedList;
    const profiles = Array.isArray(profile) ? profile : [profile];
    const perProfile = profiles.map((p) => profileErrors(trustedList, p));
    if (perProfile.some((errors) => errors.length === 0)) {
        return { valid: true, errors: [] };
    }
    return { valid: false, errors: perProfile.flat() };
}
