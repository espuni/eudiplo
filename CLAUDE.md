# EUDIPLO fork (espuni) — project context

This is espuni's fork of `openwallet-foundation/eudiplo`. It powers a
multi-tenant **Age Verification (AV)** service while contributing generic
EUDI features upstream. Upstream is EUDI-oriented; whether EUDIPLO wants
EU AV Blueprint support at all is a conversation with the maintainer
(@cre8 / Mirko) that has not concluded.

> **`PATCHES.md` is the source of truth for what this fork carries.** It
> records every patch, its upstream status, and what must survive a rebase.
> This file is *context* — protocol facts, conventions, and where to look.
> When the two disagree, `PATCHES.md` wins and this file is wrong: fix it.
> Current base: **upstream v7.2.0** (rebased 2026-08-22).

## Reference specifications — always consult before protocol decisions

| Topic | Source |
| --- | --- |
| **EU Age Verification profile (Annex A)** | <https://ageverification.dev/av-doc-technical-specification/docs/annexes/annex-A/annex-A-av-profile/> — raw: `https://raw.githubusercontent.com/eu-digital-identity-wallet/av-doc-technical-specification/main/docs/annexes/annex-A/annex-A-av-profile.md` |
| EUDI ARF (what AV is *not*) | `docs/main/06-trust-model.md` §6.6.3.2 (RP authentication), §5.7.4 (OID4VP + HAIP) in `eu-digital-identity-wallet/eudi-doc-architecture-and-reference-framework` |
| ISO/IEC TS 18013-7:2025 Annex C (`org-iso-mdoc` DC API) | structures mirrored in `apps/backend/src/verifier/iso18013/DESIGN.md` |
| OpenID4VC HAIP 1.0 (final) | <https://openid.net/specs/openid4vc-high-assurance-interoperability-profile-1_0.html> |
| HPKE | RFC 9180 (test vector A.3 used in `hpke.spec.ts`) |
| EU AV Trusted List | ETSI TS 119 612 XML `TrustServiceStatusList`, XAdES-signed. No list-of-lists — pinning the signer *is* anchoring to the root |

## Key profile facts (verified against the sources above)

- **AV is not a subset of the ARF.** Both sit on OID4VCI + OID4VP + ISO
  mDoc, but AV targets LoA *substantial* and has no relying-party trust
  list, so Annex A §A.10 removes — deliberately, with reasons — JAR,
  response encryption, PAR, client attestation and RP authentication. TLS
  and the Web PKI are what authenticate the RP. Consequence for this fork:
  **the settings that make AV work are the settings that make an EUDI
  deployment non-conformant.** Never widen an AV-only knob to a shared
  default.
- **AV presentation, default flow**: ISO 18013-7 Annex C via the Digital
  Credentials API (`response_type: "iso-18013-7"`). Works on vanilla
  upstream since PR #836 — the AV part is pure configuration
  (docType `eu.europa.ec.av.1` + AV IACA in the trust list). Optional
  **reader authentication** (the verifier signs the `DeviceRequest`) is
  available per config via `readerAuth: true` — **upstream since v7.0.0**
  (our PR #884). AV itself puts reader auth out of scope (§A.6); the EUDI
  side is what wants it.
- **AV presentation, fallback flow (QR/deeplink)**: OpenID4VP with client
  identifier scheme **`redirect_uri`** and **unsigned** authorization
  requests (§A.6: the client identifier scheme MUST be `redirect_uri`
  followed by the `response_uri`; AV deliberately does not use JAR — no RP
  trust list exists), with an **unencrypted `direct_post`** response.
  Fork delta — see `PATCHES.md` §1.1.
- **HAIP 1.0 final** mandates `x509_hash` for signed requests (earlier HAIP
  drafts used `x509_san_dns`/`verifier_attestation` — wallets built on
  drafts may still expect those). This is EUDIPLO's default and stays it.
- **AV issuance**: both `authorization_code` and `pre-authorized_code` MUST
  be supported (HAIP does not use the pre-authorized grant at all). The AV
  wallet only supports `credential_configuration_id`, so
  `authorization_details` must be omitted from the pre-auth token response
  — fork delta, `PATCHES.md` §1.5.
- **`meta.doctype_value`, never `meta.doctype`.** `doctype_value` is the
  only field the DCQL spec defines for `mso_mdoc` and the only one v7's
  `.strict()` config schema accepts. The ISO 18013-7 offer builder used to
  read `doctype`, which made v7 self-contradictory (a config with the field
  fails validation, one without it fails every offer). Fixed in `d4aaec5`;
  generic bug, upstreamable on its own merits.
- **`statusCheckMode` is `strict` and written explicitly** on the AV configs
  (`age-verification`, `-sandbox`, `-fallback`). v7 defaults an unset value
  to `strict`, the opposite of the pre-v7 fork behaviour; verified safe
  against `@owf/mdoc` 0.7.0, whose `verifyStatus()` returns early when the
  MSO carries no status list. See `PATCHES.md` §3.
- **`VP_REMOVE_TA` is a server-global env var**, not per tenant. It strips
  `trusted_authorities` from the DCQL sent to the wallet because some AV
  wallets reject the whole request when it is present. It exists *for* AV
  yet changes what every tenant's request contains — the clearest existing
  case of an AV setting with deployment-wide blast radius.
- The AV reference IACA/DS certificates carry a malformed `issuerAltName`
  (nested Extension) — handled by `registerTolerantX509Extensions()`,
  **upstream** since it shipped with #836.

## Fork deltas — index into `PATCHES.md`

Before editing any file below, read the matching `PATCHES.md` section: it
carries the upstream status and the rebase notes this table deliberately
does not duplicate.

| Where | What | `PATCHES.md` |
| --- | --- | --- |
| `verifier/oid4vp/oid4vp.service.ts`, `verifier/presentations/entities/presentation-config.entity.ts`, `verifier/presentations/schemas/presentation-config.schema.ts`, migration `1790000000000` | `clientIdScheme: "redirect_uri"` — unsigned request-by-value + unencrypted `direct_post`, the AV QR/deeplink fallback | §1.1 |
| `trust/trust-store.service.ts`, `TrustListRef` in the presentation-config entity (`format`, `serviceTypeMap`, `acceptedServiceStatus`), `packages/etsi-trusted-list` | ETSI TS 119 612 XML trusted lists; upstream v7 speaks LoTE (TS 119 602 JSON) + managed lists only | §1.2 |
| `test/fixtures/av/*`, `presentation-mdoc-av-negative.e2e-spec.ts`, `mdoc-verifier-altid-appendix-f.spec.ts` | AV negative vectors + real AltID Appendix F `vp_token` | §1.3 |
| `.github/workflows/publish-espuni-image.yml`, this file, `docs/findings/` | Fork infrastructure — never goes upstream by design | §1.4 |
| `issuer/issuance/oid4vci/authorization/authorize/authorize.service.ts` | Omit `authorization_details` in the pre-authorized flow | §1.5 |
| `verifier/presentations/credential/verification-failure.ts`, both verifiers | Structured verification failure taxonomy — **proposed upstream, PR #970** | §1.6 |
| `session/entities/session-outcome.ts`, `session.entity.ts`, `webhook/*`, migration `1776000000000` | Structured session outcome, `failureCode`, failure webhook, warnings | §1.7 |

**Migration numbering rule:** fork migrations are numbered **above
upstream's highest** (today `1775000000000`), with a wide gap. Upstream has
renumbered ours before, and TypeORM keys on `ClassName + timestamp`.

## Deltas that dissolved — do not re-add

- **`mdoc-issuer.service.ts` duplicate `elementIdentifier`s.** Upstream now
  merges claims per namespace before a single `addIssuerNamespace()` call
  (`addClaimsToIssuer`, last touched by upstream #937). The fork delta is
  gone from the tree; only the finding in
  `docs/findings/bug-reports/2026-07-09-mdoc-issuer-duplicate-element-identifiers.md`
  remains, and its "Fixed in this fork" status line is stale.
- **`readerAuth` in `verifier/iso18013/*`** — upstream since v7.0.0 (#884).
- **`registerTolerantX509Extensions()`** — upstream, shipped with #836.
- **`trustListConfig` as a column** — v7 moved verifier material into
  `trusted_authorities`, so the XML settings ride inside the `dcql_query`
  JSON. The column and its migration are orphans on upgraded databases;
  leave them, dropping the column would be destructive for no gain.
- **`disableStatusValidation` when no revocation anchors exist**
  (`a532436e`) — superseded by v7's `statusCheckMode` (#881).

Everything else that reached upstream from this fork — #836, #862, #884,
#890, #954, #955, #957 — is listed in `PATCHES.md` §2.

## Working conventions

- Upstream PRs require **DCO sign-off** (`git commit -s`). Cryptographic
  signing happens only on the maintainer's machine — never create or upload
  signing keys from a cloud session; disable `commit.gpgsign` here.
- Do not push to branches with an open upstream PR without explicit OK from
  the maintainer of this fork; prepare changes on a `docs/...` or review
  branch first.
- **Every rebase onto a new upstream tag starts by re-reading `PATCHES.md`**
  and confirming each "already upstream" entry really is in the target tag
  (`git grep` it, don't trust the PR title). Check a rebase commit's
  diffstat, never its subject line — §1.5 hid inside one for months.
- CI gates (`.github/workflows/ci-and-release.yml`): Biome (`pnpm lint`),
  `markdownlint "docs/**/*.md"` (`pnpm doc:lint`), `license-checker`,
  `knip` (no unused exports), builds for backend / client / CLI / SDK core /
  webhook / docs, and vitest E2E in both OIDF and non-OIDF variants.
  Upstream PRs additionally run DCO, SonarCloud and CodeQL.
