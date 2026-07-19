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
`TrstSvc/Svctype/*`, `Svcstatus/*`) and profile lists such as the EU Age
Verification list. The parser and signature verification are agnostic to the
concrete URIs; profile-specific expectations live in `TrustedListProfile`.

Verified against a standard eIDAS national list and the EU Age Verification
acceptance/production lists.

## Usage

```ts
import {
    loadTrustedList,
    getTrustAnchors,
    verifyTrustedListSignature,
} from "@eudiplo/etsi-trusted-list";

// Verify the list's XAdES signature, then parse it. Pins the scheme operator
// certificate(s) so a list signed by some other key fails closed.
const trustedList = await loadTrustedList(xml, {
    trustAnchors: [schemeOperatorCertDer],
});

// Flatten to individual anchors, keeping only recognized services.
const anchors = getTrustAnchors(trustedList, {
    serviceStatus: [
        "http://trust.tech.ec.europa.eu/lists/age-verification/service-status/recognized",
    ],
});
// anchors[i] = { base64, subjectKeyIdentifier?, serviceTypeIdentifier, serviceStatus, providerName? }
```

`verifyTrustedListSignature` can also be used on its own; it returns the signer
certificate. Signature verification is exercised against the EU Age Verification
acceptance and production lists (RSA-SHA512, exclusive C14N, XAdES
SignedProperties).

## Validation and profiles

The model is defined with zod schemas and parsing is schema-driven, mirroring
`@owf/eudi-lote`'s approach. Since the input is XML, the flow is
XML → object (`parseTrustedList`) → zod validation.

```ts
import {
    validateTrustedList,
    assertValidTrustedList,
    validateTrustedListProfile,
    TrustedListProfile,
} from "@eudiplo/etsi-trusted-list";

validateTrustedList(obj); // { valid, errors }
assertValidTrustedList(obj); // returns the typed list or throws

// Profile validation (structural + profile-specific rules), like
// @owf/eudi-lote's validateLoTEProfile:
validateTrustedListProfile(trustedList, TrustedListProfile.AgeVerification);
```

## Security

- **Fail closed.** `verifyTrustedListSignature` / `loadTrustedList` throw
  `TrustedListSignatureError` when the signature is missing, invalid, or (with
  `trustAnchors`) not signed by a pinned scheme operator. Never use a list whose
  authenticity has not been established.
- Always pass `trustAnchors`. Without it, only cryptographic integrity is
  checked — not trust.

## Scope

v1 extracts the **current** trust anchors from a single (leaf) trusted list.
Planned follow-ups for fuller TS 119 612 coverage:

- Following **LOTL** (`PointersToOtherTSL`) to member lists.
- **ServiceHistory** (`ServiceHistoryInstance`) — only current `ServiceStatus`
  is considered today.
- **Service qualifiers** (`Qualifications`/`Qualifier`, e.g. QCStatements).
- Digital identities expressed as **`X509SubjectName`/`X509SKI` without an
  embedded `X509Certificate`** (current services in the lists tested always embed
  the certificate; SKI is derived from it).
- Chain-building for the signer certificate (v1 pins by exact certificate).

## License

Apache-2.0
