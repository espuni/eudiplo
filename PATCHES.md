# PATCHES — what this fork carries on top of upstream, and why

Single source of truth for the espuni fork of
[EUDIPLO](https://github.com/openwallet-foundation/eudiplo): which patches run
where, which are already upstream, and which must survive a rebase.

**Keep this file honest.** Every rebase onto a new upstream tag starts by
re-checking this table — a patch that silently became redundant is how a fork
rots.

---

## Current state

| | |
|---|---|
| Upstream base of `main` | **v6.1.0** (rebase onto **v7.2.0** in progress, branch `chore/rebase-v7.2.0`) |
| Fork-only commits on top | 27 (non-merge) |
| Published image | `ghcr.io/eudiaas/eudiplo:v5.1.0-espuni.1` |
| Built from | `9908db0` (2026-08-16) |
| Consumed by | cp-platform staging (`eudiplo-staging.espuni.com`) |

> ⚠ **The image tag lies.** `v5.1.0-espuni.1` was named after the base at the
> time of the first publish and never renamed, but the image actually contains
> **v6.1.0** + these patches. Next publish must be tagged after its real base
> (`v7.2.0-espuni.1` once the rebase lands). Verify with
> `git describe --tags --abbrev=0 <commit>` before tagging, never from memory.

---

## 1. Live patches — must survive the rebase

### 1.1 `redirect_uri` client identifier scheme

| | |
|---|---|
| Commits | `139b4db3` (feat) · `92e8e97a` `1e284063` `2a77d766` (docs) |
| Upstream status | **Never proposed.** Absent from every tag through v7.2.0 |
| Why we need it | EU AV profile Annex A §A.6 fallback: unsigned OID4VP request-by-value + unencrypted `direct_post`. The default `x509_hash` scheme is not accepted by the AV wallet in fallback |
| Consumed by | cp-platform config `age-verification-fallback` |
| v7 impact | 🔴 `PresentationConfigSchema` is Zod **`.strict()`** and does not know `clientIdScheme` → the whole config is **rejected**, not ignored. Patch must be re-applied |

### 1.2 XML trusted-list bridge

| | |
|---|---|
| Commit | `f691ef5e` — *bridge presentation config to XML trusted lists* |
| Library commits | `237d86d2` `ee4c4684` `0bdafd9d` `155360b9` `08a8cd8a` |
| Upstream status | Library proposed as EUDIPLO PR **#883 → CLOSED**. Correct home turned out to be OWF Labs: **`identity-common-ts` PR #170** (`@owf/eudi-tl`), **approved by `cre8` (EUDIPLO lead maintainer) on 2026-08-11**, awaiting merge |
| Why we need it | The EU AV Trusted List is **ETSI TS 119 612 XML**. Upstream v7 only speaks LoTE (TS 119 602 JSON) + internally managed lists — no XML path exists |
| v7 impact | 🔴 v7 redesigned `trusted_authorities` to objects (`{url, verifierX509Der}` or `{trustListId}`). The bridge must be rebuilt against that shape |

> **Once `@owf/eudi-tl` publishes, the five library commits retire.** EUDIPLO
> already depends on that whole family (`@owf/cose`, `@owf/crypto`,
> `@owf/eudi-lote`, `@owf/identity-common`, `@owf/token-status-list`, all
> `^0.3.2`), so adoption is a dependency bump. **Only `f691ef5e` stays** — and
> becomes re-proposable upstream, since v7 made signer pinning mandatory, which
> is exactly what #883 argued for.

### 1.3 AV test vectors

| | |
|---|---|
| Commits | `f6e5d1b6` `3281cdf5` `89079bc7` |
| What | AV mDOC negative-vector e2e suite + real AltID Appendix F `vp_token` fixture |
| Upstream status | Fork-only, never proposed |
| v7 impact | 🟠 Tests only — no functional risk, but expect churn against v7 APIs |

### 1.4 Fork infrastructure (permanent)

| Commits | What |
|---|---|
| `5463f117` `a37a181f` | GHCR publish workflow under `ghcr.io/eudiaas` |
| `34c572ae` `0acc54d5` | `docs/findings/` notes (trust-list config surface, mdoc-ts ReaderAuth signing gap) |

Never goes upstream by design. Carry forward as-is.

---

## 2. Already upstream — drop on rebase

These landed upstream from this fork. After rebasing onto v7.2.0 they are
**redundant**: re-applying them would conflict or silently duplicate.

| Fork commit | Upstream PR | Lands in | Verified in v7.2.0 |
|---|---|---|---|
| `0fe97527` `e6f8d551` — reader auth (ISO 18013-7 Annex C) | **#884** MERGED | v7.0.0 | `readerAuth` in `presentation-config.schema.ts`; migration `1774000000000-AddReaderAuthToPresentationConfig` |
| `2008038a` — per-request webhook override in ISO 18013-7 | **#890** MERGED | v7.0.0 | `iso18013.service.ts` imports `WebhookConfig`/`WebhookService`; `webhook?` still on `PresentationRequestSchema` |
| `044e5505` `45ce45cb` + docs `f9dcff4e` `14d4331d` `b9b8332b` — fail closed when a trust list cannot load | **#862** MERGED | v6.2.0 | **Already redundant today**: fork `main` merged upstream past v6.2.0, so both our `044e5505` and upstream's squashed `1247a9b5` are present |
| — ISO 18013-7 Annex C `org-iso-mdoc` | **#836** MERGED | v6.0.0 | already in base |
| — `mdocverifier` DC API `SessionTranscript` branching | part of **#836** | v6.0.0 | `protocol === "dc_api"` → `SessionTranscript.forOid4VpDcApi()`; rationale preserved in `verifier/iso18013/DESIGN.md` |

`22c9ee48` (*rebuild fork main on upstream post-#836*) is a historical rebase
marker with no content of its own.

---

## 3. Superseded upstream — drop, but read the behaviour note

### `a532436e` — *don't reject mDOCs when no revocation certs are configured*

Our patch set `disableStatusValidation: trustedStatusAnchors.length === 0`, to
dodge `@owf/mdoc` throwing *"At least one certificate is required to check the
status of the mdoc"* when the verifier had opted out of a trust list.

**v7.0.0 solves this properly** (#881): `statusCheckMode:
"strict" | "best_effort" | "disabled"` on the presentation config, plus
`revocation-policy.util.ts`, and `mdocverifier` now attaches status anchors
unconditionally — falling back to the **issuance anchors** when no dedicated
revocation anchors exist, which removes the crash our patch worked around.

> 🔴 **Behaviour flip — action required downstream.** When `statusCheckMode`
> is **unset**, v7 defaults to `strict` → `{ enabled: true, failClosed: true }`.
> That is the **opposite** of what this patch did. Any config that relied on the
> old silent skip must now set `statusCheckMode` explicitly.
>
> **Decided 2026-08-22 for the cp-platform AV configs** (`age-verification`,
> `-sandbox`, `-fallback`): **`"strict"`, written explicitly.** AV credentials
> should carry no status list today, and if one ever did, failing when
> revocation state cannot be verified is the correct answer — consistent with
> the fail-closed posture elsewhere in the platform. Verified safe against
> `@owf/mdoc` 0.7.0: `verifyStatus()` returns early when the MSO carries no
> `statusList`/`identifierList`, so today's AV flow is untouched.
>
> The options that were on the table:
> - `"best_effort"` — checks status, fails **open** when the list is
>   unreachable. Closest to today's effective behaviour without disabling.
> - `"disabled"` — exactly today's behaviour, and says so out loud.
> - `"strict"` (the default if you write nothing) — a credential carrying a
>   status list in its MSO gets **rejected** when the list can't be fetched.

---

## 3b. Migration numbering

The fork ships its own TypeORM migrations, and upstream renumbered some of ours
when merging. TypeORM keys applied migrations on `ClassName + timestamp`, so a
renumbered migration reads as **not applied** and runs a second time.

Measured on the staging database (2026-08-22, 37 applied migrations):

| Class | Applied (fork) | v7.2.0 (upstream) |
|---|---|---|
| `AddReaderAuthToPresentationConfig` | `1773000000000` | `1774000000000` |
| `AddVerifierSkewSeconds` | `1774000000000` | `1772000000000` |

> ⚠ **Corrected 2026-08-22 — this is untidy, not dangerous.** An earlier
> revision of this file called it a startup-blocker. It is not: **every**
> migration involved is defensively written, guarding on
> `table.columns.some((c) => c.name === …)` before adding. Re-running them is a
> no-op. The real effect is duplicate rows in `typeorm_migrations` — noise in
> the audit trail, not a failed boot.

Optional hygiene before the upgrade (after the snapshot), to keep the ledger
honest rather than to avoid a failure:

```sql
UPDATE typeorm_migrations SET timestamp = 1774000000000,
       name = 'AddReaderAuthToPresentationConfig1774000000000'
 WHERE name = 'AddReaderAuthToPresentationConfig1773000000000';

UPDATE typeorm_migrations SET timestamp = 1772000000000,
       name = 'AddVerifierSkewSeconds1772000000000'
 WHERE name = 'AddVerifierSkewSeconds1774000000000';
```

After the upgrade, three upstream migrations run for real:
`AddPresentationStatusCheckMode`, `AddRootExternalKeyIdToKeyChain`,
`AddNotificationEndpointEnabledToIssuanceConfig`.

### Fork migrations after the v7.2.0 rebase

**Rule:** fork migrations are numbered **above upstream's highest** (today
`1775000000000`), with a wide gap.

| Fork migration | Was | Now | Note |
|---|---|---|---|
| `AddClientIdSchemeToPresentationConfig` | `1771000000000` (upstream took it for `AddCwtCacheToStatusList`) | **`1790000000000`** | Idempotent, so the renumber costs nothing: it re-runs once as a no-op and records a second row |
| `AddTrustListConfigToPresentationConfig` | `1775000000000` | **dropped** | No longer needed — see below |

**`trustListConfig` no longer exists as a column.** v7 moved verifier material
into `trusted_authorities` (`TrustListRef`), so the XML settings now ride inside
the existing `dcql_query` JSON instead of a fork-only column. One less schema
divergence from upstream.

Consequence on an upgraded staging database: the applied row
`AddTrustListConfigToPresentationConfig1775000000000` and its
`presentation_config.trustListConfig` column become **orphans**. Harmless — no
entity declares the column and TypeORM never revisits applied migrations. Leave
them; dropping the column would be a destructive migration for no gain.

---

## 4. Rebase procedure

1. Re-read this file; confirm each §2 entry really is in the target tag
   (`git grep` the tag, don't trust the PR title).
2. Rebase `main` onto the upstream tag, dropping §2 and §3 commits.
3. Re-apply §1 against the new APIs — for v7 that means real work, not a
   replay: `clientIdScheme` and the trust-list bridge both touch surfaces v7
   rewrote.
4. Run the AV suite (§1.3) plus the cp-platform smoke path: OAuth2 token →
   offer → verification → webhook → `SessionLog`.
5. Publish the image tagged after its **real** upstream base.
6. Update the *Current state* table above.

## 5. Related tracking

- Upgrade analysis and cp-platform impact: `docs/notes/EUDIPLO_UPGRADE_PLAN.md`
  in the cp-platform repo.
- `@owf/eudi-tl` adoption (retires §1.2's library commits and the two vendored
  copies in cp-platform): gap **REL-011**.
