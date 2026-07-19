# Bug Report: Trust List Validation Fails Open When the Trust List Cannot Be Loaded

**Affected component:** `apps/backend/src/verifier/presentations/credential/credential-chain-validation.service.ts`
**Affected flows:** all credential presentation verification that relies on a
LoTE trust list — both mDOC (ISO 18013-5/-7) and SD-JWT-VC (`validateChain` is
the shared, authoritative trust gate).
**Severity:** High (security) — a configured trust-list control is silently
bypassed on load failure, accepting untrusted credentials.

---

## The defect

`getTrustStoreIfConfigured` collapsed **three semantically different outcomes**
into a single `null` return:

1. No trust list configured for the credential (`!trustListSource?.lotes?.length`)
   — a legitimate opt-out (trust validation is opt-in per credential).
2. The configured trust list is **stale** (`NextUpdate` in the past).
3. Loading the configured trust list **failed** (fetch/parse/signature error) —
   caught by a blanket `catch (error) { logger.error(...); return null; }`.

```ts
// getTrustStoreIfConfigured (original)
if (!trustListSource?.lotes?.length) return null;   // case 1: not configured
try {
    const store = await this.trustStore.getTrustStore(trustListSource);
    if (store.nextUpdate && new Date(store.nextUpdate).getTime() < Date.now()) {
        this.logger.warn(...); return null;          // case 2: stale
    }
    return store;
} catch (error) {
    this.logger.error(...); return null;             // case 3: load failed
}
```

`validateChain` then treats `store === null` **identically** to "no trust list
configured", returning success:

```ts
const store = await this.getTrustStoreIfConfigured(trustListSource);
if (!store) {
    // ...
    // "No trust list configured - preserve existing behavior"
    return { verified: true, matchedEntity: null };   // ← FAIL OPEN
}
```

So cases 2 and 3 — where the verifier **did** configure a trust list but it
could not be evaluated — are accepted as if no trust check had been requested.

## Impact

A verifier that configured `trusted_authorities` (a LoTE) precisely to enforce
issuer trust will **silently accept any credential** — including one from an
untrusted or attacker-controlled issuer — whenever:

- the LoTE URL is transiently unreachable (DNS/network blip, upstream outage);
- the LoTE JWT fails to fetch, parse, or verify its signature;
- the LoTE is stale (its `NextUpdate` has passed).

This is a fail-open on a security control. An attacker able to induce a trust
list fetch failure (e.g. degrade/deny the LoTE endpoint, or simply present
during a transient outage) bypasses trust validation entirely. Because
`validateChain` is the shared gate, the bypass applies to both mDOC and
SD-JWT-VC presentations.

The correct behaviour is **fail closed**: if a trust list was requested but
cannot be turned into a usable store, verification must fail.

## Fix applied in EUDIPLO

Distinguish "not configured" from "configured but unavailable":

- `getTrustStoreIfConfigured` now returns `null` **only** for case 1, and throws
  a typed `TrustListUnavailableError` for cases 2 (stale) and 3 (load failure).
- `validateChain` catches `TrustListUnavailableError` and returns
  `{ verified: false, error: "trust_list_unavailable" }` (fail closed). Under an
  **enforced federation policy** it defers to the federation result, since LoTE
  is supplementary there — matching the pre-existing federation fallback.
- The non-authoritative anchor-augmentation helpers
  (`getTrustedCertificateBuffers` / `getTrustedStatusCertificateBuffers`, which
  only feed extra certificates to the mDOC signature check) use a best-effort
  wrapper that swallows the error to `[]`; the authoritative decision remains in
  `validateChain`, which fails closed.
- `mdocverifier` maps `trust_list_unavailable` → `trust_chain_not_trusted`.

Regression tests: `credential-chain-validation.service.spec.ts` asserts
fail-closed on load failure and on a stale list, that the no-trust-list opt-out
still returns `verified: true`, and that the buffer helpers do not throw.

## Reproduction (conceptual)

1. Configure a presentation with a credential carrying `trusted_authorities`
   (a LoTE URL).
2. Make the LoTE unreachable (point it at a dead host, or block it).
3. Present **any** mDOC/SD-JWT-VC credential, including one from an issuer not in
   the LoTE.
4. Before the fix: verification returns `verified: true` (trust bypassed).
   After the fix: verification fails with `trust_list_unavailable`.

## Recommended upstream action

**openwallet-foundation/eudiplo**: adopt the fail-closed distinction. A
configured-but-unavailable (or stale) trust list must never be treated as "no
trust list configured". This is a generic verifier-security fix, independent of
the Age Verification profile.
