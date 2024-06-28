use core::str::FromStr;
use std::collections::HashMap;

use serde::{Deserialize, Serialize};
#[cfg(target_arch = "wasm32")]
use {tsify::Tsify, wasm_bindgen::prelude::*};

use crate::{
    ontology::raw::Array, raw, url::VersionedUrl, EntityTypeReference, OneOf, ParseLinksError,
    ParseOneOfError,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Links {
    #[cfg_attr(
        target_arch = "wasm32",
        tsify(
            optional,
            type = "Record<VersionedUrl, Array<OneOf<EntityTypeReference>> | {}>"
        )
    )]
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub links: HashMap<String, Array<MaybeOneOfEntityTypeReference>>,
}

impl TryFrom<Links> for super::Links {
    type Error = ParseLinksError;

    fn try_from(links_repr: Links) -> Result<Self, Self::Error> {
        let links = links_repr
            .links
            .into_iter()
            .map(|(url, val)| {
                Ok((
                    VersionedUrl::from_str(&url).map_err(ParseLinksError::InvalidLinkKey)?,
                    val.try_into().map_err(ParseLinksError::InvalidArray)?,
                ))
            })
            .collect::<Result<HashMap<_, _>, Self::Error>>()?;

        Ok(Self::new(links))
    }
}

impl From<super::Links> for Links {
    fn from(object: super::Links) -> Self {
        let links = object
            .0
            .into_iter()
            .map(|(url, val)| (url.to_string(), val.into()))
            .collect();

        Self { links }
    }
}

// This struct is needed because it's used inside generic parameters of other structs like `Array`.
// Those structs can't apply serde's `default` or `skip_serializing_if` which means the option
// doesn't de/serialize as required unless wrapped in an intermediary struct.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
pub struct MaybeOneOfEntityTypeReference {
    #[serde(flatten, default, skip_serializing_if = "Option::is_none")]
    inner: Option<raw::OneOf<raw::EntityTypeReference>>,
}

impl MaybeOneOfEntityTypeReference {
    #[must_use]
    pub fn into_inner(self) -> Option<raw::OneOf<raw::EntityTypeReference>> {
        self.inner
    }
}

impl From<Option<OneOf<EntityTypeReference>>> for MaybeOneOfEntityTypeReference {
    fn from(option: Option<OneOf<EntityTypeReference>>) -> Self {
        Self {
            inner: option.map(core::convert::Into::into),
        }
    }
}

impl TryFrom<MaybeOneOfEntityTypeReference> for Option<OneOf<EntityTypeReference>> {
    type Error = ParseOneOfError;

    fn try_from(value: MaybeOneOfEntityTypeReference) -> Result<Self, Self::Error> {
        value
            .into_inner()
            .map(core::convert::TryInto::try_into)
            .transpose()
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    // TODO - write some tests for validation of Link schemas, although most testing happens on
    //  entity types
    use crate::utils::tests::check_repr_serialization_from_value;

    #[test]
    #[expect(
        clippy::too_many_lines,
        reason = "Test is long because it's merging multiple link constraints"
    )]
    fn merged() {
        let link_type_a = VersionedUrl::from_str(
            "https://example.com/@example-org/types/entity-type/friend-of/v/1",
        )
        .expect("failed to parse VersionedUrl");

        let link_type_b = VersionedUrl::from_str(
            "https://example.com/@example-org/types/entity-type/created-at/v/1",
        )
        .expect("failed to parse VersionedUrl");
        let link_type_b_1_dest = VersionedUrl::from_str(
            "https://example.com/@example-org/types/entity-type/location/v/1",
        )
        .expect("failed to parse VersionedUrl");
        let link_type_b_2_dest =
            VersionedUrl::from_str("https://example.com/@example-org/types/entity-type/city/v/1")
                .expect("failed to parse VersionedUrl");

        let link_type_c = VersionedUrl::from_str(
            "https://example.com/@example-org/types/entity-type/born-in/v/1",
        )
        .expect("failed to parse VersionedUrl");
        let link_type_c_dest = VersionedUrl::from_str(
            "https://example.com/@example-org/types/entity-type/country/v/1",
        )
        .expect("failed to parse VersionedUrl");

        check_repr_serialization_from_value(
            json!({
                "links": {
                    link_type_a.to_string(): {
                        "type": "array",
                        "items": {},
                        "minItems": 2,
                        "maxItems": 10,
                    },
                    link_type_b.to_string(): {
                        "type": "array",
                        "items": {
                            "oneOf": [
                                { "$ref": link_type_b_1_dest.to_string() },
                            ]
                        },
                        "minItems": 15,
                        "maxItems": 10,
                    },
                    link_type_c.to_string(): {
                        "type": "array",
                        "items": {
                            "oneOf": [
                                { "$ref": link_type_c_dest.to_string() },
                            ]
                        },
                        "minItems": 1,
                        "maxItems": 2,
                    },
                }
            }),
            Some(Links::from(
                [
                    json!({
                        "links": {
                            link_type_a.to_string(): {
                                "type": "array",
                                "items": {},
                                "maxItems": 10,
                            },
                            link_type_b.to_string(): {
                                "type": "array",
                                "items": {
                                    "oneOf": [
                                        { "$ref": link_type_b_1_dest.to_string() },
                                        { "$ref": link_type_b_2_dest.to_string() },
                                    ]
                                },
                                "minItems": 2,
                                "maxItems": 10,
                            },
                            link_type_c.to_string(): {
                                "type": "array",
                                "items": {
                                    "oneOf": [
                                        { "$ref": link_type_c_dest.to_string() },
                                    ]
                                },
                            },
                        }
                    }),
                    json!({
                        "links": {
                            link_type_a.to_string(): {
                                "type": "array",
                                "items": {},
                                "minItems": 2,
                            },
                            link_type_b.to_string(): {
                                "type": "array",
                                "items": {
                                    "oneOf": [
                                        { "$ref": link_type_b_1_dest.to_string() },
                                    ]
                                },
                                "minItems": 15,
                            },
                            link_type_c.to_string(): {
                                "type": "array",
                                "items": {},
                                "minItems": 1,
                                "maxItems": 2,
                            },
                        }
                    }),
                ]
                .into_iter()
                .map(|json| {
                    crate::Links::try_from(
                        serde_json::from_value::<Links>(json).expect("failed to deserialize links"),
                    )
                    .expect("failed to convert links")
                })
                .collect::<crate::Links>(),
            )),
        );
    }
}
