use alloc::{borrow::Cow, vec::Vec};

#[cfg(feature = "serde-1")]
use serde::{Deserialize, Serialize};

use crate::schema::{Run, SchemaVersion, SCHEMA_ID};

/// Static Analysis Results Format (SARIF) Version 2.1.0 JSON Schema: a standard format for the
/// output of static analysis tools.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(
    feature = "serde-1",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase")
)]
pub struct Log {
    /// The URI of the JSON schema corresponding to the version.
    ///
    /// For example, `https://schemastore.azurewebsites.net/schemas/json/sarif-2.1.0.json`
    #[cfg_attr(
        feature = "serde-1",
        serde(rename = "$schema", skip_serializing_if = "Option::is_none")
    )]
    pub schema: Option<Cow<'static, str>>,

    /// The SARIF format version of this log file.
    pub version: SchemaVersion,

    /// The set of runs contained in this log file.
    ///
    /// A SARIF file contains an array of one or more runs. Each run represents a single run of an
    /// analysis tool.
    pub runs: Vec<Run>,
}

impl Default for Log {
    fn default() -> Self {
        Self {
            schema: Some(SCHEMA_ID.into()),
            version: SchemaVersion::V2_1_0,
            runs: Vec::new(),
        }
    }
}

impl FromIterator<Run> for Log {
    fn from_iter<T: IntoIterator<Item = Run>>(runs: T) -> Self {
        Self {
            runs: runs.into_iter().collect(),
            ..Default::default()
        }
    }
}

#[cfg(test)]
#[cfg(feature = "serde-1")]
pub(crate) mod tests {
    use crate::schema::{tests::validate_schema, Log};

    #[test]
    #[no_coverage]
    fn default() {
        validate_schema(&Log::default());
    }
}
