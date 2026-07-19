import { Buffer } from "node:buffer";
import { loadTrustedList } from "@eudiplo/etsi-trusted-list";
import { Injectable, Logger } from "@nestjs/common";
import type { LoTE } from "@owf/eudi-lote";
import { decodeJwt } from "jose";
import { LoteParserService } from "./lote-parser.service";
import { TrustListJwtService } from "./trustlist-jwt.service";
import {
    RulebookTrustListRef,
    TrustedEntity,
    TrustedEntityServiceCert,
    TrustListSource,
} from "./types";

/**
 * Built trust store with TrustedEntities preserving service groupings.
 */
export type BuiltTrustStore = {
    fetchedAt: number;
    nextUpdate?: string;
    /** TrustedEntities with their services (issuance + revocation) grouped */
    entities: TrustedEntity[];
};

@Injectable()
export class TrustStoreService {
    private readonly logger = new Logger(TrustStoreService.name);
    private readonly cache = new Map<string, BuiltTrustStore>();

    constructor(
        private readonly trustListJwt: TrustListJwtService,
        private readonly loteParser: LoteParserService,
    ) {}

    async getTrustStore(
        source: TrustListSource,
        cacheTtlMs = 5 * 60 * 1000,
    ): Promise<BuiltTrustStore> {
        const cacheKey = this.buildCacheKey(source);
        const cached = this.cache.get(cacheKey);

        if (cached && Date.now() - cached.fetchedAt < cacheTtlMs) {
            return cached;
        }

        const entities: TrustedEntity[] = [];
        let nextUpdate: string | undefined;

        for (const ref of source.lotes) {
            if (ref.format === "etsi-xml") {
                const xmlResult = await this.loadEtsiXmlRef(
                    ref,
                    source.acceptedServiceTypes,
                );
                nextUpdate = nextUpdate ?? xmlResult.nextUpdate;
                for (const entity of xmlResult.entities) {
                    entities.push(entity);
                }
                continue;
            }

            this.logger.debug(`Fetching trust list from: ${ref.url}`);
            const jwt = await this.trustListJwt.fetchJwt(ref.url);
            await this.trustListJwt.verifyTrustListJwt(ref, jwt); // hook
            const decoded = decodeJwt<{ LoTE: LoTE }>(jwt);

            this.logger.debug(
                `Decoded LoTE from ${ref.url}: TrustedEntitiesList has ${decoded.LoTE.TrustedEntitiesList?.length ?? 0} raw entries`,
            );

            let parsed = this.loteParser.parse(decoded.LoTE);
            this.logger.debug(
                `Parsed ${parsed.entities.length} entities from ${ref.url}`,
            );

            if (source.acceptedServiceTypes) {
                this.logger.debug(
                    `Filtering by accepted service types: ${source.acceptedServiceTypes.join(", ")}`,
                );
                const beforeFilter = parsed.entities.length;
                parsed = this.loteParser.filterByServiceTypes(
                    parsed,
                    source.acceptedServiceTypes,
                );
                this.logger.debug(
                    `After filtering: ${parsed.entities.length} entities (was ${beforeFilter})`,
                );
            }

            nextUpdate = nextUpdate ?? parsed.info.nextUpdate;

            // Add entities preserving grouping
            for (const entity of parsed.entities) {
                entities.push(entity);
            }
        }

        const store: BuiltTrustStore = {
            fetchedAt: Date.now(),
            nextUpdate,
            entities,
        };
        this.cache.set(cacheKey, store);

        this.logger.debug(
            `Built trust store with ${entities.length} trusted entit${entities.length === 1 ? "y" : "ies"}`,
        );
        return store;
    }

    /**
     * Load an ETSI TS 119 612 XML trusted list and map it onto the internal
     * TrustedEntity model. The list's XAdES signature is verified (fail closed)
     * against the configured scheme operator certificate(s) before use.
     */
    private async loadEtsiXmlRef(
        ref: RulebookTrustListRef,
        acceptedServiceTypes?: string[],
    ): Promise<{ nextUpdate?: string; entities: TrustedEntity[] }> {
        this.logger.debug(`Fetching ETSI TS 119 612 trust list: ${ref.url}`);
        const xml = await this.trustListJwt.fetchText(ref.url);
        const trustAnchors = (ref.signerCertificates ?? []).map((cert) =>
            pemOrBase64ToDer(cert),
        );
        const trustedList = await loadTrustedList(
            xml,
            trustAnchors.length > 0 ? { trustAnchors } : {},
        );

        const entities: TrustedEntity[] = [];
        for (const provider of trustedList.providers) {
            const services: TrustedEntityServiceCert[] = [];
            for (const service of provider.services) {
                if (
                    ref.acceptedServiceStatus &&
                    !ref.acceptedServiceStatus.includes(service.serviceStatus)
                ) {
                    continue;
                }
                const serviceTypeIdentifier =
                    ref.serviceTypeMap?.[service.serviceTypeIdentifier] ??
                    service.serviceTypeIdentifier;
                if (
                    acceptedServiceTypes &&
                    !acceptedServiceTypes.includes(serviceTypeIdentifier)
                ) {
                    continue;
                }
                for (const cert of service.certificates) {
                    services.push({
                        serviceTypeIdentifier,
                        certValue: cert.base64,
                    });
                }
            }
            if (services.length > 0) {
                entities.push({ entityId: provider.name, services });
            }
        }

        this.logger.debug(
            `ETSI TS 119 612 trust list ${ref.url}: ${entities.length} trusted entit${entities.length === 1 ? "y" : "ies"}`,
        );
        return { nextUpdate: trustedList.nextUpdate, entities };
    }

    /**
     * Clear the cached trust store.
     * Useful for testing or when trust lists are known to have changed.
     */
    clearCache(): void {
        this.cache.clear();
    }

    private buildCacheKey(source: TrustListSource): string {
        return JSON.stringify({
            lotes: source.lotes.map((ref) => ({
                url: ref.url,
                verifierKey: ref.verifierKey ?? null,
                format: ref.format ?? "lote-json",
                signerCertificates: ref.signerCertificates ?? null,
                serviceTypeMap: ref.serviceTypeMap ?? null,
                acceptedServiceStatus: ref.acceptedServiceStatus ?? null,
            })),
            acceptedServiceTypes: source.acceptedServiceTypes ?? [],
        });
    }
}

/** Convert a PEM or base64-DER certificate string to raw DER bytes. */
function pemOrBase64ToDer(cert: string): Uint8Array {
    const base64 = cert.includes("-----BEGIN")
        ? cert
              .replace(/-----BEGIN [^-]+-----/g, "")
              .replace(/-----END [^-]+-----/g, "")
              .replace(/\s/g, "")
        : cert.replace(/\s/g, "");
    return new Uint8Array(Buffer.from(base64, "base64"));
}
