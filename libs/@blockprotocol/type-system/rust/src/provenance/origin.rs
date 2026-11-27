use alloc::collections::BTreeSet;

#[cfg(feature = "utoipa")]
use utoipa::{
    ToSchema,
    openapi::{ObjectBuilder, OneOfBuilder, RefOr, Schema, SchemaType},
};

use crate::provenance::validation::MAX_SHORT_TEXT_LENGTH;

/// How an edition reached HASH. The public API writes `external`.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[cfg_attr(feature = "schemars", derive(schemars::JsonSchema))]
#[serde(deny_unknown_fields, tag = "type", rename_all = "kebab-case")]
pub enum OriginType {
    WebApp,
    MobileApp,
    BrowserExtension,
    Api,
    Flow {
        /// The IDs of the flow steps that wrote the edition.
        #[cfg_attr(
            feature = "schemars",
            schemars(
                length(max = crate::provenance::validation::MAX_STEP_IDS),
                inner(length(max = crate::provenance::validation::MAX_SHORT_TEXT_LENGTH))
            )
        )]
        #[serde(default, skip_serializing_if = "BTreeSet::is_empty")]
        #[serde(rename = "stepIds")]
        step_ids: BTreeSet<String>,
    },
    Migration,
    External,
}

/// The user agent of a client, cut to at most [`UserAgent::MAX_LENGTH`] characters.
///
/// Serializes as a string. A longer string is cut when it is read.
#[derive(Debug, Clone, PartialEq, Eq, Hash, serde::Serialize)]
#[serde(transparent)]
pub struct UserAgent(String);

impl UserAgent {
    /// The most characters a user agent keeps.
    pub const MAX_LENGTH: usize = MAX_SHORT_TEXT_LENGTH;

    #[must_use]
    pub fn new(user_agent: impl Into<String>) -> Self {
        let mut user_agent = user_agent.into();
        if let Some((end, _)) = user_agent.char_indices().nth(Self::MAX_LENGTH) {
            user_agent.truncate(end);
        }
        Self(user_agent)
    }

    #[must_use]
    pub const fn as_str(&self) -> &str {
        self.0.as_str()
    }
}

impl<'de> serde::Deserialize<'de> for UserAgent {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        String::deserialize(deserializer).map(Self::new)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OriginProvenance {
    #[serde(flatten)]
    pub ty: OriginType,
    /// A unique identifier for the origin, if one is available.
    #[serde(
        default,
        deserialize_with = "hash_codec::serde::non_null",
        skip_serializing_if = "Option::is_none"
    )]
    pub id: Option<String>,
    /// The origin version, in whatever format the origin natively provides.
    #[serde(
        default,
        deserialize_with = "hash_codec::serde::non_null",
        skip_serializing_if = "Option::is_none"
    )]
    pub version: Option<String>,
    /// The origin version in the format specified by Semantic Versioning 2.0.
    #[serde(
        default,
        deserialize_with = "hash_codec::serde::non_null",
        skip_serializing_if = "Option::is_none"
    )]
    pub semantic_version: Option<semver::Version>,
    #[serde(
        default,
        deserialize_with = "hash_codec::serde::non_null",
        skip_serializing_if = "Option::is_none"
    )]
    pub environment: Option<String>,
    #[serde(
        default,
        deserialize_with = "hash_codec::serde::non_null",
        skip_serializing_if = "Option::is_none"
    )]
    pub device_id: Option<String>,
    #[serde(
        default,
        deserialize_with = "hash_codec::serde::non_null",
        skip_serializing_if = "Option::is_none"
    )]
    pub session_id: Option<String>,
    #[serde(
        default,
        deserialize_with = "hash_codec::serde::non_null",
        skip_serializing_if = "Option::is_none"
    )]
    pub api_key_public_id: Option<String>,
    #[serde(
        default,
        deserialize_with = "hash_codec::serde::non_null",
        skip_serializing_if = "Option::is_none"
    )]
    pub user_agent: Option<UserAgent>,
}

impl OriginProvenance {
    #[must_use]
    pub const fn from_empty_type(ty: OriginType) -> Self {
        Self {
            ty,
            id: None,
            version: None,
            semantic_version: None,
            environment: None,
            device_id: None,
            session_id: None,
            api_key_public_id: None,
            user_agent: None,
        }
    }
}

#[cfg(target_arch = "wasm32")]
#[expect(dead_code, reason = "Used in the generated TypeScript types")]
mod patch {
    use super::*;

    #[derive(tsify::Tsify)]
    #[serde(untagged)]
    pub enum OriginProvenance {
        #[serde(rename_all = "camelCase")]
        Impl {
            #[serde(flatten)]
            ty: OriginType,
            #[serde(skip_serializing_if = "Option::is_none")]
            id: Option<String>,
            #[serde(skip_serializing_if = "Option::is_none")]
            version: Option<String>,
            #[cfg_attr(
                target_arch = "wasm32",
                tsify(type = "Brand<string, \"SemanticVersion\">")
            )]
            #[serde(skip_serializing_if = "Option::is_none")]
            semantic_version: Option<semver::Version>,
            #[serde(skip_serializing_if = "Option::is_none")]
            environment: Option<String>,
            #[serde(skip_serializing_if = "Option::is_none")]
            device_id: Option<String>,
            #[serde(skip_serializing_if = "Option::is_none")]
            session_id: Option<String>,
            #[serde(skip_serializing_if = "Option::is_none")]
            api_key_public_id: Option<String>,
            #[serde(skip_serializing_if = "Option::is_none")]
            user_agent: Option<String>,
        },
    }
}

#[cfg(feature = "utoipa")]
impl<'__s> ToSchema<'__s> for OriginProvenance {
    fn schema() -> (&'__s str, RefOr<Schema>) {
        let common_types: [(&'static str, RefOr<Schema>); 8] = [
            (
                "id",
                RefOr::T(Schema::from(
                    ObjectBuilder::new().schema_type(SchemaType::String),
                )),
            ),
            (
                "version",
                RefOr::T(Schema::from(
                    ObjectBuilder::new()
                        .schema_type(SchemaType::String)
                        .description(Some(
                            "The origin version, in whatever format the origin natively
provides.",
                        )),
                )),
            ),
            (
                "semanticVersion",
                RefOr::T(Schema::from(
                    ObjectBuilder::new().schema_type(SchemaType::String),
                )),
            ),
            (
                "environment",
                RefOr::T(Schema::from(
                    ObjectBuilder::new().schema_type(SchemaType::String),
                )),
            ),
            (
                "deviceId",
                RefOr::T(Schema::from(
                    ObjectBuilder::new().schema_type(SchemaType::String),
                )),
            ),
            (
                "sessionId",
                RefOr::T(Schema::from(
                    ObjectBuilder::new().schema_type(SchemaType::String),
                )),
            ),
            (
                "apiKeyPublicId",
                RefOr::T(Schema::from(
                    ObjectBuilder::new().schema_type(SchemaType::String),
                )),
            ),
            (
                "userAgent",
                RefOr::T(Schema::from(
                    ObjectBuilder::new().schema_type(SchemaType::String),
                )),
            ),
        ];

        let mut builder = OneOfBuilder::new();
        for ty in [
            "web-app",
            "mobile-app",
            "browser-extension",
            "api",
            "flow",
            "migration",
            "external",
        ] {
            let mut item_builder = ObjectBuilder::new();
            item_builder = item_builder
                .property(
                    "type",
                    ObjectBuilder::new()
                        .schema_type(SchemaType::String)
                        .enum_values(Some([ty])),
                )
                .required("type");
            for (key, schema) in &common_types {
                item_builder = item_builder.property(*key, schema.clone());
            }

            if ty == "flow" {
                item_builder = item_builder.property(
                    "stepIds",
                    ObjectBuilder::new()
                        .schema_type(SchemaType::String)
                        .to_array_builder(),
                );
            }

            builder = builder.item(item_builder);
        }

        ("OriginProvenance", RefOr::T(Schema::from(builder)))
    }
}
