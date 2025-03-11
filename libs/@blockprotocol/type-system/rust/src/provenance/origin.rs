use std::collections::HashSet;

#[cfg(feature = "utoipa")]
use utoipa::{
    ToSchema,
    openapi::{ObjectBuilder, OneOfBuilder, RefOr, Schema, SchemaType},
};

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(
    deny_unknown_fields,
    tag = "type",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum OriginType {
    WebApp,
    MobileApp,
    BrowserExtension,
    Api,
    Flow {
        #[serde(default, skip_serializing_if = "HashSet::is_empty")]
        step_ids: HashSet<String>,
    },
    Migration,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OriginProvenance {
    #[serde(flatten)]
    pub ty: OriginType,
    /// A unique identifier for the origin, if one is available
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    /// The origin version, in whatever format the origin natively provides.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    /// The origin version in the format specified by Semantic Versioning 2.0.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub semantic_version: Option<semver::Version>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub environment: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub device_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_key_public_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user_agent: Option<String>,
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
