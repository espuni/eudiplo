# AV Blueprint vs the ARF, and how to carry both in EUDIPLO

> **Status (2026-08-29): analysis + proposal, not implemented.** Written for
> the conversation with `cre8` about taking ownership of EU AV Blueprint
> support inside EUDIPLO. Nothing here changes code; §5 is the design I would
> propose before any of the AV patches in `PATCHES.md` §1 go upstream.
>
> Companion documents: `PATCHES.md` (the running inventory of what this fork
> carries) and `docs/findings/improvements/2026-07-13-av-oid4vp-redirect-uri-fallback.md`
> (the implementation plan for the single largest AV patch).

**Fork base:** upstream v7.2.0
**Spec basis:** EU Age Verification technical specification, Annex A §A.3–§A.11 ·
EUDI ARF §5.7.4, §6.3.2, §6.4.2, §6.6.3.2 · OpenID4VC HAIP 1.0 ·
ISO/IEC 18013-7 Annex C

---

## 0. The four claims

1. **AV and the ARF are peers, not layers.** Both sit on OID4VCI, OID4VP and
   ISO mDoc. AV targets LoA *substantial* and has no relying-party trust list,
   so it drops JAR, response encryption, RP registration and RP authentication
   on purpose — and says so, clause by clause, in Annex A §A.10.
2. **The AV default flow already runs on upstream.** ISO 18013-7 Annex C landed
   in v6.0.0 (#836). For that path, "AV support" is a docType and a trust
   anchor — pure configuration. The gap is the fallback, the issuance flow, the
   trust-list format and the invocation scheme.
3. **Five fork deltas cover the gap**, and only three of them are AV-specific.
   The other two are generic OID4VP / ETSI features whose driving use case
   happens to be AV.
4. **The risk is not the code, it is the shape of the config surface.** Today AV
   settings are loose optional fields and deployment-global env flags. One
   nullable enum on a presentation config silently turns off relying-party
   authentication, request integrity and response encryption, and nothing in the
   session record says it happened. That is the thing to fix before AV goes
   in-tree — and it is worth fixing even if it never does.

---

## 1. Two profiles on one protocol stack

The ARF requires OpenID4VP together with the HAIP profile for interoperability
(ARF §5.7.4), and it makes relying-party authentication a per-transaction
obligation: the RP Instance signs the request and ships its access certificate
plus intermediates, and the Wallet Unit validates that chain against an Access
CA trust anchor taken from a List of Trusted Entities, checking revocation
(ARF §6.6.3.2). Registration is mandatory under CIR 2025/848, with registration
certificates bounding what the RP may ask for.

The AV profile removes each of those, and gives a reason for each removal. Its
§A.10 is explicit: JAR only helps if there is a trust list of RPs to anchor it,
and AV has none by design, so an attacker with any valid certificate could
substitute a JAR and the signature would prove nothing. Response encryption
defends against malicious CAs, which are outside AV's threat model. Client
authentication by JWT attestation is likewise "value only when combined with
trust lists". What authenticates the RP in AV is TLS and the Web PKI — nothing
else.

### 1.1 Clause-level comparison

| Dimension | EUDI / ARF + HAIP | EU AV Blueprint (Annex A) |
| --- | --- | --- |
| Assurance level | High for PID; substantial for EAAs | Substantial only — LoA high explicitly out of scope (§A.3) |
| Attestation formats | ISO mDoc and SD-JWT VC | mDoc only |
| Attestation type | Per rulebook (PID, mDL, …) | docType `eu.europa.ec.av.1`, one namespace (§A.4) |
| Attribute set | Defined by the rulebook | `age_over_18` mandatory, `age_over_NN` optional — "SHALL NOT include any other attribute" |
| RP registration | Mandatory; registration certificates, revoked via ETSI TS 119 475 status lists | Out of scope — "RP registration and trusted lists of RPs" (§A.3) |
| RP authentication | Signed request + access certificate chain validated to a LoTE trust anchor, revocation checked (§6.6.3.2) | None. Client authentication out of scope (§A.6). TLS + Web PKI *is* the RP authentication |
| Request integrity | JAR, signed request object | No JAR. Request sent **by value**, unsigned |
| Client identifier | `x509_hash` (HAIP 1.0 final) | MUST be `redirect_uri:<response_uri>` |
| Response mode | `direct_post.jwt` — encrypted | `direct_post` — unencrypted |
| Default channel | OID4VP over custom scheme or the W3C DC API | DC API per ISO 18013-7 Annex C is the *default*; OID4VP is the *fallback* |
| Reader auth (18013-7) | The mDoc-side equivalent of RP authentication | "Not required and therefore out of scope" (§A.6) |
| Invocation scheme | `openid4vp://`, `haip://`, DC API | `av://` MUST be supported, issuance and presentation alike |
| Issuance grants | HAIP: `authorization_code`; no pre-authorized code | Both `authorization_code` and `pre-authorized_code` MUST be supported |
| Authorization endpoint | PAR + wallet attestation over a trust list of solution providers | No PAR — "a self-signed certificate does not offer any value" (§A.10) |
| Credential config id | Per rulebook | Single element `proof_of_age`, reused as the `scope` value |
| Wallet attestation | Wallet Unit Attestation, key attestation, device binding | AVI attestations, AVI trust lists and device-bound attestations all out of scope (§A.3) |
| Revocation | Status lists throughout | Re-issuance and revocation out of scope (§A.3) |
| Issuer trust anchors | Trusted Lists / LoTE, ETSI TS 119 602 JSON in the ARF direction | One EU AV Trusted List, **ETSI TS 119 612 XML**, XAdES-signed. No list-of-lists — pinning the signer *is* the root |
| Zero-knowledge proofs | Not profiled | §A.8: the app SHOULD generate longfellow-zk proofs; the RP SHOULD verify them |
| Crypto | Per ARF | P-256 / ES256 / SHA-256 MUST (§A.7) |

### 1.2 The same four slots, under each profile

```text
                1                2                  3                  4
          CLIENT IDENT.    REQUEST INTEGRITY     RP TRUST          RESPONSE
        +--------------+ +------------------+ +--------------+ +----------------+
eudi-   | client_id =  | | signed JAR,      | | wallet checks| | direct_post.jwt|
haip    | x509_hash:<h>|→| served at        |→| cert chain to|→| encrypted (JWE)|
        |              | | request_uri      | | LoTE anchor  | |                |
        +--------------+ +------------------+ +--------------+ +----------------+

        +--------------+ ,- - - - - - - - -, ,- - - - - - - -, +----------------+
eu-av-1 | client_id =  | | no JAR — all    | | no RP trust  | | direct_post    |
        | redirect_uri:|→| params by value | | list — TLS / |→| plaintext form |
        | <response_uri| | in the URL      | | Web PKI only | | post           |
        +--------------+ '- - - - - - - - -' '- - - - - - - -' +----------------+
                 |                                                     ^
                 '------ request goes straight to the wallet ----------'
```

Dashed boxes are the ARF obligations the AV profile removes on purpose (§A.10).
AV keeps slots 1 and 4 with weaker settings and empties slots 2 and 3 — which is
why a config that merely "sets a flag" cannot be told apart from a misconfigured
EUDI one.

---

## 2. What already works on vanilla EUDIPLO

Worth stating first, because it narrows the ask considerably. The AV *default*
presentation path — ISO 18013-7 Annex C over the Digital Credentials API — needs
no code beyond what upstream already ships, and most of that arrived from this
fork:

- **#836** — ISO 18013-7 Annex C, `org-iso-mdoc`, merged in v6.0.0. This is the
  AV default flow. Making it "AV" is a docType (`eu.europa.ec.av.1`) and the AV
  IACA in the trust list.
- **Tolerant `issuerAltName` parsing** — shipped with #836 as
  `registerTolerantX509Extensions()`. The AV reference IACA and DS certificates
  carry a malformed `issuerAltName` that wraps a nested Extension around the
  GeneralNames; `@peculiar/x509` throws on it, which made every AV credential
  unverifiable. Already upstream, already generic.
- **#884** — opt-in `readerAuth` for the DC API flow, v7.0.0. AV does not need
  it (§A.6 puts reader auth out of scope); the ARF side does.
- **#890** — per-request webhook override in the 18013-7 path, v7.0.0.
- **#862** — fail closed when a trust list cannot be loaded, v6.2.0.

---

## 3. The deltas this fork carries

Five live patches, catalogued in `PATCHES.md` and re-applied against v7.2.0 in
August 2026. Three are AV-specific; two are generic features that AV happens to
force.

### 3.1 `clientIdScheme: "redirect_uri"` — AV-specific relaxation

Commits `139b4db3` (original) · `4113fd8` (re-applied) · migration
`1790000000000`. See `PATCHES.md` §1.1.

Implements Annex A §A.6's fallback: `client_id = redirect_uri:<response_uri>`,
all authorization parameters by value in the URL, no JAR, no
`client_metadata.jwks`, and an unencrypted `direct_post` response parsed
straight off the form body instead of decrypting a JWE.

| | |
| --- | --- |
| Touches | `oid4vp.service.ts` (a `createRedirectUriRequest()` branch plus a response branch keyed on the stored `client_id`), the presentation-config entity, the Zod schema, one migration |
| Reusable as-is | The whole verification pipeline — DCQL, mDoc verification, trust-list validation, session lifecycle, webhooks. Only request construction and response unwrapping differ |
| Why AV needs it | The AV wallet rejects the default scheme in fallback. Without it, AV presentation is DC-API-only |
| Why EUDI must not have it | Setting it disables relying-party authentication, request integrity and response confidentiality in a single nullable enum |
| Upstreamable? | The mechanism yes — `redirect_uri` is a standard OID4VP §5.9 client identifier scheme. Its *availability* is the profile question |

### 3.2 ETSI TS 119 612 XML trusted lists — generic capability

Commits `f691ef5e` + five library commits (original) · `012405e` (re-applied) ·
package `packages/etsi-trusted-list`. See `PATCHES.md` §1.2.

The EU AV Trusted List is a TS 119 612 `TrustServiceStatusList` in XML,
XAdES-signed. Upstream v7 speaks LoTE (TS 119 602 JSON) and internally managed
lists only, so there is no path to it. The bridge adds three optional fields to
`TrustListRef` — `format`, `serviceTypeMap`, `acceptedServiceStatus` — and
reuses v7's own `verifierX509Der` as the pinned XAdES signer.

| | |
| --- | --- |
| Notable | No new database column. v7 moved verifier material into `trusted_authorities`, so the ref rides inside the `dcql_query` JSON and the fork's old `trustListConfig` column disappeared — one less schema divergence |
| Fail-closed | The XAdES signature is verified against the pinned signer before the list is used; a wrong pin rejects the list. AV has no list-of-lists, so pinning the signer *is* anchoring to the root |
| Dependency | The parser was proposed as EUDIPLO #883, closed, and landed instead in OWF Labs `identity-common-ts` #170 as `@owf/eudi-tl`, merged 2026-08-22 but **not yet on npm**. When it publishes, the five library commits retire and only the ~100-line bridge remains |
| Upstreamable? | Yes, and arguably regardless of AV: v7 made signer pinning mandatory, which is exactly what #883 argued for, and TS 119 612 lists are not an AV invention |

### 3.3 Omit `authorization_details` in the pre-authorized flow — AV-specific relaxation

Hidden inside `22c9ee48` · re-applied as `009dfa3`. See `PATCHES.md` §1.5.

When the token response carries `authorization_details` with credential
identifiers, the spec requires the wallet to use `credential_identifier` in the
credential request. Wallets that only implement `credential_configuration_id` —
the AV reference app among them — break. The patch omits the field when the
grant is `pre-authorized_code`.

| | |
| --- | --- |
| Touches | One expression in `authorize.service.ts` |
| Scope problem | It is **unconditional for the whole deployment**. HAIP does not use the pre-authorized grant at all, so it is latent rather than harmful today — but it is a spec-visible behaviour change applied to every tenant on the instance |
| Caveat | Needs re-checking against upstream `main` post-#958, where `buildAuthorizationDetails` is no longer unconditional. It may already be redundant |

### 3.4 AV regression vectors — fork-only test material

Commits `f6e5d1b6` `3281cdf5` `89079bc7`, carried in `d5d3357`. See
`PATCHES.md` §1.3.

A negative-vector e2e suite for AV mDocs, an untrusted-issuer key chain, and a
real AltID Appendix F `vp_token` fixture with its unit spec. Never proposed
upstream because there was nothing to attach it to. Under a profile mechanism
this becomes the `eu-av-1` conformance suite.

### 3.5 `meta.doctype_value` in the 18013-7 offer builder — plain bug

Commit `d4aaec5`.

The offer builder read `meta.doctype`, which the DCQL spec does not define for
`mso_mdoc` and which the v7 config schema — now `.strict()` — rejects on write.
So under v7 no config could both save and serve the DC API flow: with the field
it fails validation, without it every offer 400s. It reads `doctype_value` now.
This one should go upstream on its own merits whatever is decided about AV.

### 3.6 Not in the fork, but part of AV ownership

- **The `av://` invocation scheme.** §A.5 and §A.6 both require it. EUDIPLO
  hardcodes `openid4vp://` (`verifier-offer.controller.ts`); the platform on top
  rewrites the scheme afterwards, which is the wrong layer.
- **`VP_REMOVE_TA`.** An upstream env flag that strips `trusted_authorities`
  from the DCQL sent to the wallet, because some AV wallets reject the request
  outright when it is present. It exists *for* AV, and it is deployment-global —
  see §4.
- **Zero-knowledge verification (§A.8).** A SHOULD for the RP. Implemented
  downstream against longfellow-zk; EUDIPLO has nothing. Realistically a later
  phase, but it belongs on the map if AV lands here.
- **`trusted_authorities` sanitisation.** With `VP_REMOVE_TA=false`,
  `verifierX509Der` goes out to the wallet inside `trusted_authorities`, where
  DCQL expects `etsi_tl` values to be identifiers. Harmless with the flag on;
  worth a separate issue.

---

## 4. How an AV parameter leaks today

Three distinct ways an AV setting reaches a config that was never meant to be AV.

### 4.1 Leak 1 — a nullable enum with a safe-looking default

`clientIdScheme` is an optional, nullable field on the presentation config. The
request builder reads `presentationConfig.clientIdScheme ?? "x509_hash"`. The
default is right, but the field is *offered* on every config: an operator can
set `redirect_uri` on a PID config and it validates, stores, builds a request,
verifies the mDoc and fires the webhook. Nothing rejects it, nothing warns, and
the resulting verification looks identical to a conformant one from the outside.

> **The concrete failure.** A tenant meaning to run under the ARF ends up with
> an unsigned, unencrypted, unauthenticated presentation request — and the only
> trace is one enum value in a config table.

### 4.2 Leak 2 — deployment-global switches

`VP_REMOVE_TA` is read once from `ConfigService` and applies to every tenant on
the instance. So does the pre-authorized `authorization_details` omission. On a
multi-tenant deployment you cannot serve AV and the ARF at the same time without
degrading the ARF side — and the degradation is invisible in the config, because
it is not in the config.

### 4.3 Leak 3 — the evidence does not say which rules applied

The session record captures success or failure. It does not capture *under which
profile*, or what actually authenticated the relying party in that transaction.
After the fact you cannot distinguish "the wallet validated our access
certificate chain" from "we relied on TLS". For a service whose output is legal
evidence, that is the gap that matters most.

---

## 5. Proposal: profiles as a declared property

One field, four gates, and a line in the evidence. The principle is that a
relaxation must be **chosen by name**, must be **unrepresentable** outside the
profile that names it, and must **appear in the audit trail**.

### 5.1 The field

```jsonc
// presentation config — profile is the discriminator, not a hint
{
  "id": "age-verification-fallback",
  "profile": "eu-av-1",              // default: "eudi-haip"
  "clientIdScheme": "redirect_uri",  // only exists under eu-av-1
  "dcql_query": { }
}
```

In the schema this is a discriminated union, not an extra optional field. Since
`PresentationConfigCreateSchema` is already `.strict()`, an AV field on a
`eudi-haip` config is *rejected* rather than ignored — the enforcement comes
almost free:

```ts
const EudiHaip = Base.extend({
    profile: z.literal("eudi-haip").default("eudi-haip"),
    readerAuth: z.boolean().optional(),
    registration_cert: RegistrationCertificateRequestSchema.optional(),
}).strict();

const EuAv1 = Base.extend({
    profile: z.literal("eu-av-1"),
    clientIdScheme: z.enum(["redirect_uri", "x509_hash"]).default("redirect_uri"),
    invocationScheme: z.string().default("av"),
    omitTrustedAuthorities: z.boolean().default(true), // replaces global VP_REMOVE_TA
})
    .strict()
    .superRefine(assertAvInvariants);

export const PresentationConfigCreateSchema = z.discriminatedUnion("profile", [
    EudiHaip,
    EuAv1,
]);
```

### 5.2 What each profile fixes, allows and forbids

| Knob | `eudi-haip` (default) | `eu-av-1` |
| --- | --- | --- |
| Client identifier | Fixed `x509_hash`; the field does not exist | `redirect_uri` (default) or `x509_hash` for the DC API path |
| Request delivery | Signed JAR by reference | Unsigned, by value |
| Response mode | `direct_post.jwt` | `direct_post` |
| `readerAuth` | Allowed | Rejected — out of profile scope (§A.6) |
| `registration_cert` | Supported | Rejected — AV has no RP registration |
| Credential format | `mso_mdoc` or `dc+sd-jwt` | `mso_mdoc` only |
| `meta.doctype_value` | Free | Must be `eu.europa.ec.av.1` |
| Requested claims | Free | `age_over_NN` in the AV namespace only (§A.4) |
| Trust-list format | `lote-json` only | `lote-json` or `etsi-xml`, signer pinned |
| `trusted_authorities` stripping | Never | Per config — replaces the global `VP_REMOVE_TA` |
| Invocation scheme | `openid4vp://` | `av://`, configurable |
| Issuance: pre-auth grant | `authorization_details` always built | Omitted in the pre-authorized flow |
| Issuance: config ids | Unconstrained | Single element |

The issuance rows imply the same field on the issuance config. Under
`eudi-haip` the pre-authorized omission does not merely default off — it does
not exist.

### 5.3 Where a stray parameter gets stopped

```text
  A  POST /presentation-config                B  POST /presentation-config
     { clientIdScheme: "redirect_uri" }          { profile: "eu-av-1", ... }
     no profile declared                         relaxation chosen by name
                    \                           /
                     v                         v
              +-------------------------------------------+
              | G1  Deployment allowlist                  |
              |     VERIFIER_PROFILES=eudi-haip           |
              +-------------------------------------------+
                                 |
   A -> 400 <--------------------+-------------+
   "clientIdScheme is not        | G2  Schema — discriminated union      |
    part of eudi-haip"           |     .strict() on both variants        |
                                 +---------------------------------------+
                                 |
                                 v
              +-------------------------------------------+
              | G3  Profile invariants                    |
              |     docType · claims · no registration_cert|
              +-------------------------------------------+
                                 |
                                 v
              +-------------------------------------------+
              | G4  Request builder                       |
              |     switches on profile, never on a flag  |
              +-------------------------------------------+
                                 |
                                 v
              +-------------------------------------------+
              | Session outcome carries the profile       |
              | profile: "eu-av-1"                        |
              | rpAuthentication: "tls-only"              |
              +-------------------------------------------+
```

Today there is no gate at all: request A validates, stores and runs. The gate
that does the real work is G2 — a discriminated union means the AV field is not
a value the EUDI variant can hold.

1. **Deployment allowlist.** An instance declares which profiles it serves.
   Default `eudi-haip` alone. On an ARF-only deployment the AV branch is not
   merely unused — creating an AV config is refused, so the code path is
   unreachable. This is the direct answer to "can an AV parameter sneak into a
   EUDI deployment": not without an operator turning the profile on by name.
2. **Schema, discriminated on the profile.** AV-only fields exist only in the AV
   variant. Because both variants are `.strict()`, sending one to a `eudi-haip`
   config is a 400 that names the profile, not a silently dropped key. Nested
   material — the trust-list `format` inside `dcql_query` — is handled by
   parameterising the DCQL schema on the profile.
3. **Profile invariants at write time.** Cross-field rules the union cannot
   express: under `eu-av-1`, `mso_mdoc` only, docType pinned to
   `eu.europa.ec.av.1`, every claim path an `age_over_NN` in the AV namespace,
   no `registration_cert`, no `readerAuth`. This is Annex A §A.4 turned into
   validation instead of documentation.
4. **Runtime reads the profile, not the flag.** `Oid4vpService` switches on
   `config.profile`. No code path can produce an unsigned request unless the
   config declares `eu-av-1`. The current `clientIdScheme ?? "x509_hash"`
   reading is the leak in miniature: it derives the profile from a field instead
   of the other way round.

### 5.4 And one line in the evidence

The session outcome records `profile`, and — more usefully — **how the relying
party was actually authenticated** in that transaction: `access-certificate` or
`tls-only`. This drops naturally into the structured-outcome work already in
flight on the fork (`PATCHES.md` §1.7), and it turns "which rules produced this
verdict" from an inference into a recorded fact.

---

## 6. Migration and compatibility

- **Nothing breaks.** `profile` is nullable and absent means `eudi-haip`; every
  existing config keeps behaving exactly as it does now, because `eudi-haip`
  *is* today's default behaviour.
- **One data migration** stamps `profile: "eu-av-1"` on configs that already
  carry `clientIdScheme: "redirect_uri"` — on this fork, three per tenant.
- **Env flags retire into the profile.** `VP_REMOVE_TA` becomes a per-config
  setting under `eu-av-1`, with the global flag kept as a deprecated override
  for one release.
- **The OpenAPI surface improves.** Two documented variants instead of one
  config object with a growing set of fields whose applicability lives only in
  prose.
- **Tests get a home.** One conformance suite per profile — the fork's AV
  vectors become the `eu-av-1` suite — plus a negative matrix asserting every AV
  field is rejected under `eudi-haip`. That matrix is the regression test for
  this entire document.
- **Extension point.** A third profile then costs a variant and a test suite,
  not another round of loose flags.

---

## 7. Sequencing

| Phase | Content | Depends on |
| --- | --- | --- |
| 0 · done | ISO 18013-7 Annex C, tolerant certs, reader auth, per-request webhook, fail-closed trust lists | Already upstream (#836, #862, #884, #890) |
| 1 | The profile mechanism itself, with only `eudi-haip` defined. Reviewable on its own merits; changes no behaviour | Maintainer's call on the shape |
| 2 | `eu-av-1`: `redirect_uri` scheme, invocation scheme, the issuance pre-auth delta, the §A.4 invariants | Phase 1 |
| 3 | ETSI TS 119 612 XML trusted lists | `@owf/eudi-tl` npm release |
| 4 | AV conformance suite and profile-tagged docs | Phase 2 |
| 5 · optional | Zero-knowledge verification (§A.8 SHOULD) | Everything above |

Phase 1 is deliberately separable: if the answer on AV is no, the profile
mechanism is still worth having, because it turns "which spec is this config
obeying" into a declared, testable, auditable property of every EUDIPLO
deployment.

### 7.1 Open questions for `cre8`

- **Does AV belong in the tree at all?** In-tree profile, or an extension point
  with the AV profile shipped separately? The gate design works either way; the
  packaging changes what phase 1 builds.
- **Is the config the right scope?** The profile is modelled per presentation
  config here. Per tenant is the alternative — cleaner isolation, less
  flexibility for a tenant that legitimately runs both.
- **Retire `VP_REMOVE_TA`?** It is the clearest existing instance of the
  problem: an AV-driven, deployment-global switch that silently changes what
  every tenant's request contains. Folding it into the profile is the natural
  fix, but it is a breaking change for anyone setting it today.
- **Ownership boundary.** The boundary that makes sense: the AV profile and its
  conformance suite, kept honest against Annex A, with the shared surfaces
  changed only through profile-neutral mechanisms reviewed as EUDI features.
