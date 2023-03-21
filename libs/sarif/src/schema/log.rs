use alloc::{borrow::Cow, vec::Vec};

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::schema::{Run, SchemaVersion};

/// Static Analysis Results Format (SARIF) Version 2.1.0 JSON Schema: a standard format for the
/// output of static analysis tools.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(Serialize), serde(rename_all = "camelCase"))]
pub struct SarifLog {
    /// The URI of the JSON schema corresponding to the version.
    ///
    /// For example, `https://schemastore.azurewebsites.net/schemas/json/sarif-2.1.0.json`
    #[cfg_attr(feature = "serde", serde(rename = "$schema"))]
    pub schema: Cow<'static, str>,

    /// The SARIF format version of this log file.
    pub version: SchemaVersion,

    /// The set of runs contained in this log file.
    ///
    /// A SARIF file contains an array of one or more runs. Each run represents a single run of an
    /// analysis tool.
    pub runs: Vec<Run>,
}

impl<'de> Deserialize<'de> for SarifLog {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct OptionalSarifLog {
            #[serde(default, rename = "$schema")]
            schema: Option<Cow<'static, str>>,
            #[serde(default)]
            version: Option<SchemaVersion>,
            runs: Vec<Run>,
        }

        let log = OptionalSarifLog::deserialize(deserializer)?;
        let version = log.version.unwrap_or(SchemaVersion::V2_1_0);
        Ok(Self {
            version: log.version.unwrap_or(SchemaVersion::V2_1_0),
            schema: log.schema.unwrap_or_else(|| version.schema_id().into()),
            runs: log.runs,
        })
    }
}

impl SarifLog {
    /// Creates a new SARIF log with the given schema version.
    ///
    /// Depending on the schema version, the `schema` field will be set to the corresponding schema
    /// URI.
    ///
    /// # Example
    ///
    /// ```
    /// use sarif::schema::{SarifLog, SchemaVersion};
    ///
    /// let log = SarifLog::new(SchemaVersion::V2_1_0);
    ///
    /// assert_eq!(log.version, SchemaVersion::V2_1_0);
    /// ```
    #[must_use]
    pub fn new(version: SchemaVersion) -> Self {
        Self {
            schema: version.schema_id().into(),
            version,
            runs: Vec::new(),
        }
    }

    /// Manually set the schema for this log.
    ///
    /// # Example
    ///
    /// ```
    /// use sarif::schema::{SarifLog, SchemaVersion};
    ///
    /// let log =
    ///     SarifLog::new(SchemaVersion::V2_1_0).with_schema_id("https://example.com/sarif-2.1.0.json");
    ///
    /// assert_eq!(log.schema, "https://example.com/sarif-2.1.0.json");
    /// ```
    #[must_use]
    pub fn with_schema_id(mut self, schema_id: impl Into<Cow<'static, str>>) -> Self {
        self.schema = schema_id.into();
        self
    }

    /// Add a run to this log.
    ///
    /// # Example
    ///
    /// ```
    /// use sarif::schema::{Run, SarifLog, SchemaVersion, Tool, ToolComponent};
    ///
    /// let log = SarifLog::new(SchemaVersion::V2_1_0)
    ///     .with_run(Run::new(Tool::new(ToolComponent::new("clippy"))));
    ///
    /// assert_eq!(log.runs.len(), 1);
    /// ```
    #[must_use]
    pub fn with_run(mut self, run: Run) -> Self {
        self.runs.push(run);
        self
    }

    /// Add multiple runs to this log.
    ///
    /// # Example
    ///
    /// ```
    /// use sarif::schema::{Run, SarifLog, SchemaVersion, Tool, ToolComponent};
    ///
    /// let log = SarifLog::new(SchemaVersion::V2_1_0).with_runs([
    ///     Run::new(Tool::new(ToolComponent::new("clippy"))),
    ///     Run::new(Tool::new(ToolComponent::new("rustfmt"))),
    /// ]);
    ///
    /// assert_eq!(log.runs.len(), 2);
    /// ```
    #[must_use]
    pub fn with_runs(mut self, runs: impl IntoIterator<Item = Run>) -> Self {
        self.runs.extend(runs);
        self
    }
}

#[cfg(test)]
#[cfg(feature = "serde")]
pub(crate) mod tests {
    use coverage_helper::test;

    use crate::schema::{tests::validate_schema, SarifLog, SchemaVersion};

    #[test]
    fn minimal() {
        validate_schema(&SarifLog::new(SchemaVersion::V2_1_0));
    }

    #[test]
    fn with_schema_id() {
        validate_schema(
            &SarifLog::new(SchemaVersion::V2_1_0)
                .with_schema_id("https://example.com/sarif-2.1.0.json"),
        );
    }
}
