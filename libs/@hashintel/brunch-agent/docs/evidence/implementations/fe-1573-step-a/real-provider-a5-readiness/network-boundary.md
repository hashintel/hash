# Network boundary observations before activation

All actual installation/build/application/dry probes used the existing native-local-delivery deny-network or loopback-only parent profile. `network-guard-final.log.gz` retains the Java/Node descendant IP-denial and loopback controls. No paid egress was opened during preparation.

## Rejected numeric destination policy

The initial candidate used this additional rule with `PROVIDER_DESTINATION=127.0.0.1:443`:

```scheme
(allow network-outbound (remote ip (param "PROVIDER_DESTINATION")))
```

Inside the existing loopback-only parent, `sandbox-exec` refused before launching the Node probe:

```text
sandbox-exec: host must be * or localhost in network address
```

This is evidence against claiming a numeric-IP/hostname OS filter on this host. No DNS resolution or provider request was made. The invalid draft was replaced before implementation freeze by the documented port-only candidate, not silently presented as working.

## Broader-profile refusal under the unpaid parent

The frozen `paid-provider.sb` uses `(allow network-outbound (remote tcp "*:443"))`, with loopback and required Chrome filesystem IPC. Attempting to apply it underneath the existing loopback-only policy used:

```sh
sandbox-exec -f libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/native-local-delivery/loopback-only.sb sandbox-exec -f apps/brunch-agent/src/evaluations/real-provider-a5/paid-provider.sb node --experimental-strip-types --input-type=module -e 'import {assertExternalDenied} from "./apps/brunch-agent/src/evaluations/real-provider-a5/network-guard.ts"; await assertExternalDenied(); console.log("Layered TCP443 profile compiles; denied-port control passes inside outer loopback-only guard. No provider egress opened.")'
```

Observed (the proposed success line was **not reached**):

```text
sandbox-exec: sandbox_apply: Operation not permitted
```

No unguarded retry occurred. Standalone paid-profile application, provider-IP reachability and TLS identity remain activation-time checks, not unpaid passes. The integration owner must accept the concrete layered egress policy or choose another enforceable arrangement before the first paid request.

## Frozen layers and limits

- OS candidate: deny networking except loopback/required Chrome IPC and outbound TCP 443. This is **not** a hostname/IP filter. No install/build/codegen is run under it.
- Native request boundary: exact `https://api.anthropic.com/v1/messages`, POST, exact selected model/output cap, a pre-persisted accounted request, one dispatch, explicit owner-approved numeric address supplied directly to `https.request` lookup, TLS verification and SNI `api.anthropic.com`, no proxy/DNS/redirect/retry. Synthetic transport controls assert the actual `https.request` options and preserve unchanged response bytes. No test claims that mocked TLS options alone prove an actual remote peer.
- Browser: fixed wrapper starts isolated Chrome under the existing **narrower loopback-only** OS profile; provider environment is not passed; HTTP requests are additionally restricted to the one listener origin, service workers blocked, WebSockets closed. This wrapper is exercised by the final actual-Chrome dry run with zero blocked-origin or browser errors.
- Driver preflight: an actual non-loopback TCP-80 attempt must produce `EPERM`; timeout/refusal/reachability is not accepted as proof of OS policy. This negative control cannot establish destination filtering on permitted TCP443.
- Credentials: only existing configured auth resolution's availability boolean is recorded. No key validity probe, secret/request-header/SDK-options capture or browser injection.

The remaining policy choice is explicit rather than disguised as stronger enforcement. Parent activation must record the exact `os-tcp443+pinned-native-tls+loopback-browser-v1` decision, the pinned numeric address and exclusive shared-ledger writer delegation. Native reported model identity is separately checked because the SDK's normalized model field uses the requested ID.
