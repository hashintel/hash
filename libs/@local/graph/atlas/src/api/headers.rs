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

/// The authority token header.
///
/// The manifest response mints it, and data requests present it back.
///
/// The canonical spelling is `Atlas-Authority`; the constant is lowercase because static header
/// names are, and header matching is case-insensitive either way.
pub(super) const AUTHORITY: &str = "atlas-authority";

/// The same header in its canonical spelling, for the documents that name it.
///
/// People and generators that echo them verbatim read the OpenAPI parameter and header keys,
/// so the document carries the canonical form while the wire carries [`AUTHORITY`].
pub(super) const AUTHORITY_DOCUMENTED: &str = "Atlas-Authority";

/// The query-response posture.
///
/// The client's application-layer cache is the cache. Binary envelopes and translate maps key on
/// (authorization context, generation, route, canonical body), which shared caches cannot see.
/// `no-store` keeps them out of the way.
pub(super) const NO_STORE: &str = "private, no-store";

/// Whether a documented parameter is mandatory.
///
/// Named rather than boolean because the two readings of one header are the whole distinction
/// between the routes that carry it, and a call site reads that distinction here.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum Required {
    /// The route answers nothing without the parameter.
    Yes,
    /// The route answers without the parameter.
    No,
}

impl From<Required> for bool {
    fn from(required: Required) -> Self {
        matches!(required, Required::Yes)
    }
}

/// Documents the presented authority token's request header.
///
/// `required` separates the two readings. A data route answers nothing without a token, while the
/// manifest accepts a request that presents none and bootstraps it. The schema pins the alphabet
/// and not the width, and names no sealed field - the token is opaque to every caller.
#[expect(
    clippy::default_trait_access,
    reason = "we do not want to pull in a dependency just to pin its default"
)]
pub(super) fn presented_authority(required: Required) -> openapi::Parameter {
    let mandatory = bool::from(required);
    let description = if mandatory {
        "the authority token this route requires, as minted into the manifest response's \
         `Atlas-Authority` header; replay the value verbatim"
    } else {
        "the authority token held for this generation, replayed verbatim. Presenting none \
         bootstraps a view; presenting an expired one renews it"
    };

    openapi::Parameter::Header {
        parameter_data: openapi::ParameterData {
            name: AUTHORITY_DOCUMENTED.to_owned(),
            description: Some(description.to_owned()),
            required: mandatory,
            deprecated: None,
            format: openapi::ParameterSchemaOrContent::Schema(openapi::SchemaObject {
                json_schema: schemars::json_schema!({"type": "string", "pattern": "^[0-9a-f]+$"}),
                example: None,
                external_docs: None,
            }),
            example: None,
            examples: Default::default(),
            explode: None,
            extensions: Default::default(),
        },
        style: openapi::HeaderStyle::Simple,
    }
}

/// Documents the minted authority token's response header.
///
/// The pattern fixes the alphabet and not the width: the width follows from the envelope's
/// construction, and no client may depend on it.
#[expect(
    clippy::default_trait_access,
    reason = "we do not want to pull in a dependency just to pin its default"
)]
pub(super) fn authority() -> openapi::ReferenceOr<openapi::Header> {
    openapi::ReferenceOr::Item(openapi::Header {
        description: Some(
            "a freshly minted per-caller authority token, lowercase hexadecimal; present it back \
             in this same header on every data request"
                .to_owned(),
        ),
        style: openapi::HeaderStyle::Simple,
        required: true,
        deprecated: None,
        format: openapi::ParameterSchemaOrContent::Schema(openapi::SchemaObject {
            json_schema: schemars::json_schema!({"type": "string", "pattern": "^[0-9a-f]+$"}),
            example: None,
            external_docs: None,
        }),
        example: None,
        examples: Default::default(),
        extensions: Default::default(),
    })
}

/// Documents a response header that always carries `value`.
#[expect(
    clippy::default_trait_access,
    reason = "we do not want to pull in a dependency just to pin its default"
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
