# Verification Errors

When an mDOC (ISO/IEC 18013-5) presentation fails verification, EUDIPLO
returns a **structured error**: a stable, machine-readable code plus a short,
user-facing message. The verbose diagnostic detail (certificate subjects,
thumbprints, configured trust-list URLs) is never returned to the caller — it
is kept in the server logs and the audit trail only.

This applies to the ISO 18013-7 Annex C flow over the Digital Credentials API
and is **format-agnostic**: the same codes and messages are produced whether
the trust list is a LoTE (ETSI TS 119 602, JSON) or a Trusted List
(ETSI TS 119 612, XML). The trust-list format only matters at the load
boundary; every downstream decision operates on the normalized trust store.

## Response shape

Verification failures are returned as HTTP `400 Bad Request` with the
following body:

```json
{
    "statusCode": 400,
    "timestamp": "2026-07-20T12:34:56.000Z",
    "path": "/...",
    "error": "trust_chain_not_trusted",
    "message": "The credential issuer is not in the trusted list."
}
```

- `error` — the machine-readable failure code. Relying parties should branch
    on this value rather than parsing the message.
- `message` — a short, safe string suitable for display in a UI.

The same short message is stored in the session's `errorReason`, and the
session status is set to `failed`.

## Error codes

| `error` | `message` | When it is returned |
| --- | --- | --- |
| `signature_invalid` | The credential signature is invalid. | The issuer (`IssuerAuth`) or device (`deviceAuth`) COSE signature does not validate — a tampered credential, wrong session transcript, or key mismatch. |
| `no_trust_chain_to_root` | The credential issuer does not chain to a trusted root. | No X.509 path can be built from the presented leaf certificate up to a configured trust anchor. |
| `trust_chain_not_trusted` | The credential issuer is not in the trusted list. | A chain is built, but no certificate in it matches an entity in the configured trust list (for example, an issuer from an acceptance environment presented against a production list). |
| `trust_list_unavailable` | The trusted list could not be loaded, so the credential could not be validated. | A configured trust list could not be fetched, parsed, or signature-verified, or it is stale (`NextUpdate` in the past). EUDIPLO **fails closed** — it never accepts a credential when a requested trust list cannot be evaluated. |
| `certificate_expired` | The credential issuer certificate is expired or not yet valid. | A certificate in the chain is outside its `notBefore`/`notAfter` validity window. |
| `x5c_missing` | The credential is missing its issuer certificate chain. | The policy requires an `x5c` chain but the credential does not include one in its `IssuerAuth`. |
| `verification_error` | The credential could not be verified. | Generic fallback for any other cause not classified above (including malformed `x5c`, federation-trust failures, and unexpected errors). |

## Notes

- The HTTP status is always `400`; only `error` and `message` vary.
- `trust_list_unavailable` is a **verifier-side** condition (misconfiguration
    or outage), not a problem with the presented credential. It is
    distinguished from `trust_chain_not_trusted` so operators can tell the two
    apart.
- Detailed diagnostics for every failure are written via the audit log with
    the failure `error` code attached, so an operator can correlate a
    user-facing failure with the full reason without exposing it externally.

See also: [Trust Framework](trust-framework.md),
[Status Management](status-management.md).
