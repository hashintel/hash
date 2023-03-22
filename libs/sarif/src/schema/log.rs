use alloc::{borrow::Cow, vec, vec::Vec};

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::schema::{Run, SchemaVersion};

/// Specifies the version of the file format and contains the output from one or more runs.
///
/// See [SARIF specification §3.13](https://docs.oasis-open.org/sarif/sarif/v2.1.0/csprd01/sarif-v2.1.0-csprd01.html#_Toc10540916)
///
///
/// # Example
///
/// ```json
/// {
///   "version": "2.1.0",
///   "runs": [
///     {
///       ...             # A run object
///     },
///     ...
///     {
///       ...             # Another run object
///     }
///   ]
/// }
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(Serialize), serde(rename_all = "camelCase"))]
pub struct SarifLog {
    /// The format version of the SARIF specification to which this log file conforms.
    ///
    /// See [SARIF specification §3.13.2](https://docs.oasis-open.org/sarif/sarif/v2.1.0/csprd01/sarif-v2.1.0-csprd01.html#_Toc10540918)
    ///
    ///
    /// ## Note
    ///
    /// This will make it easier for parsers to handle multiple versions of the SARIF format if new
    /// versions are defined in the future.
    pub version: SchemaVersion,

    /// The absolute URI from which a JSON schema document describing the version of the SARIF
    /// format to which this log file conforms can be obtained.
    ///
    /// If the `$schema` property is present, the JSON schema obtained from that URI must describe
    /// the version of the SARIF format specified by the [`version`] property.
    ///
    /// If the `$schema` property is not explicitly set, a default based on the [`version`]
    /// property is used.
    ///
    /// See [SARIF specification §3.13.3](https://docs.oasis-open.org/sarif/sarif/v2.1.0/csprd01/sarif-v2.1.0-csprd01.html#_Toc10540919)
    ///
    ///
    /// ## Note
    ///
    /// The purpose of the `$schema` property is to allow JSON schema validation tools to locate an
    /// appropriate schema against which to validate the log file. This is useful, for example, for
    /// tool authors who wish to ensure that logs produced by their tools conform to the SARIF
    /// format.
    ///
    /// ## Note
    ///
    /// The SARIF schema is available at <https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json>.
    ///
    /// [`version`]: [Self::version]
    #[cfg_attr(feature = "serde", serde(rename = "$schema"))]
    pub schema: Cow<'static, str>,

    /// The set of runs contained in this log file.
    ///
    /// The value of `runs` must be an array with at least one element except in the following
    /// circumstances:
    ///
    ///   - If a SARIF producer finds no data with which to populate runs, then its value must be
    ///     an empty array.
    ///
    ///     ## Note
    ///
    ///     This would happen if, for example, the log file were the output of a query on a result
    ///     management system, and the query did not match any runs stored in the result management
    ///     system.
    ///
    ///  - If a SARIF producer tries to populate runs but fails, then its value must be `null`.
    ///
    ///    ## Note
    ///
    ///    This would happen if, for example, the log file were the output of a query on a result
    ///    management system, and the query was malformed.
    ///
    /// See [SARIF specification §3.13.4](https://docs.oasis-open.org/sarif/sarif/v2.1.0/csprd01/sarif-v2.1.0-csprd01.html#_Toc10540920)
    pub runs: Option<Vec<Run>>,
}

#[cfg(feature = "serde")]
impl<'de> Deserialize<'de> for SarifLog {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct OptionalSarifLog {
            #[serde(default, rename = "$schema")]
            schema: Option<Cow<'static, str>>,
            #[serde(default)]
            version: Option<SchemaVersion>,
            runs: Option<Vec<Run>>,
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
    /// assert_eq!(log.schema, SchemaVersion::V2_1_0.schema_id());
    /// ```
    #[must_use]
    pub fn new(version: SchemaVersion) -> Self {
        Self {
            schema: version.schema_id().into(),
            version,
            runs: Some(Vec::new()),
        }
    }

    /// Manually set the schema for this log.
    ///
    /// # Example
    ///
    /// ```
    /// use sarif::schema::{SarifLog, SchemaVersion};
    ///
    /// let log = SarifLog::new(SchemaVersion::V2_1_0)
    ///     .with_schema_id("https://example.com/sarif-2.1.0.json")
    ///     .with_runs([]);
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
    /// assert_eq!(log.runs.unwrap().len(), 1);
    /// ```
    #[must_use]
    pub fn with_run(mut self, run: Run) -> Self {
        match self.runs {
            Some(ref mut runs) => runs.push(run),
            None => self.runs = Some(vec![run]),
        }
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
    /// assert_eq!(log.runs.unwrap().len(), 2);
    /// ```
    #[must_use]
    pub fn with_runs(mut self, runs: impl IntoIterator<Item = Run>) -> Self {
        match self.runs {
            Some(ref mut existing_runs) => existing_runs.extend(runs),
            None => self.runs = Some(runs.into_iter().collect()),
        }
        self
    }
}

impl Extend<Run> for SarifLog {
    fn extend<T: IntoIterator<Item = Run>>(&mut self, iter: T) {
        match self.runs {
            Some(ref mut runs) => runs.extend(iter),
            None => self.runs = Some(iter.into_iter().collect()),
        }
    }
}

#[cfg(test)]
#[cfg(feature = "serde")]
pub(crate) mod tests {
    use coverage_helper::test;

    use crate::schema::{
        tests::validate_schema, Run, SarifLog, SchemaVersion, Tool, ToolComponent,
    };

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

    #[test]
    fn with_run() {
        let log_1 = SarifLog {
            schema: SchemaVersion::V2_1_0.schema_id().into(),
            version: SchemaVersion::V2_1_0,
            runs: None,
        }
        .with_run(Run::new(Tool::new(ToolComponent::new("clippy"))))
        .with_run(Run::new(Tool::new(ToolComponent::new("rustfmt"))));
        validate_schema(&log_1);

        let log_2 = SarifLog::new(SchemaVersion::V2_1_0)
            .with_run(Run::new(Tool::new(ToolComponent::new("clippy"))))
            .with_run(Run::new(Tool::new(ToolComponent::new("rustfmt"))));
        validate_schema(&log_2);

        assert_eq!(log_1, log_2);
        assert_eq!(log_1.runs.expect("no runs found").len(), 2);
    }

    #[test]
    fn with_runs() {
        let log_1 = SarifLog {
            schema: SchemaVersion::V2_1_0.schema_id().into(),
            version: SchemaVersion::V2_1_0,
            runs: None,
        }
        .with_runs([
            Run::new(Tool::new(ToolComponent::new("clippy"))),
            Run::new(Tool::new(ToolComponent::new("rustfmt"))),
        ]);
        validate_schema(&log_1);

        let log_2 = SarifLog::new(SchemaVersion::V2_1_0).with_runs([
            Run::new(Tool::new(ToolComponent::new("clippy"))),
            Run::new(Tool::new(ToolComponent::new("rustfmt"))),
        ]);
        validate_schema(&log_2);

        assert_eq!(log_1, log_2);
        assert_eq!(log_1.runs.expect("no runs found").len(), 2);
    }

    #[test]
    fn extend() {
        let mut log = SarifLog {
            schema: SchemaVersion::V2_1_0.schema_id().into(),
            version: SchemaVersion::V2_1_0,
            runs: None,
        };
        let mut log_2 = SarifLog::new(SchemaVersion::V2_1_0);
        assert_ne!(log, log_2);

        log.extend([
            Run::new(Tool::new(ToolComponent::new("clippy"))),
            Run::new(Tool::new(ToolComponent::new("rustfmt"))),
        ]);

        validate_schema(&log);

        assert_eq!(log.runs.as_ref().expect("no runs found").len(), 2);

        log_2.extend([
            Run::new(Tool::new(ToolComponent::new("clippy"))),
            Run::new(Tool::new(ToolComponent::new("rustfmt"))),
        ]);

        validate_schema(&log_2);

        assert_eq!(log, log_2);
    }
}
