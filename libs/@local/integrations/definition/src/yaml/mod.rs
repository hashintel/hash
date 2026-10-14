//! Parsing definitions from YAML.
//!
//! The YAML parser reads the text into the syntax types, lowering builds the
//! [`DefinitionParts`](crate::DefinitionParts) from them, and [`Definition::new`] checks the
//! parts. Each issue gets the source location of the part it concerns, or of the closest part
//! that contains it, where one is known.

mod interpolate;
mod locations;
mod syntax;

use alloc::{boxed::Box, vec::Vec};

use error_stack::{Report, ResultExt as _};
use serde_saphyr::{MergeKeyPolicy, MessageFormatter as _, UserMessageFormatter};

use self::syntax::Document;
use crate::{
    definition::Definition,
    issue::{DefinitionIssue, DisplayList, SourceLocation},
};

/// Reports why the text is not YAML, or does not fit the definition format.
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display)]
pub enum SyntaxError {
    #[display("`{key}` repeats an earlier key")]
    DuplicateKey { key: Box<str> },
    #[display("merge keys (`<<`) are not allowed")]
    MergeKey,
    #[display(
        "`{field}` is not a field here; expected one of {}",
        DisplayList::new(expected)
    )]
    UnknownField {
        field: Box<str>,
        expected: Box<[&'static str]>,
    },
    #[display("`{value}` is not one of {}", DisplayList::new(expected))]
    UnknownValue {
        value: Box<str>,
        expected: Box<[&'static str]>,
    },
    #[display("`{field}` is required")]
    MissingField { field: &'static str },
    #[display("`{value}` must be quoted to be read as text")]
    Unquoted { value: Box<str> },
    #[display("expected {expected}")]
    Expected { expected: &'static str },
    #[display("expected {expected}, found {found}")]
    Unexpected { found: Box<str>, expected: Box<str> },
    #[display("the text is too large or nested too deeply")]
    TooLarge,
    /// Any other error the YAML parser reports, in the parser's own words.
    #[display("{message}")]
    Other { message: Box<str> },
}

impl SyntaxError {
    /// Returns the definition term for a YAML parser event that the parser expected.
    fn event(event: &'static str) -> &'static str {
        match event {
            "mapping start" => "a mapping",
            "sequence start" => "a list",
            "string scalar" => "text",
            other => other,
        }
    }

    /// Returns `found` with serde's name for null replaced.
    fn found(found: &str) -> Box<str> {
        if found == "unit value" {
            "null".into()
        } else {
            found.into()
        }
    }

    /// Returns `expected` with serde's description of a derived Rust type replaced.
    fn expected(expected: &str) -> Box<str> {
        if expected.starts_with("struct ") {
            "a mapping".into()
        } else if expected.starts_with("enum ") {
            "text".into()
        } else {
            expected.into()
        }
    }

    /// Returns the reason the YAML parser refused the text.
    #[expect(
        clippy::wildcard_enum_match_arm,
        reason = "the YAML parser's error enum is non-exhaustive, and every other error keeps the \
                  parser's message"
    )]
    fn from_yaml(error: &serde_saphyr::Error) -> Self {
        match error.without_snippet() {
            serde_saphyr::Error::DuplicateMappingKey { key: Some(key), .. } => Self::DuplicateKey {
                key: key.as_str().into(),
            },
            serde_saphyr::Error::MergeKeyNotAllowed { .. } => Self::MergeKey,
            serde_saphyr::Error::SerdeUnknownField {
                field, expected, ..
            } => Self::UnknownField {
                field: field.as_str().into(),
                expected: expected.as_slice().into(),
            },
            serde_saphyr::Error::SerdeUnknownVariant {
                variant, expected, ..
            } => Self::UnknownValue {
                value: variant.as_str().into(),
                expected: expected.as_slice().into(),
            },
            serde_saphyr::Error::SerdeMissingField { field, .. } => Self::MissingField { field },
            serde_saphyr::Error::QuotingRequired { value, .. } => Self::Unquoted {
                value: value.as_str().into(),
            },
            serde_saphyr::Error::SerdeInvalidType {
                unexpected,
                expected,
                ..
            }
            | serde_saphyr::Error::SerdeInvalidValue {
                unexpected,
                expected,
                ..
            } => Self::Unexpected {
                found: Self::found(unexpected),
                expected: Self::expected(expected),
            },
            serde_saphyr::Error::Unexpected { expected, .. } => Self::Expected {
                expected: Self::event(expected),
            },
            serde_saphyr::Error::ExternallyTaggedEnumExpectedScalarOrMapping { .. } => {
                Self::Expected {
                    expected: "text or a mapping",
                }
            }
            serde_saphyr::Error::Budget { .. } => Self::TooLarge,
            other => Self::Other {
                message: UserMessageFormatter.format_message(other).into(),
            },
        }
    }
}

/// Reports why a definition could not be parsed.
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub enum ParseError {
    /// The text is not YAML, or does not fit the definition format.
    ///
    /// The report keeps the YAML parser's error as its source.
    #[display("{reason}")]
    Syntax {
        /// Where the YAML parser stopped, if it reported a position.
        location: Option<SourceLocation>,
        reason: SyntaxError,
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
                let reason = SyntaxError::from_yaml(&error);
                Report::new(error).change_context(ParseError::Syntax { location, reason })
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

#[cfg(test)]
mod tests {
    use alloc::borrow::ToOwned as _;

    use serde_saphyr::Location;

    use super::SyntaxError;

    #[test]
    fn from_yaml_uses_definition_terms() {
        for (error, message) in [
            (
                serde_saphyr::Error::Unexpected {
                    expected: "sequence start",
                    location: Location::UNKNOWN,
                },
                "expected a list",
            ),
            (
                serde_saphyr::Error::ExternallyTaggedEnumExpectedScalarOrMapping {
                    location: Location::UNKNOWN,
                },
                "expected text or a mapping",
            ),
            (
                serde_saphyr::Error::SerdeInvalidType {
                    unexpected: "unit value".to_owned(),
                    expected: "struct SourceSyntax".to_owned(),
                    location: Location::UNKNOWN,
                },
                "expected a mapping, found null",
            ),
        ] {
            assert_eq!(
                SyntaxError::from_yaml(&error).to_string(),
                message,
                "the message should use the terms of the definition format"
            );
        }
    }
}
