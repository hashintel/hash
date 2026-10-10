//! The definition format as serde types.
//!
//! The types follow the format field by field, reject unknown fields, and keep the source location
//! of the keys and values that lowering checks.

mod lower;
mod spanned_map;

use alloc::{string::String, vec::Vec};

use serde::Deserialize;
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
}
