//! The JSON schema of the SARIF log file format as a Rust module.

mod log;
mod message;
mod multiformat_message_string;
mod properties;
mod reporting_descriptor;
mod run;
mod tool;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

pub use self::{
    log::SarifLog,
    message::Message,
    multiformat_message_string::MultiformatMessageString,
    properties::PropertyBag,
    reporting_descriptor::ReportingDescriptor,
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
#[coverage(off)]
pub(crate) mod tests {
    use std::fs;

    use super::*;

    #[expect(clippy::panic)]
    #[coverage(off)]
    pub(crate) fn validate_schema(log: &SarifLog) {
        let log_value = serde_json::to_value(log).expect("serializing `SarifLog` into JSON failed");

        assert_eq!(
            SarifLog::deserialize(&log_value).expect("could not serialize into `SarifLog`"),
            *log,
            "serialized `SarifLog` is not equal to original"
        );

        let json_schema_str = include_str!("../../tests/schemas/sarif-2.1.0.json");
        let json_schema_value =
            serde_json::from_str(json_schema_str).expect("could not parse JSON schema");
        let json_schema = jsonschema::Validator::options()
            .build(&json_schema_value)
            .expect("could not compile JSON schema");

        let validation = json_schema.validate(&log_value);
        if let Err(error) = validation {
            panic!("JSON schema validation failed: {error}");
        }
    }

    #[test]
    fn example_k1() {
        let file_content =
            fs::read("tests/example_reports/k1_minimal.sarif.json").expect("could not read file");
        let log = serde_json::from_slice(&file_content).expect("could not parse SARIF log");

        validate_schema(&log);
    }

    #[test]
    fn example_k2() {
        let file_content = fs::read("tests/example_reports/k2_recommended_with_source.sarif.json")
            .expect("could not read file");
        let log = serde_json::from_slice(&file_content).expect("could not parse SARIF log");

        validate_schema(&log);
    }

    #[test]
    fn example_k3() {
        let file_content =
            fs::read("tests/example_reports/k3_recommended_without_source.sarif.json")
                .expect("could not read file");
        let log = serde_json::from_slice(&file_content).expect("could not parse SARIF log");

        validate_schema(&log);
    }

    #[test]
    fn example_k4() {
        let file_content = fs::read("tests/example_reports/k4_comprehensive.sarif.json")
            .expect("could not read file");
        let log = serde_json::from_slice(&file_content).expect("could not parse SARIF log");

        validate_schema(&log);
    }
}
