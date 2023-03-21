//! The JSON schema of the SARIF log file format as a Rust module.

mod log;
mod run;
mod tool;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

pub use self::{
    log::SarifLog,
    run::Run,
    tool::{Tool, ToolComponent},
};

/// The schema version of the log file.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub enum SchemaVersion {
    /// The SARIF 2.1.0 schema.
    #[cfg_attr(feature = "serde", serde(rename = "2.1.0"))]
    V2_1_0,
}

impl SchemaVersion {
    /// The URI of the JSON schema corresponding to this version.
    #[must_use]
    pub const fn schema_id(self) -> &'static str {
        match self {
            Self::V2_1_0 => "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
        }
    }
}

#[cfg(test)]
#[cfg(feature = "serde")]
pub(crate) mod tests {
    use std::eprintln;

    use super::*;

    #[expect(clippy::panic)]
    #[cfg_attr(coverage_nightly, no_coverage)]
    pub(crate) fn validate_schema(log: &SarifLog) {
        let log_value = serde_json::to_value(log).expect("serializing `Log` into JSON failed");

        assert_eq!(
            SarifLog::deserialize(&log_value).expect("could not serialize into `Log`"),
            *log,
            "serialized `Log` is not equal to original"
        );

        let json_schema_str = include_str!("../json_schema/sarif-2.1.0.json");
        let json_schema_value =
            serde_json::from_str(json_schema_str).expect("could not parse JSON schema");
        let json_schema = jsonschema::JSONSchema::options()
            .compile(&json_schema_value)
            .expect("could not compile JSON schema");

        let validation = json_schema.validate(&log_value);
        if let Err(errors) = validation {
            eprintln!("JSON schema validation failed:");
            for error in errors {
                eprintln!("{}: {error}", error.instance_path);
            }
            panic!("JSON schema validation failed");
        }
    }
}
