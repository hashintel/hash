# Milestone 9: Graph requests and client

## What it adds

Two files of stage 3. `stage/send/request.rs` builds the body of a Graph request for one row of the sync table: a create, a patch or an archive, for an entity or a link, each with the provenance of the run. `stage/send/client.rs` sends bodies on the four entity routes of the Graph and reads each answer as one of the three cases of `Answer`: applied, not available, or refused with its status and message. The client does not interpret a refusal; milestone 10 reads a 409 after a create and a 404 after a patch. Send (milestone 10) calls both: it builds the bodies, cuts batches, sends them, falls back to single writes and records the results. None of that is in this milestone.

```text
Send (10) ── SyncRow, provenance ──► [ request.rs ] create, patch, archive ──► Box<RawValue>
          ── actor, bodies ────────► [ client.rs ]  create_bulk  POST  /entities/bulk ──► Answer
                                                    patch_bulk   PATCH /entities/bulk
                                                    create       POST  /entities
                                                    patch        PATCH /entities
```

Against `engine`: a body is built from a `SyncRow` when Send runs, not from a `GraphOperation` at plan time, and it is not stored or read back. The client has the two bulk routes, and it returns what the Graph answered in place of running a create-then-patch upsert. No retry and no rate limit (`../plan.md`, step 3, "Send").

**Decided in:** `../plan.md`, step 2, "Send", and step 3, "Send"; `../background/spikes.md`, "How the Graph answers entity writes".

## Size

|           | Lines   |                                                                                                                             |
| --------- | ------- | --------------------------------------------------------------------------------------------------------------------------- |
| Moved     | 72      | the body types and `endpoint`, `integration_provenance`, the diagnostic limit                                               |
| Adapted   | 240     | `create`, `patch`, `archive` from a row; encoding; `RequestError`; the client's setup, request and error; reading an answer |
| New       | 59      | `Answer`, the four routes, the list body of a bulk request, module declarations                                             |
| **Total** | **371** | **reused 84%**                                                                                                              |

The plan has 450 (90 moved, 240 adapted, 120 new). Moved is 18 lower: the body types with `endpoint` are 55 lines, not 70, and the provenance is 15, not 20. New is 61 lower: `Answer` has three cases, not five, and reading an answer is `engine`'s `accepted` with the cases of labs `classify`, so it counts as adapted, and the bulk routes are four short functions over one shared `request`.

## Interface

`contracts.md`, "Graph requests and client", unchanged. The page writes `pub fn integration_provenance`; it is `pub(super)`, because its one caller is `send/mod.rs`, the parent module of `request.rs`. `GraphClient`, `GraphClient::new` and `GraphError` are public, re-exported from `lib.rs`.

```rust
// request.rs
pub(super) struct RequestError { entity_id: EntityId }   // not on the page; see Open points
// client.rs
pub enum GraphError { Configuration }
pub struct GraphClient { entities: Url, bulk: Url, authorization: HeaderValue, client: Client }
```

Dependencies added by this milestone:

```toml
hash-middleware = { workspace = true }                          # ACTOR_ID_HEADER, SERVICE_AUTH_SCHEME
type-system     = { workspace = true }
reqwest         = { workspace = true }
serde           = { workspace = true, features = ["derive"] }
serde_json      = { workspace = true, features = ["raw_value"] }
tracing         = { workspace = true }
# dev, all for the moved tests: hash-graph-store, axum (http1, tokio), tokio (macros, net, rt), pretty_assertions, rstest, time, uuid
```

## Pseudo code

**`request.rs`: the three bodies** (adapted, about 75 lines with docs; from `engine/graph/plan/request.rs:139-181`, `:203-247`, `:306-319`)

```rust
pub(super) fn create(row: &SyncRow, provenance: &ProvidedEntityEditionProvenance) -> Result<Box<RawValue>, Report<RequestError>> {
    let link_data = match row.op {
        Op::CreateLink | Op::UpdateLink | Op::ArchiveLink => {
            let (Some(left), Some(right)) = (row.left_entity_id, row.right_entity_id) else {
                return Err(Report::new(RequestError { entity_id: row.entity_id }).attach("a link row should name both ends"));
            };
            Some(Link::Directed { source: endpoint(left), target: endpoint(right) })
        }
        Op::CreateEntity | Op::UpdateEntity | Op::ArchiveEntity => None,
    };
    encode(row.entity_id, &CreateEntity {
        web_id: row.entity_id.web_id, entity_uuid: row.entity_id.entity_uuid,
        entity_type_ids: [row.entity_type.clone()], properties: row.properties.clone(),
        link_data, draft: false, provenance: provenance.clone(), read_only: true,
    })
}

pub(super) fn patch(row, provenance) -> Result<Box<RawValue>, Report<RequestError>> {
    // one `add` per property, in base URL order, as `Request::upsert` builds them (`:211-221`)
    let properties = row.properties.value.iter().collect::<BTreeMap<_, _>>().into_iter()
        .map(|(base_url, property)| PropertyPatch::Add { path: [base_url.clone()], property: property.clone() })
        .collect();
    encode(row.entity_id, &PatchEntity { entity_id: row.entity_id, entity_type_ids: [row.entity_type.clone()],
        properties, archived: false, provenance: provenance.clone() })
}

pub(super) fn archive(row, provenance) -> Result<Box<RawValue>, Report<RequestError>> {
    encode(row.entity_id, &ArchiveEntity { entity_id: row.entity_id, archived: true, provenance: provenance.clone() })
}

/// The body as JSON with every object's keys sorted, so the same row always gives the same bytes.
fn encode(entity_id: EntityId, body: &impl Serialize) -> Result<Box<RawValue>, Report<RequestError>> {
    let mut value = serde_json::to_value(body).change_context(RequestError { entity_id })?;
    value.sort_all_objects();
    serde_json::value::to_raw_value(&value).change_context(RequestError { entity_id })
}
```

`create` takes any row, also an update: Send creates an entity that an update did not find. `patch` likewise takes a create that found the entity. `encode` is `Delivery::encode` (`request.rs:47-53`) for one body, with its sorted keys (`:49-53`), so a row gives the same bytes every time, which `payload_property_order` checks. `RequestError` is `UnencodableRequest` (`engine/graph/plan/mod.rs:88-94`) with the page's name, and the `serde_json` error moves from a field into the report.

Moved unchanged: `CreateEntity`, `PatchEntity`, `PropertyPatch`, `ArchiveEntity` (`request.rs:257-304`), `endpoint` (`:249-255`), `integration_provenance` (`engine/graph/mod.rs:160-174`).

**`client.rs`: setup** (adapted, 45 lines; from `engine/graph/client/mod.rs:70-105`). The checks stay. Two things change: `new` also builds the `bulk` URL (`entities` plus the segment `bulk`), and it builds the `Authorization` header once, marked sensitive, which `request` built on every call (`:148-153`). A header that cannot be built is `GraphError::Configuration` at setup, so the routes cannot fail on configuration and return `Answer` alone.

**`client.rs`: the routes and the answer** (routes new, `request` and `answer` adapted from `:142-164`, `:167-180`)

```rust
pub(super) async fn create_bulk(&self, actor, bodies: &[&RawValue]) -> Answer { self.request(Method::POST, &self.bulk, actor, list(bodies)).await }
pub(super) async fn patch_bulk(&self, actor, bodies: &[&RawValue]) -> Answer { self.request(Method::PATCH, &self.bulk, actor, list(bodies)).await }
pub(super) async fn create(&self, actor, body: &RawValue) -> Answer { self.request(Method::POST, &self.entities, actor, body.get().to_owned()).await }
pub(super) async fn patch(&self, actor, body: &RawValue) -> Answer { self.request(Method::PATCH, &self.entities, actor, body.get().to_owned()).await }

async fn request(&self, method: Method, url: &Url, actor: ActorEntityUuid, body: String) -> Answer {
    let sent = self.client.request(method, url.clone())
        .header(AUTHORIZATION, self.authorization.clone()).header(ACTOR_ID_HEADER, actor.to_string())
        .header(CONTENT_TYPE, "application/json").body(body).send().await;
    match sent {
        Ok(response) => answer(response).await,
        Err(error) => { tracing::warn!(error = %error.without_url(), "the Graph did not answer"); Answer::Unavailable }
    }
}

/// From `accepted`, with the "not available" statuses of labs `classify` (`executor.rs:1728-1764`) as `../plan.md`, step 3, fixes them.
async fn answer(response: Response) -> Answer {
    match response.status() {
        status if status.is_success() => Answer::Applied,
        StatusCode::TOO_MANY_REQUESTS | BAD_GATEWAY | SERVICE_UNAVAILABLE | GATEWAY_TIMEOUT => Answer::Unavailable,
        status => Answer::Refused {
            status: status.as_u16(),
            message: response.text().await.unwrap_or_default().chars().take(DIAGNOSTIC_LIMIT).collect(),
        },
    }
}

/// The bodies as one JSON array, which a bulk route reads.
fn list(bodies: &[&RawValue]) -> String;   // "[" + bodies joined by "," + "]"
```

A timeout (30 s, kept from `new`, `:97`) is a request error and so `Unavailable`. A 409, a 404 and a 500 are refusals with their status and message; milestone 10 decides what a 409 or a 404 means for the request it sent.

## Source table

`engine/` is `libs/@local/integrations/engine/src/`. Source lines are measured, result lines estimated.

| New file                                | Item                                                                             | Comes from                                                                  | Kind    | Lines |
| --------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------- | ----- |
| `request.rs`                            | `CreateEntity`, `PatchEntity`, `PropertyPatch`, `ArchiveEntity`                  | `graph/plan/request.rs:257-304` (48)                                        | moved   | 48    |
| `request.rs`                            | `endpoint`                                                                       | `graph/plan/request.rs:249-255` (7)                                         | moved   | 7     |
| `request.rs`                            | `integration_provenance`                                                         | `graph/mod.rs:160-174` (15)                                                 | moved   | 15    |
| `client.rs`                             | `DIAGNOSTIC_LIMIT`                                                               | `graph/client/mod.rs:31-32` (2)                                             | moved   | 2     |
| `request.rs`                            | module doc and imports                                                           | `graph/plan/request.rs:1-28` (28)                                           | adapted | 22    |
| `request.rs`                            | `create`, `patch`, `archive`                                                     | `graph/plan/request.rs:139-181`, `:203-247`, `:306-319` (102)               | adapted | 72    |
| `request.rs`                            | `encode`                                                                         | `graph/plan/request.rs:47-53` (7)                                           | adapted | 8     |
| `request.rs`                            | `RequestError`                                                                   | `graph/plan/mod.rs:88-94` (7)                                               | adapted | 7     |
| `client.rs`                             | module doc and imports                                                           | `graph/client/mod.rs:1-29` (27, without `mod tests`)                        | adapted | 24    |
| `client.rs`                             | `GraphError` with one variant                                                    | `graph/client/mod.rs:34-49` (16)                                            | adapted | 7     |
| `client.rs`                             | `GraphClient`                                                                    | `graph/client/mod.rs:62-68` (7)                                             | adapted | 9     |
| `client.rs`                             | `new`                                                                            | `graph/client/mod.rs:70-105` (36)                                           | adapted | 45    |
| `client.rs`                             | `request`                                                                        | `graph/client/mod.rs:142-164` (23)                                          | adapted | 26    |
| `client.rs`                             | `answer`                                                                         | `graph/client/mod.rs:167-180` (14); labs `graph/executor.rs:1728-1764` (37) | adapted | 20    |
| `client.rs`                             | `Answer`                                                                         | none; the cases of `contracts.md`                                           | new     | 12    |
| `client.rs`                             | `create_bulk`, `patch_bulk`, `create`, `patch`                                   | none; labs `graph/client.rs:191-253` (63) for the bulk route                | new     | 32    |
| `client.rs`                             | `list`                                                                           | none                                                                        | new     | 10    |
| `lib.rs`, `stage/mod.rs`, `send/mod.rs` | `mod send;`, `mod client; mod request;` with the `dead_code` line, the re-export | none                                                                        | new     | 5     |

Moved 72, adapted 240, new 59: 371 lines.

## Tests

The tests become unit tests in `send/request/tests.rs` and `send/client/tests.rs`. Rows are built by hand with fixed entity ids, so the tests need nothing from milestones 7 and 8.

**Request bodies** (from `graph/plan/tests.rs` and `graph/tests.rs`). The fixtures `web_id`, `url`, `properties` and `provenance` move. A helper `row(op, properties)` builds a `SyncRow` for the aircraft `SE-XXX`, with both ends for a link op, about 15 lines.

- `requests_graph_readable` (`plan/tests.rs:148`), adapted. It planned rows through `Planner`, `Definition` and `SinkRow` and read the stored payload. Now it calls `create`, `patch` and `archive` on a row with three properties, and reads each body with `CreateEntityParams` or `PatchEntityParams`. The assertions stay: web id, entity uuid, read-only, three properties; the patch has `archived: Some(false)` and three operations; the archive `Some(true)`. One more line: the create of a link row has `link_data`.
- `payload_property_order` (`:220`), adapted: the bodies of `create` and of `patch` are the same bytes for the properties in two orders. It built `PlannedWrite`s, which are gone.
- `archive_payload` (`:239`), adapted: the expected text is the archive body alone, `{"archived":true,"entityId":"…","provenance":{…}}`, without the delivery's `version`, `kind` and `request` around it.
- `integration_provenance_wire_shape` (`graph/tests.rs:173-190`) with its helper `source` (`graph/tests.rs:31-47`, 17 lines), moved unchanged.

**Client** (from `graph/client/tests.rs`). The test server `Server` and `server` move from `engine/sources/tests.rs:30-62` (33 lines): no milestone ports the sources. The test Graph also serves `{prefix}/entities/bulk`, and the body it answers with becomes a field. The helpers `saved`, `planned` and `upsert` go; a body is built with `create` or `archive` on a row.

- `upsert_creates` (`:172`), adapted as `create_applied`: `create` returns `Applied`, and the server got one `POST /entities` with the body, the actor and the service credential.
- `archive` (`:213`), adapted: `patch` with an archive body returns `Applied` on 200 and `Refused { status: 404, .. }` on 404, one `PATCH /entities`.
- `upsert_rejected` (`:234`), adapted as `refused`: 422 on `create` and 423 on `patch` give `Refused` with the status and the server's text. A third case answers with 2,000 characters and gets 1,024.
- `graph_url_path` (`:259`), adapted: `create` in place of `send`; the path is still `/graph/entities`.
- `configuration` (`:281`), moved unchanged.

**New, three tests:**

1. `answers`: `create` against a server that answers 200 gives `Applied`; 409, 404, 400 and 500 give `Refused` with that status and the server's text; 429, 502, 503 and 504 give `Unavailable`.
2. `unavailable_without_answer`: a client for an address where nothing listens gets `Unavailable`.
3. `bulk_routes`: `create_bulk` and `patch_bulk` with two bodies send `POST` and `PATCH` to `/entities/bulk`, with the two bodies as one JSON array, byte for byte; `Vec<CreateEntityParams>` and `Vec<PatchEntityParams>` read them.

**Left behind:** `unreadable_payload` (`plan/tests.rs:256`, three cases): bodies are not stored and read back. `upsert_patches_existing` (`client/tests.rs:191`): its case, a create that finds the entity and is followed by a patch, is test 3 of `10-send.md`. `finish_duplicate_entity` (`plan/tests.rs:308`): Send no longer refuses a second write to an entity, and `../plan.md`, step 5, leaves it behind. `finish_order` and `operations_sort_into_application_order` go to milestone 10 (`batch.rs`), `plan_aviation` to milestone 8.

## What was stripped

- Stored requests: `DELIVERY_VERSION` (`request.rs:30-31`, 2), `Delivery` without `encode` (`:33-64`, 25), `SavedRequests`, `UnreadablePayload`, `SavedDelivery`, `RequestKind`, `SavedRequest` and `Payload::requests` (`:66-137`, 72), the `Request` enum with its three bodies per upsert (`:183-201`, 19).
- The upsert in the client: `Applied` (`client/mod.rs:51-60`, 10), `send` with create-then-patch and the archive that counts a 404 as done (`:107-140`, 34), and the variants `Payload`, `Request` and `Status` of `GraphError` (inside `:34-49`, 12). The fallback is milestone 10's.
- From labs, not ported: the throttle before each request, `with_429_retry`, reading `Retry-After`, `retry_delay`, the once-per-run warning of a refused batch, the hashed form of a long message (`bounded_diagnostic`), and reading `duplicate key` or `ALREADY_EXISTS` in a body (`../plan.md`, step 5).

About 175 lines of `engine` without tests. `GraphOperation`, `OperationKind` and the upsert types of `graph/mod.rs` are counted in milestone 7, `Payload` and `PlannedWrite` in milestone 8.

## Open points

- **Fact:** a patch for a link is the same as one for an entity. `PatchEntityParams` has no field for the ends (`libs/@local/graph/store/rust/src/entity/store.rs:497-517`), and it denies unknown fields (`:496`). The ends are only in a create, as `linkData` with `leftEntityId` and `rightEntityId` (`libs/@blockprotocol/type-system/rust/src/knowledge/entity/link.rs:8-35`). The archive is the same for both.
- **Fact:** an update with an empty `properties` sends `entityId`, `entityTypeIds`, `archived: false` and `provenance`. `properties` is left out when empty (`request.rs:280-282`), and the Graph reads a missing list as empty (`store.rs:505-506`). So it adds and removes no property, as the contracts page says. It still sets the type and revives an archived entity, and the Graph writes no new edition when nothing changed (`../background/spikes.md`).
- **Fact:** what the bodies need. From a `SyncRow`: `entity_id`, `entity_type`, `properties`, `op` and, for a link, both ends. `run` and `seq` are not used. From `run.json`, through Send: the actor (`Input.actor`, the header) and the provenance's source. Nothing the source needs is missing from `Input`.
- **Chosen:** the source's `loaded_at` is `Input.submitted_at` and its `location.name` is `Input.connector`, as labs sets the load time to the run's submission time and names the location after the connector. `engine`'s aviation test sets `loaded_at: None` (`tests/integrations/graph/aviation/mod.rs:44-56`, from the repository root). Milestone 10 builds the `SourceProvenance` in `send/mod.rs` and passes the result of `integration_provenance` to `create`, `patch` and `archive`.
- **Fact:** `hash-graph-store` is needed as a dev-dependency only. `engine` has it as a dependency (`engine/Cargo.toml:23`) for `sources/secrets/mod.rs:7`, which is not ported. In this crate only `requests_graph_readable` and `bulk_routes` use it.
- **Fact:** the 1,024 characters are applied in the client. In `engine` at `client/mod.rs:179`, with the constant at `:32`, where a refused body is attached to the report. Here in `answer`, when it builds `Refused.message`, for every refusal including 409 and 404, so a failed entity in `run.json` carries at most 1,024 characters. Labs cuts at 1,000 bytes (`executor.rs:43`).
- **Fact:** a bulk route reads a JSON array of the single bodies (`libs/@local/graph/api/src/rest/legacy/entity/mod.rs:348`, `:619`; routes at `:255-259`). The array adds one byte per body plus one to their sum, which milestone 10 counts against its 1.5 MB.
- **Fact:** a patch that races another patch gets 499: the route attaches `Cancelled` for `RaceConditionOnUpdate` (`entity/mod.rs:635-636`), which maps to 499 (`libs/@local/status/rust/src/status_code/http_compat.rs:14`; also `../background/spikes.md`). The route's documentation says 423 (`entity/mod.rs:608`), which differs. A patch body the Graph cannot read gets 422 (`:607`). All are `Refused`.
- **Chosen:** the client keeps the built `Authorization` header, marked sensitive, in place of the secret. The routes then cannot fail on configuration and return `Answer` alone. `engine` already copied the secret into a new header for every request.
- **Chosen:** `GraphError` keeps one variant, `Configuration`, so the moved test `configuration` stays as it is.
- **Chosen:** a request with no answer logs a warning with the error. `Unavailable` carries no reason, and Send stops on it.
- **Chosen:** `create` decides on link data by `op`, and a link row without both ends is a `RequestError`, not a body without `linkData`. Prepare always writes both ends (milestone 8).
- **Chosen:** three new tests. The cut at 1,024 is a case of the adapted `refused`.
- **Settled in `contracts.md`:** `RequestError` names the entity whose body could not be built. Milestone 10 treats it as a permanent failure of Send.
- **Settled in `contracts.md`:** `Answer` has three cases; the client does not interpret a refusal, and milestone 10 reads 409 and 404 for the request it sent.
- **Settled in `contracts.md` and `../plan.md`:** this milestone needs milestones 2 and 4. `request.rs` builds a body from a `SyncRow`, which holds a `RunId`.
