use alloc::collections::BTreeMap;
use core::{num::NonZeroU64, ops::ControlFlow};

use error_stack::Report;
use serde_saphyr::Spanned;

use crate::issue::{DefinitionIssue, DefinitionPath, SourceLocation};

impl SourceLocation {
    /// Converts a location from the YAML parser, which uses line 0 for an unknown location.
    pub(super) fn from_yaml(location: &serde_saphyr::Location) -> Option<Self> {
        Some(Self {
            line: NonZeroU64::new(location.line())?,
            column: NonZeroU64::new(location.column())?,
        })
    }

    /// Returns where `value` is used. For a value reached through an alias, this is the alias.
    pub(super) fn from_spanned<T>(value: &Spanned<T>) -> Option<Self> {
        Self::from_yaml(&value.referenced)
    }
}

/// The source location of each path in a parsed definition.
#[derive(Debug, Default)]
pub(super) struct Locations(BTreeMap<DefinitionPath, SourceLocation>);

impl Locations {
    /// Records `location` for `path`, replacing an earlier location.
    ///
    /// An issue gets the location last recorded for its path, or for the closest path it extends.
    pub(super) fn insert(&mut self, path: &DefinitionPath, location: Option<SourceLocation>) {
        let Some(location) = location else {
            return;
        };
        if let Some(recorded) = self.0.get_mut(path) {
            *recorded = location;
        } else {
            self.0.insert(path.clone(), location);
        }
    }

    /// Returns the location of `path`, or of the closest path it extends.
    pub(super) fn find(&self, path: &DefinitionPath) -> Option<SourceLocation> {
        let mut segments = path.segments();
        loop {
            if let Some(location) = self.0.get(segments) {
                return Some(*location);
            }
            (_, segments) = segments.split_last()?;
        }
    }

    /// Sets the location of each issue in `report`.
    pub(super) fn locate(
        &self,
        mut report: Report<[DefinitionIssue]>,
    ) -> Report<[DefinitionIssue]> {
        // The visitor never breaks, so every frame is visited.
        let _: ControlFlow<()> = report.frames_mut(|frame| {
            if let Some(issue) = frame.downcast_mut::<DefinitionIssue>() {
                issue.set_location(self.find(issue.path()));
            }
            ControlFlow::Continue(())
        });
        report
    }
}
