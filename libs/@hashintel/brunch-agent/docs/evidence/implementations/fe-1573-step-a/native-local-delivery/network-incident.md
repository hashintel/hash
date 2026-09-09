# External-download policy failure and guarded re-entry

> Historical result; raw contract-establishment payloads were retired in the [bounded reduction](../landing-20260909/evidence-reduction.md). Original commands, manifests and payload links below describe the recorded run, not a maintained replay or a claim that those bytes remain local.

## Retained failed-policy attempt

The initial forced application build violated the no-external-request constraint. Its exact command was:

```sh
YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 CARGO_NET_OFFLINE=true yarn exec turbo run build lint:tsc --filter=@apps/brunch-agent --concurrency=1 --force > /tmp/m7-native-app-build.log 2>&1
```

`unguarded-app-build.log.gz` preserves that complete log losslessly. The transitive `@local/hash-graph-client:codegen` task logged `Download 6.6.0 ...` and `Downloaded 6.6.0`, then ran the generated local Java artifact. `generator-artifact.json` records the resulting OpenAPI Generator JAR's version, exact bytes and SHA-256. The inspected installed `@openapitools/openapi-generator-cli` downloader performs `httpService.get(..., { responseType: "stream" })` on this path; its configured default repository is Maven Central. This is an observed download, not an offline cache hit. There is no retained request/packet telemetry establishing precise request count, final URL, redirects or proxy behavior. No credentials or environment-value dumps were printed.

The command failed its application typecheck on a new test-helper undefined guard. More importantly, the build could not be described as zero-external-request even if its tasks had passed. Execution stopped and the owning parent was asked. The parent authorized retaining the attempt and continuing under stronger enforcement of the same constraint, not an external-access exception. No application/provider paid calls, ledger changes or accounting claims resulted. The campaign cannot claim zero external requests.

## Process-tree enforcement before re-entry

The checked-in macOS Seatbelt profiles run commands through `/usr/bin/sandbox-exec`. `deny-network.sb` denies all IP network operations for builds and descendants. It permits only the filesystem Unix-domain `tsx-<uid>/<pid>.pipe` IPC pattern required by existing codegen. `loopback-only.sb` denies IP network operations except localhost bind/inbound/outbound for the explicitly admitted browser witness, plus Chrome's temporary filesystem `SingletonSocket` IPC. These narrow pathname rules cannot match an IP endpoint. They do not stub or skip codegen or weaken its output assertions. Existing Yarn/Corepack/Cargo offline settings remain additional controls, not the enforcement boundary.

`verify-network-guard.mjs` starts only a local test listener, launches a sandboxed shell, then exercises Java and Node descendants. Both must receive **EPERM**, not timeout or connection refusal, when opening the documentation-only external address `192.0.2.1`. Under total denial the loopback attempt must also be EPERM; under the loopback profile it must reach the local listener. `guard-final.log.gz` records all final profiles passing. This verifies inherited kernel enforcement across the Java runtime that the environment-only approach missed, and across Node. No external connection succeeded in these guard diagnostics.

Failed-closed setup attempts are retained separately. The initial IP-literal sandbox profile was rejected at parse time (macOS requires `localhost` in this filter). The next profile refused Java's default IPv6-mapped loopback connection. The final Java diagnostic explicitly selects the IPv4 stack to test the same `127.0.0.1` route as the browser witness; the more restrictive default-Java refusal is not erased or described as success. No Java loopback requirement is introduced in builds, which deny all IP network. The first guarded full portfolio also exposed blocked `tsx` IPC, and the first browser launch exposed blocked Chrome singleton IPC; both failures and the narrowly amended profiles are retained. Final denial diagnostics were rerun after those changes.

`commit-network.sb` keeps IP denial while allowing only those local `tsx` pipes and the existing local SSH signing-agent socket (literal path plus its resolved symlink target, supplied as parameters without printing their values). Signing initially failed closed because the ordinary build guard prohibited that IPC; signed commits were retried under this profile, not unguarded or with signing disabled. Its Java/Node external and loopback denial also pass the final diagnostic using non-secret dummy socket-path parameters.

The guard is an operating-system process sandbox, not an exhaustive security audit against privileged service delegation. Its inherited direct-socket denial is demonstrated, not inferred from an environment flag. The actual browser additionally blocks non-origin requests and uses a loopback-only listener. Any required task or browser operation blocked by the guard must fail visibly; it is not permission to rerun unguarded, download another artifact, stub codegen or weaken an oracle.

## Guarded command shape

The reusable five-file guard now lives byte-identically in `evaluations/protocols/network-guard/` under the Brunch context. Historical logs and manifests above retain their original identities.

```sh
E=libs/@hashintel/brunch-agent/evaluations/protocols/network-guard
sandbox-exec -f "$E/deny-network.sb" env YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 CARGO_NET_OFFLINE=true yarn exec turbo run build test:unit lint:tsc lint:eslint --filter=@hashintel/brunch-agent --filter=@hashintel/brunch-agent-plugin-sdcpn --filter=@hashintel/brunch-agent-binding-flue --filter=@hashintel/brunch-agent-transport-aisdk --filter=@apps/brunch-agent --filter=@apps/petrinaut-website --filter=@hashintel/petrinaut --continue=always --force --concurrency=1
```

Guarded retries and the new native/browser witnesses are separate evidence; none retroactively changes the failed-policy attempt above.
