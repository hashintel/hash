//! Parsing definitions from YAML.
//!
//! Parsing has two stages. The YAML parser reads the text into the syntax types and stops at
//! the first error, which is either invalid YAML or a value that does not fit the format.
//! Lowering then builds the definition's parts and reports every issue it finds, each with its
//! source location.

mod interpolate;
mod locations;
mod syntax;
#[cfg(test)]
mod tests;

use alloc::vec::Vec;

use error_stack::{Report, ResultExt as _};

use self::syntax::Document;
use crate::{
    definition::Definition,
    issue::{DefinitionIssue, SourceLocation},
};

/// Reports why a definition could not be parsed.
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub enum ParseError {
    /// The text is not YAML, or does not fit the definition format.
    ///
    /// The report's source is the YAML parser's error, which shows the offending line.
    #[display("text is not a definition in the YAML format")]
    Syntax { location: Option<SourceLocation> },
    /// The definition fits the format but has issues.
    ///
    /// The report's sources are every [`DefinitionIssue`] found.
    #[display("definition has issues")]
    Invalid,
}

impl Definition {
    /// Parses a definition from YAML and checks it.
    ///
    /// Issues found while lowering are reported on their own. When lowering finds none,
    /// [`Definition::new`] checks the parts against each other and reports its issues.
    ///
    /// Placeholders of the form `${NAME}` in string values and map keys are replaced with the
    /// definition's `vars`. `$${` stands for a literal `${`.
    ///
    /// # Errors
    ///
    /// - [`Syntax`] for the first place where the text is not YAML or does not fit the format
    /// - [`Invalid`] with every [`DefinitionIssue`] found, each with its source location
    ///
    /// [`Syntax`]: ParseError::Syntax
    /// [`Invalid`]: ParseError::Invalid
    pub fn from_yaml(text: &str) -> Result<Self, Report<ParseError>> {
        let document: Document = serde_saphyr::from_str(text).map_err(|error| {
            let location = error
                .location()
                .and_then(|location| SourceLocation::from_yaml(&location));
            Report::new(error).change_context(ParseError::Syntax { location })
        })?;

        let (parts, locations) = document.lower().change_context(ParseError::Invalid)?;

        Self::new(parts)
            .map_err(|report| locations.locate(&report))
            .change_context(ParseError::Invalid)
    }
}

impl DefinitionIssue {
    /// Returns the issues in a report from [`Definition::from_yaml`], in source order.
    ///
    /// Issues without a location come last.
    pub fn in_report(report: &Report<ParseError>) -> impl Iterator<Item = &Self> {
        let mut issues: Vec<&Self> = report
            .frames()
            .filter_map(|frame| frame.downcast_ref::<Self>())
            .collect();
        issues.sort_by_key(|issue| (issue.location.is_none(), issue.location));
        issues.into_iter()
    }
}
