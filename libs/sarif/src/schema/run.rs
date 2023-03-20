#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::schema::Tool;

/// Describes a single run of an analysis tool, and contains the reported output of that run.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase")
)]
#[non_exhaustive]
pub struct Run {
    /// Information about the tool or tool pipeline that generated the results in this run
    ///
    /// A run can only contain results produced by a single tool or tool pipeline. A run can
    /// aggregate results from multiple log files, as long as context around the tool run (tool
    /// command-line arguments and the like) is identical for all aggregated files.
    pub tool: Tool,
}

impl Run {
    /// Create a new `Run` with the given tool.
    #[must_use]
    pub const fn new(tool: Tool) -> Self {
        Self { tool }
    }
}

#[cfg(test)]
#[cfg(feature = "serde")]
pub(crate) mod tests {
    use core::iter::once;

    use crate::schema::{tests::validate_schema, Run, Tool, ToolComponent};

    #[test]
    fn empty() {
        let run = Run::new(Tool::new(ToolComponent::new("clippy")));

        validate_schema(&once(run).collect());
    }
}
