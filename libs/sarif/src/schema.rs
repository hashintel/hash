//! The JSON schema of the SARIF log file format as a Rust module.

mod log;
mod run;
mod tool;

#[cfg(feature = "serde-1")]
use serde::{Deserialize, Serialize};

pub use self::{
    log::Log,
    run::Run,
    tool::{Tool, ToolComponent},
};

/// The URI of the JSON schema corresponding to this version.
pub const SCHEMA_ID: &str = "https://schemastore.azurewebsites.net/schemas/json/sarif-2.1.0.json";

/// The schema version of the log file.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde-1", derive(Serialize, Deserialize))]
pub enum SchemaVersion {
    /// The SARIF 2.1.0 schema.
    #[cfg_attr(feature = "serde-1", serde(rename = "2.1.0"))]
    V2_1_0,
}

#[cfg(test)]
#[cfg(feature = "serde-1")]
pub(crate) mod tests {
    use std::eprintln;

    use super::*;

    #[expect(clippy::panic)]
    pub(crate) fn validate_schema(log: &Log) {
        let log_value = serde_json::to_value(log).expect("serializing `Log` into JSON failed");

        assert_eq!(
            Log::deserialize(&log_value).expect("could not serialize into `Log`"),
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
