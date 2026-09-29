use alloc::collections::BTreeMap;
use core::num::NonZeroU64;

use error_stack::Report;

use crate::issue::{DefinitionIssue, DefinitionPath, SourceLocation};

impl SourceLocation {
    /// Converts a location from the YAML parser, which uses line 0 for an unknown location.
    pub(super) fn from_yaml(location: &serde_saphyr::Location) -> Option<Self> {
        Some(Self {
            line: NonZeroU64::new(location.line())?,
            column: NonZeroU64::new(location.column())?,
        })
    }
}

/// The source location of each path in a parsed definition.
#[derive(Debug, Default)]
pub(super) struct Locations(BTreeMap<DefinitionPath, SourceLocation>);

impl Locations {
    /// Records `location` for `path`, keeping the first location recorded.
    pub(super) fn insert(&mut self, path: DefinitionPath, location: Option<SourceLocation>) {
        if let Some(location) = location {
            self.0.entry(path).or_insert(location);
        }
    }

    /// Returns the location of `path`, or of the closest path it extends.
    pub(super) fn find(&self, path: &DefinitionPath) -> Option<SourceLocation> {
        let mut current = Some(path.clone());
        while let Some(path) = current {
            if let Some(location) = self.0.get(&path) {
                return Some(*location);
            }
            current = path.parent();
        }
        None
    }

    /// Adds a location to each issue in `report`.
    pub(super) fn locate(&self, report: &Report<[DefinitionIssue]>) -> Report<[DefinitionIssue]> {
        report
            .current_contexts()
            .map(|issue| {
                Report::new(DefinitionIssue {
                    location: self.find(&issue.path),
                    ..issue.clone()
                })
            })
            .collect::<Option<Report<[DefinitionIssue]>>>()
            .expect("a report should hold at least one issue")
    }
}
