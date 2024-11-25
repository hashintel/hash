#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::schema::Tool;

/// Describes a single run of an analysis tool, and contains the reported output of that run.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase")
)]
#[non_exhaustive]
pub struct Run<'s> {
    /// Information about the tool or tool pipeline that generated the results in this run
    ///
    /// A run can only contain results produced by a single tool or tool pipeline. A run can
    /// aggregate results from multiple log files, as long as context around the tool run (tool
    /// command-line arguments and the like) is identical for all aggregated files.
    #[cfg_attr(feature = "serde", serde(borrow))]
    pub tool: Tool<'s>,
}

impl<'s> Run<'s> {
    /// Create a new `Run` with the given tool.
    ///
    /// # Example
    ///
    /// ```
    /// use sarif::schema::{Run, Tool, ToolComponent};
    ///
    /// let run = Run::new(Tool::new(ToolComponent::new("clippy")));
    ///
    /// assert_eq!(run.tool.driver.name, "clippy");
    /// ```
    #[must_use]
    pub const fn new(tool: Tool<'s>) -> Self {
        Self { tool }
    }
}

#[cfg(test)]
#[cfg(feature = "serde")]
#[coverage(off)]
pub(crate) mod tests {

    use crate::schema::{
        Run, SarifLog, SchemaVersion, Tool, ToolComponent, tests::validate_schema,
    };

    #[test]
    fn empty() {
        let run = Run::new(Tool::new(ToolComponent::new("clippy")));

        validate_schema(&SarifLog::new(SchemaVersion::V2_1_0).with_run(run));
    }
}
