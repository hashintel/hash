//! The definition format as serde types.
//!
//! Every scalar that lowering checks keeps its source location in a [`Spanned`]. The types
//! reject unknown fields, and the YAML parser rejects duplicate keys.

mod lower;
mod spanned_map;

use alloc::{boxed::Box, string::String, vec::Vec};
use core::fmt;

use serde::{
    Deserialize,
    de::{Deserializer, MapAccess, Visitor, value::MapAccessDeserializer},
};
use serde_saphyr::Spanned;

use self::spanned_map::SpannedMap;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct UnitMapSyntax {
    #[serde(default)]
    units: SpannedMap<Spanned<String>>,
    fallback: Option<Spanned<String>>,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum CoverageSyntax {
    Partial,
    Complete,
    CompleteOrEmpty,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct SourceSyntax {
    sql: Option<Spanned<String>>,
    checkpoint: Option<Spanned<String>>,
    primary_key: Option<Spanned<Vec<Spanned<String>>>>,
    coverage: Option<CoverageSyntax>,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
enum CoercionSyntax {
    Date,
    Time,
    Boolean,
    Number,
    Integer,
    Year,
    Trim,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct AccessorFields {
    column: Option<Spanned<String>>,
    coerce: Option<CoercionSyntax>,
    amount: Option<Spanned<String>>,
    unit: Option<Spanned<String>>,
    unit_map: Option<Spanned<String>>,
}

/// A property accessor: a column name, or an object describing a coercion or a measure.
#[derive(Debug)]
enum AccessorSyntax {
    Column(String),
    Fields(Box<AccessorFields>),
}

struct AccessorVisitor;

impl<'de> Visitor<'de> for AccessorVisitor {
    type Value = AccessorSyntax;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a column name or an accessor mapping")
    }

    fn visit_str<E: serde::de::Error>(self, value: &str) -> Result<Self::Value, E> {
        Ok(AccessorSyntax::Column(String::from(value)))
    }

    fn visit_string<E: serde::de::Error>(self, value: String) -> Result<Self::Value, E> {
        Ok(AccessorSyntax::Column(value))
    }

    fn visit_map<A: MapAccess<'de>>(self, map: A) -> Result<Self::Value, A::Error> {
        AccessorFields::deserialize(MapAccessDeserializer::new(map))
            .map(|fields| AccessorSyntax::Fields(Box::new(fields)))
    }
}

impl<'de> Deserialize<'de> for AccessorSyntax {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        deserializer.deserialize_any(AccessorVisitor)
    }
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct SinkSyntax {
    entity_type: Spanned<String>,
    entity_id: Spanned<String>,
    #[serde(default)]
    properties: SpannedMap<AccessorSyntax>,
}

/// A step. Exactly one of `sql`, `checkpoint`, `sink` and `branches` names what it does.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct StepSyntax {
    id: Spanned<String>,
    sql: Option<Spanned<String>>,
    checkpoint: Option<Spanned<String>>,
    sink: Option<SinkSyntax>,
    branches: Option<Vec<Vec<Self>>>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct EntityPipelineSyntax {
    source: Spanned<String>,
    #[serde(default)]
    depends_on: Vec<Spanned<String>>,
    #[serde(default)]
    inputs: SpannedMap<Spanned<String>>,
    #[serde(default)]
    steps: Vec<StepSyntax>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct EndpointSyntax {
    entity_type: Spanned<String>,
    column: Spanned<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct LinkStepSyntax {
    id: Spanned<String>,
    sql: Spanned<String>,
}

/// A link pipeline. Exactly one of `checkpoint` and `inputs` names what it reads.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct LinkPipelineSyntax {
    id: Spanned<String>,
    checkpoint: Option<Spanned<String>>,
    inputs: Option<SpannedMap<Spanned<String>>>,
    #[serde(default)]
    steps: Vec<LinkStepSyntax>,
    from: EndpointSyntax,
    to: EndpointSyntax,
    link_type: Spanned<String>,
    #[serde(default)]
    properties: SpannedMap<AccessorSyntax>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(deny_unknown_fields)]
struct PipelinesSyntax {
    #[serde(default)]
    entities: Vec<EntityPipelineSyntax>,
    #[serde(default)]
    links: Vec<LinkPipelineSyntax>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(super) struct Document {
    connector: Spanned<String>,
    #[serde(default)]
    vars: SpannedMap<Spanned<String>>,
    #[serde(default)]
    unit_maps: SpannedMap<UnitMapSyntax>,
    #[serde(default)]
    sources: SpannedMap<SourceSyntax>,
    #[serde(default)]
    pipelines: PipelinesSyntax,
}
