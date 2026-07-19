import { Buffer } from "node:buffer";
import { SubjectKeyIdentifierExtension, X509Certificate } from "@peculiar/x509";
import { DOMParser, type Element } from "@xmldom/xmldom";
import { TrustedListParseError } from "./errors";
import type {
    TrustAnchor,
    TrustedList,
    TrustedListCertificate,
    TrustedListService,
    TrustServiceProvider,
} from "./types";

const TSL_NS = "http://uri.etsi.org/02231/v2#";

function descendants(el: Element, name: string): Element[] {
    return Array.from(el.getElementsByTagNameNS(TSL_NS, name));
}

function firstDescendant(el: Element, name: string): Element | undefined {
    return descendants(el, name)[0];
}

function textOf(el: Element | undefined): string | undefined {
    const t = el?.textContent?.trim();
    return t ? t : undefined;
}

/**
 * Localized `Name`: prefer the English entry, else the first, searched only
 * among the direct `Name` children of the given parent.
 */
function localizedName(parent: Element | undefined): string | undefined {
    if (!parent) return undefined;
    const names = Array.from(parent.childNodes).filter(
        (n): n is Element =>
            (n as Element).namespaceURI === TSL_NS &&
            (n as Element).localName === "Name",
    );
    if (names.length === 0) return undefined;
    const en = names.find((n) => n.getAttribute("xml:lang") === "en");
    return textOf(en ?? names[0]);
}

/** Lowercase-hex SubjectKeyIdentifier from a certificate, best-effort. */
function subjectKeyIdentifier(
    base64: string,
    x509SkiHex: string | undefined,
): string | undefined {
    try {
        const cert = new X509Certificate(Buffer.from(base64, "base64"));
        const ext = cert.getExtension(SubjectKeyIdentifierExtension);
        if (ext?.keyId) return ext.keyId.toLowerCase();
    } catch {
        // Malformed extensions (seen in some reference certificates) — fall back
        // to the published X509SKI element if any.
    }
    return x509SkiHex;
}

function parseCertificates(serviceInfo: Element): TrustedListCertificate[] {
    const digitalIds = descendants(serviceInfo, "DigitalId");
    const certs: TrustedListCertificate[] = [];
    for (const digitalId of digitalIds) {
        const certEl = firstDescendant(digitalId, "X509Certificate");
        const base64 = textOf(certEl)?.replace(/\s/g, "");
        if (!base64) continue;
        const skiEl = firstDescendant(digitalId, "X509SKI");
        const x509SkiHex = textOf(skiEl)
            ? Buffer.from(textOf(skiEl)!.replace(/\s/g, ""), "base64")
                  .toString("hex")
            : undefined;
        certs.push({
            base64,
            subjectKeyIdentifier: subjectKeyIdentifier(base64, x509SkiHex),
        });
    }
    return certs;
}

/**
 * Parse an ETSI TS 119 612 `TrustServiceStatusList` XML into a normalized
 * {@link TrustedList}. This does NOT verify the list signature — call
 * {@link verifyTrustedListSignature} first (or use {@link loadTrustedList}).
 */
export function parseTrustedList(xml: string): TrustedList {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const root: Element | null = doc.documentElement;
    if (!root || root.localName !== "TrustServiceStatusList") {
        throw new TrustedListParseError(
            "Root element is not a TS 119 612 TrustServiceStatusList",
        );
    }

    const schemeInfo = firstDescendant(root, "SchemeInformation");
    const sequenceText = textOf(
        schemeInfo && firstDescendant(schemeInfo, "TSLSequenceNumber"),
    );
    const nextUpdate = schemeInfo && firstDescendant(schemeInfo, "NextUpdate");

    const providers: TrustServiceProvider[] = [];
    for (const tsp of descendants(root, "TrustServiceProvider")) {
        const services: TrustedListService[] = [];
        for (const service of descendants(tsp, "TSPService")) {
            const info = firstDescendant(service, "ServiceInformation");
            if (!info) continue;
            const serviceTypeIdentifier = textOf(
                firstDescendant(info, "ServiceTypeIdentifier"),
            );
            const serviceStatus = textOf(
                firstDescendant(info, "ServiceStatus"),
            );
            if (!serviceTypeIdentifier || !serviceStatus) continue;
            services.push({
                serviceTypeIdentifier,
                serviceStatus,
                serviceName: localizedName(
                    firstDescendant(info, "ServiceName"),
                ),
                certificates: parseCertificates(info),
            });
        }
        providers.push({
            name: localizedName(firstDescendant(tsp, "TSPName")),
            services,
        });
    }

    return {
        tslType: textOf(schemeInfo && firstDescendant(schemeInfo, "TSLType")),
        schemeOperatorName: localizedName(
            schemeInfo && firstDescendant(schemeInfo, "SchemeOperatorName"),
        ),
        sequenceNumber: sequenceText ? Number(sequenceText) : undefined,
        listIssueDateTime: textOf(
            schemeInfo && firstDescendant(schemeInfo, "ListIssueDateTime"),
        ),
        nextUpdate: textOf(nextUpdate && firstDescendant(nextUpdate, "dateTime")),
        providers,
    };
}

export interface TrustAnchorFilter {
    /**
     * When set, only include services whose `serviceStatus` is in this list
     * (e.g. the AV `.../service-status/recognized`). Withdrawn/deprecated
     * services are excluded.
     */
    serviceStatus?: string[];
    /** When set, only include services whose `serviceTypeIdentifier` matches. */
    serviceTypeIdentifier?: string[];
}

/**
 * Flatten a {@link TrustedList} into individual {@link TrustAnchor} entries —
 * the normalized unit consumed by certificate-chain validation and AKI
 * emission.
 */
export function getTrustAnchors(
    trustedList: TrustedList,
    filter: TrustAnchorFilter = {},
): TrustAnchor[] {
    const anchors: TrustAnchor[] = [];
    for (const provider of trustedList.providers) {
        for (const service of provider.services) {
            if (
                filter.serviceStatus &&
                !filter.serviceStatus.includes(service.serviceStatus)
            ) {
                continue;
            }
            if (
                filter.serviceTypeIdentifier &&
                !filter.serviceTypeIdentifier.includes(
                    service.serviceTypeIdentifier,
                )
            ) {
                continue;
            }
            for (const cert of service.certificates) {
                anchors.push({
                    base64: cert.base64,
                    subjectKeyIdentifier: cert.subjectKeyIdentifier,
                    serviceTypeIdentifier: service.serviceTypeIdentifier,
                    serviceStatus: service.serviceStatus,
                    providerName: provider.name,
                });
            }
        }
    }
    return anchors;
}
