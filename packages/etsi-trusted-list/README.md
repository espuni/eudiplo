# @eudiplo/etsi-trusted-list

Parse and verify **ETSI TS 119 612** XML Trusted Lists (`TrustServiceStatusList`)
and expose normalized trust anchors.

It is the XML counterpart of [`@owf/eudi-lote`](https://www.npmjs.com/package/@owf/eudi-lote)
(ETSI TS 119 602, JSON): both formats resolve to the same normalized notion of a
trust anchor, so a verifier can consume either and, for example, derive AKIs
(SubjectKeyIdentifiers) to send to a wallet.

## Why

EUDI-context trust lists are published as **TS 119 602 (LoTE, JSON)**, but many
existing trust services are published as classic **TS 119 612 (XML)** — both the
standard eIDAS national lists (e.g. the ES list, `TSLType/EUgeneric`,
`TrstSvc/Svctype/*`, `Svcstatus/*`) and other profiled lists. The parser and
signature verification are agnostic to the concrete URIs; profile-specific
expectations are supplied by the caller as a `ProfileRule`.

Verified against a standard eIDAS national trusted list.

## Usage

```ts
import {
    ACTIVE_SERVICE_STATUSES,
    loadTrustedList,
    getTrustAnchors,
    verifyTrustedListSignature,
} from "@eudiplo/etsi-trusted-list";

// Verify the list's XAdES signature, then parse it. Pins the scheme operator
// certificate(s) so a list signed by some other key fails closed.
const trustedList = await loadTrustedList(xml, {
    trustAnchors: [schemeOperatorCertDer],
});

// Flatten to individual anchors, keeping only active (granted) services.
const anchors = getTrustAnchors(trustedList, {
    serviceStatus: ACTIVE_SERVICE_STATUSES,
});
// anchors[i] = { certificate?, subjectName?, subjectKeyIdentifier?, serviceTypeIdentifier, serviceStatus, providerName? }
// pass { requireCertificate: true } to keep only anchors that embed a certificate.
```

`verifyTrustedListSignature` can also be used on its own; it returns the signer
certificate. Signature verification is exercised against a standard eIDAS
trusted list (RSA-SHA512, exclusive C14N, XAdES SignedProperties).

## Validation and profiles

The model is defined with zod schemas and parsing is schema-driven, mirroring
`@owf/eudi-lote`'s approach. Since the input is XML, the flow is
XML → object (`parseTrustedList`) → zod validation.

```ts
import {
    validateTrustedList,
    assertValidTrustedList,
    validateTrustedListProfile,
    type ProfileRule,
} from "@eudiplo/etsi-trusted-list";

validateTrustedList(obj); // { valid, errors }
assertValidTrustedList(obj); // returns the typed list or throws

// Profile validation (structural + caller-supplied constraints), like
// @owf/eudi-lote's validateLoTEProfile. Define the profile as a ProfileRule:
const myProfile: ProfileRule = {
    name: "my-ecosystem",
    tslType: "https://example.org/lists/tsl-type",
    serviceTypes: ["https://example.org/service-type/issuance"],
    serviceStatuses: ["https://example.org/service-status/active"],
};
validateTrustedListProfile(trustedList, myProfile);
```

## Security

- **Fail closed.** `verifyTrustedListSignature` / `loadTrustedList` throw
  `TrustedListSignatureError` when the signature is missing, invalid, or (with
  `trustAnchors`) not signed by a pinned scheme operator. Never use a list whose
  authenticity has not been established.
- Always pass `trustAnchors`. Without it, only cryptographic integrity is
  checked — not trust.

## What it parses

For a single (leaf) trusted list, the model captures:

- Scheme information (`TSLType`, scheme operator, sequence number, issue date,
  `NextUpdate`).
- Trust service providers and services (`ServiceTypeIdentifier`,
  `ServiceStatus`, name).
- **Digital identities** merged per `ServiceDigitalIdentity` — embedded
  `X509Certificate`, and/or `X509SubjectName`, and/or `X509SKI` (so services
  identified without an embedded certificate are represented).
- **Service qualifiers** (`Qualifications`/`Qualifier`, e.g. QCStatements).
- **Service history** (`ServiceHistoryInstance`: status + starting time).
- **LOTL pointers** (`PointersToOtherTSL` → location, TSLType, scheme
  territory).

## Scope / follow-ups

- **LOTL following** — pointers are parsed but member lists are not fetched
  automatically; that orchestration is left to the caller.
- **Signer chain-building** — the list signature is pinned by exact certificate
  (`trustAnchors`); building a chain from the signer to a CA anchor is a
  follow-up.

## License

Apache-2.0
