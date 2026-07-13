# EUDIPLO fork (espuni) — project context

This is espuni's fork of `openwallet-foundation/eudiplo`. It powers a
multi-tenant **Age Verification (AV)** service while contributing generic
EUDI features upstream. Upstream is EUDI-oriented; AV support is under
discussion with the maintainer (@cre8 / Mirko).

## Reference specifications — always consult before protocol decisions

| Topic | Source |
| --- | --- |
| **EU Age Verification profile (Annex A)** | <https://ageverification.dev/av-doc-technical-specification/docs/annexes/annex-A/annex-A-av-profile/> — raw: `https://raw.githubusercontent.com/eu-digital-identity-wallet/av-doc-technical-specification/main/docs/annexes/annex-A/annex-A-av-profile.md` |
| ISO/IEC TS 18013-7:2025 Annex C (`org-iso-mdoc` DC API) | structures mirrored in `apps/backend/src/verifier/iso18013/DESIGN.md` |
| OpenID4VC HAIP 1.0 (final) | <https://openid.net/specs/openid4vc-high-assurance-interoperability-profile-1_0.html> |
| HPKE | RFC 9180 (test vector A.3 used in `hpke.spec.ts`) |

## Key profile facts (verified against the sources above)

- **AV presentation, default flow**: ISO 18013-7 Annex C via the Digital
  Credentials API (`response_type: "iso-18013-7"`). Works on vanilla
  upstream after PR #836 — the AV part is pure configuration
  (docType `eu.europa.ec.av.1` + AV IACA in the trust list).
- **AV presentation, fallback flow (QR/deeplink)**: OpenID4VP with client
  identifier scheme **`redirect_uri`** and **unsigned** authorization
  requests (AV profile §"client identifier scheme MUST be `redirect_uri`";
  AV deliberately does not use JAR — no RP trust list exists).
  **EUDIPLO does not support this scheme yet** (only `x509_hash` + signed
  JAR) — open gap for full AV support.
- **HAIP 1.0 final** mandates `x509_hash` for signed requests (earlier HAIP
  drafts used `x509_san_dns`/`verifier_attestation` — wallets built on
  drafts may still expect those).
- **AV issuance**: pre-authorized code flow; the AV wallet only supports
  `credential_configuration_id`, so `authorization_details` must be omitted
  from the pre-auth token response (fork delta in `authorize.service.ts`).
- The AV reference IACA/DS certificates carry a malformed `issuerAltName`
  (nested Extension) — handled by `registerTolerantX509Extensions()`.

## Fork deltas vs upstream (keep minimal; audit before syncs)

1. `authorize.service.ts` — omit `authorization_details` in pre-auth token
   responses (AV wallet compat; candidate upstream flag).
2. `mdoc-issuer.service.ts` — merge external claims over config defaults to
   avoid duplicate `elementIdentifier`s (follow-up to upstream #812;
   reported as upstream issue #838, open).
3. `docs/findings/` — fork-internal bug reports / improvement notes with
   upstream-reporting status. Keep statuses updated.

## Working conventions

- Upstream PRs require **DCO sign-off** (`git commit -s`). Cryptographic
  signing happens only on the maintainer's machine — never create or upload
  signing keys from a cloud session; disable `commit.gpgsign` here.
- Do not push to branches with an open upstream PR without explicit OK from
  the maintainer of this fork; prepare changes on a `docs/...` or review
  branch first.
- CI gates on upstream: DCO, `markdownlint "docs/**/*.md"`, `knip` (no
  unused exports), Biome, vitest.
