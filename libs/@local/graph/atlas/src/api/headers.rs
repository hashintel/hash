//! The routes' `Cache-Control` postures: sent and documented from one constant each.
//!
//! Each handler sends its posture from these constants and each operation documents the same
//! constant through [`cache_control`], so the OpenAPI document and the wire cannot drift apart.

use aide::openapi;

/// The `current` posture: cached copies revalidate on every read.
///
/// The pointer is the API's one mutable read; a stale copy is exactly the failure the route exists
/// to prevent.
pub(super) const REVALIDATE: &str = "private, no-cache";

/// The manifest posture: immutable for the generation's lifetime.
///
/// The generation id in the path names frozen bytes, so the year-long `max-age` never serves a
/// stale document.
pub(super) const IMMUTABLE: &str = "private, max-age=31536000, immutable";

/// The query-response posture: the client's application-layer cache is the cache.
///
/// Binary envelopes and translate maps key on (authorization context, generation, route, canonical
/// body), which shared caches cannot see; `no-store` keeps them out of the way.
pub(super) const NO_STORE: &str = "private, no-store";

/// Documents a response header that always carries `value`.
#[expect(
    clippy::default_trait_access,
    reason = "we do not want to pull in a dependency just to pin it's default"
)]
pub(super) fn cache_control(
    value: &str,
    description: &str,
) -> openapi::ReferenceOr<openapi::Header> {
    openapi::ReferenceOr::Item(openapi::Header {
        description: Some(format!("always `{value}`; {description}")),
        style: openapi::HeaderStyle::Simple,
        required: false,
        deprecated: None,
        format: openapi::ParameterSchemaOrContent::Schema(openapi::SchemaObject {
            json_schema: schemars::json_schema!({"type": "string"}),
            example: None,
            external_docs: None,
        }),
        example: Some(serde_json::Value::String(value.to_owned())),
        examples: Default::default(),
        extensions: Default::default(),
    })
}
