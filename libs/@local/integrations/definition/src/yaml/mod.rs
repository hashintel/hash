//! Parsing definitions from YAML.
//!
//! The YAML parser reads the text into the syntax types, lowering builds the
//! [`DefinitionParts`](crate::DefinitionParts) from them, and [`Definition::new`] checks the
//! parts. Each issue gets the source location of the part it concerns, or of the closest part
//! that contains it, where one is known.

mod interpolate;
mod locations;
mod syntax;

use alloc::vec::Vec;

use error_stack::{Report, ResultExt as _};
use serde_saphyr::MergeKeyPolicy;

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
    /// The report keeps the YAML parser's error, which shows the offending line.
    #[display("text is not a definition in the YAML format")]
    Syntax {
        /// Where the YAML parser stopped, if it reported a position.
        location: Option<SourceLocation>,
    },
    /// The definition fits the format but has issues.
    ///
    /// The report's sources are every [`DefinitionIssue`] found. [`DefinitionIssue::in_report`]
    /// returns them in source order.
    #[display("definition has issues")]
    Invalid,
}

impl Definition {
    /// Parses a definition from YAML and checks it.
    ///
    /// If building the [`DefinitionParts`](crate::DefinitionParts) from the text finds issues,
    /// they are returned and [`Definition::new`] does not run.
    ///
    /// The text is read as YAML 1.2. Where the format expects text, an unquoted number or boolean,
    /// such as `2024` or `true`, is refused. Quote it to use it as text. Words that older YAML
    /// versions read as booleans, such as `yes` and `on`, are text. A few forms that only older
    /// versions read as numbers, such as `1_000` and `0b101`, are refused as well. Merge keys
    /// (`<<`) are refused.
    ///
    /// Placeholders of the form `${NAME}` in string values and mapping keys outside `vars` are
    /// replaced with the definition's `vars`. `$${` stands for a literal `${`.
    ///
    /// # Errors
    ///
    /// - [`Syntax`] for the first place where the text is not YAML or does not fit the format
    /// - [`Invalid`] with every [`DefinitionIssue`] found, each with its source location where one
    ///   is known
    ///
    /// # Examples
    ///
    /// ```
    /// use hash_integrations_definition::Definition;
    ///
    /// let definition =
    ///     Definition::from_yaml("connector: aviation\n").expect("the text should be a definition");
    /// assert_eq!(definition.connector().to_string(), "aviation");
    /// ```
    ///
    /// [`Syntax`]: ParseError::Syntax
    /// [`Invalid`]: ParseError::Invalid
    pub fn from_yaml(text: &str) -> Result<Self, Report<ParseError>> {
        let options = serde_saphyr::options! {
            no_schema: true,
            strict_booleans: true,
            merge_keys: MergeKeyPolicy::Error,
        };
        let document: Document =
            serde_saphyr::from_str_with_options(text, options).map_err(|error| {
                let location = error
                    .location()
                    .and_then(|location| SourceLocation::from_yaml(&location));
                Report::new(error).change_context(ParseError::Syntax { location })
            })?;

        let (parts, locations) = document.lower().change_context(ParseError::Invalid)?;

        Self::new(parts)
            .map_err(|report| locations.locate(report))
            .change_context(ParseError::Invalid)
    }
}

impl DefinitionIssue {
    /// Returns the issues in a report from [`Definition::from_yaml`], in source order.
    ///
    /// Issues without a location come last. A [`ParseError::Syntax`] report holds no issues.
    pub fn in_report(report: &Report<ParseError>) -> impl Iterator<Item = &Self> {
        let mut issues: Vec<&Self> = report
            .frames()
            .filter_map(|frame| frame.downcast_ref::<Self>())
            .collect();
        issues.sort_by_key(|issue| (issue.location().is_none(), issue.location()));
        issues.into_iter()
    }
}
