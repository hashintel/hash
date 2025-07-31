## 🌟 What is the purpose of this PR?

Fix high cardinality metrics in HTTP tracing by using route templates instead of actual paths, and ensure all OpenTelemetry semantic attributes are visible in observability tools like Grafana.

## 🔗 Related links

- OpenTelemetry HTTP semantic conventions: https://opentelemetry.io/docs/specs/semconv/http/
- Axum MatchedPath documentation: https://docs.rs/axum/latest/axum/extract/struct.MatchedPath.html

## 🚫 Blocked by

- [x] Not blocked

## 🔍 What does this change?

- **Fix high cardinality metrics**: Use `MatchedPath` to get route templates (e.g., `/entities/{id}`) instead of actual paths (e.g., `/entities/1a2b3d4f-...`)
- **Make all HTTP attributes visible**: Pre-declare all OpenTelemetry semantic attributes as `Empty` in the span macro so they appear in Grafana
- **Maintain backward compatibility**: Fallback to actual URI path for unmatched requests (404s)

### Technical Details

- Modified `libs/@local/graph/api/src/rest/http_tracing_layer.rs`
- Added `MatchedPath` import from `axum::extract`
- Updated `create_http_span()` to use route templates when available
- Pre-declared all HTTP semantic attributes in the `tracing::info_span!` macro:
  - `trace::URL_SCHEME`
  - `trace::USER_AGENT_ORIGINAL`
  - `trace::SERVER_ADDRESS`
  - `trace::HTTP_REQUEST_BODY_SIZE`
  - `trace::NETWORK_PEER_ADDRESS`
  - `trace::NETWORK_PEER_PORT`
  - `trace::HTTP_RESPONSE_BODY_SIZE`

## Pre-Merge Checklist 🚀

### 🚢 Has this modified a publishable library?

This PR:

- [x] does not modify any publishable blocks or libraries, or modifications do not need publishing

### 📜 Does this require a change to the docs?

The changes in this PR:

- [x] are internal and do not require a docs change

### 🕸️ Does this require a change to the Turbo Graph?

The changes in this PR:

- [x] do not affect the execution graph

## ⚠️ Known issues

None. The change maintains full backward compatibility.

## 🐾 Next steps

- Monitor metrics cardinality reduction in production
- Consider applying similar pattern to other HTTP tracing layers in the codebase

## 🛡 What tests cover this?

- Existing HTTP tracing tests continue to pass
- Manual testing shows all attributes are now visible in observability tools

## 📹 Demo

**Before**: High cardinality metrics with actual path values

```
otel.name: "GET /actor_groups/webs/1a2b3d4f-5e6f-7a8b-9c0d-e1f2a3b4c5d6"
otel.name: "GET /actor_groups/webs/9f8e7d6c-5b4a-3928-1716-0504a3b2c1d0"
```

**After**: Low cardinality metrics with route templates + all attributes

```
otel.name: "GET /actor_groups/webs/:web_id"
http.request.body.size: "1053"
http.request.method: "POST"
http.response.body.size: "1396"
http.response.status_code: "200"
network.peer.address: "127.0.0.1"
network.peer.port: 56548
server.address: "127.0.0.1:4000"
user_agent.original: "httpyac"
```
