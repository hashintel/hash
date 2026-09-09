# R2 outcome — authentication blocked, unresolved accounting held

## Observed result

The one authorized r2 invocation reached the real Anthropic endpoint and received **HTTP401** after205ms:

```json
{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"},"request_id":"req_011CesJFAm63EBk1iSmJT6xd"}
```

Exactly one native request artifact exists. It requests `claude-sonnet-4-6`, `max_tokens:4096`, and the nine initial tools, under the accepted final manifest `1c71ed054d89a7a0183df5b8877faba042982638a58c6696151fc119df439586`. No model identity, tool calls or terminal usage were returned by the provider. Authentication failure does not establish provider schema acceptance/rejection, model availability, construction or why behavior. The pre-authored user scenario did not advance beyond preparation.

The driver stopped provider dispatch (`stopped:true`) and did not retry. Its visible-readiness wait later timed out because the failed preparation could not reach the ready state; that later timeout is not a second request or a different root cause. The driver exited1. The lifecycle report records failure with successful resource cleanup.

Separately, the parent-owned coding worker failed with **“Our servers are currently overloaded. Please try again later.”** That harness failure is recorded in `worker-failure.json`; it is not the native product response and must not be relabelled as Anthropic overload/HTTP529. Parent resumed no worker/model invocation and audited the existing run directly.

## Accounting and authority

The real shared ledger has **six counted attempts: five previously complete and one unresolved r2 request**. Previously confirmed catalogue spend remains **US$0.09113535**. Sequence6 is **unknown**, `journalPending:false`, with **US$7 outstanding** and no `actualUsd`. Pi's normalized error usage is all zero; that is not authoritative evidence of zero charge and was not used to release the hold.

After independently verifying the run processes and writer lock were gone, the parent recovered coordination and changed only allocation metadata to **blocked**. The unknown call row and US$7 hold remain intact. No release, zero-cost guess, new allocation, resubmission, key-validity API probe or alternate model is authorized. Future provider work needs corrected credential configuration and an explicit accounting/authorization disposition; correcting a credential alone does not authorize retrying this run.

A parent-only offline check of the current default local resolver returned available=true and knownTestCredential=false. It retained no credential value, length, hash or auth source, made no provider request, and is not proof of which historical secret was used or its validity. The actual service rejection remains the credential boundary evidence; no unrelated credential stores were searched or changed.

## Independent post-run audit

- All **3,916** frozen file pins and fresh enumeration remain unchanged after the run.
- Known launcher46229, owner46232, driver46289 and Chrome46278 were independently checked absent.
- The isolated profile is absent; the owner reports public close complete, no kill fallback needed, `cleanupComplete:true`, readiness removed and endpoint ECONNREFUSED. Binding was removed.
- The actual ledger writer lock is absent. The parent did not modify ledger/journal while an active writer existed.
- The native request/response, private driver stderr, lifecycle and actual accounting snapshots are retained. A bounded credential-pattern scan found no matches; this is not a comprehensive secret certification. No request headers or environment dump were captured.

The actual store remains at `/Users/lunelson/.herdr/worktrees/hash/m7-provider-execution/libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/a5-real-provider-20260909-r2/conversation.db`. Original raw output remains untouched in that worker directory, which contains the untracked failed-run evidence. Parent archives below are lossless diagnostic copies, not a restoration/import API. The failed worker did not produce a clean committed result packet; this parent packet preserves the result without rewriting its original data.

## Retention and next boundary

`artifact-manifest.json` binds 21 exact raw run/postmortem copies to source paths/bytes/hashes. `run/native-6-response.sse.gz` is the actual provider error; `run/native-6-request.json.gz` retains the exact request body. `parent/post-run-audit.json.gz` records the independent checks, and `parent/post-run-pins.json.gz` verifies the frozen instrument. The approved controller/browser/TLS gates remain separate prior successes, not model/tool-use proof.

**Provider lane blocked on credentials and unresolved accounting.** Ask the owner to correct the configured Anthropic credential through the existing secure environment/configuration, not by pasting a key into chat. Do not silently search for another key or change provider. The independent typed-state/construction lane continues. No genuine Vestera, useful field coverage, Step A acceptance, Step B or push is claimed.
