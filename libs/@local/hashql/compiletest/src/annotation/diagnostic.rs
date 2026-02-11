use core::str::pattern::{Pattern as _, Searcher as _};

use hashql_diagnostics::severity::Severity;

#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display)]
pub(crate) enum DiagnosticParseError {
    /// No supported severity found in the annotation.
    #[display("missing severity, expected one of: {:?}", Severity::variants())]
    MissingSeverity,
    /// Pipe reference used without a previous diagnostic annotation line.
    #[display("pipe reference used without a previous diagnostic annotation line")]
    MissingPreviousLine,
}

impl core::error::Error for DiagnosticParseError {}

// expressed as: SEVERITY[category] message
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub(crate) struct DiagnosticAnnotation {
    pub category: Option<String>,
    pub severity: Severity,
    pub message: String,
    // 1-indexed line number
    pub line: Option<u32>,
}

impl DiagnosticAnnotation {
    pub(crate) const MARKER: &str = "//~";

    /// Parses a diagnostic annotation from the given string.
    ///
    /// # Errors
    ///
    /// - [`MissingSeverity`] if no supported severity is found in the annotation
    /// - [`MissingPreviousLine`] if a pipe reference is used without a previous diagnostic
    ///   annotation line
    ///
    /// [`MissingSeverity`]: DiagnosticParseError::MissingSeverity
    /// [`MissingPreviousLine`]: DiagnosticParseError::MissingPreviousLine
    #[expect(clippy::cast_possible_truncation)]
    pub(crate) fn parse(
        mut value: &str,
        current_line: u32,
        previous_diagnostic_annotation_line: Option<u32>,
    ) -> Result<Self, DiagnosticParseError> {
        // Super simple parsing algorithm
        let mut annotation_severity = None;
        let mut annotation_category = None;

        value = value.trim();

        // Parse the line number offset, this follows the rules of
        // <https://rustc-dev-guide.rust-lang.org/tests/ui.html#error-annotations>
        let annotation_line_number = if value.starts_with('^') {
            let mut matcher = '^'.into_searcher(value);

            #[expect(unsafe_code)]
            if let Some((index, _)) = matcher.next_reject() {
                // SAFETY: `Searcher` is known to return valid indices.
                value = unsafe { value.get_unchecked(index..value.len()) };

                Some(current_line - (index as u32))
            } else {
                value = "";

                // The whole line is a caret(?)
                Some(current_line - (value.len() as u32))
            }
        } else if let Some(next) = value.strip_prefix('|') {
            value = next.trim();
            let previous_line = previous_diagnostic_annotation_line
                .ok_or(DiagnosticParseError::MissingPreviousLine)?;

            Some(previous_line)
        } else if value.starts_with('v') {
            let mut matcher = 'v'.into_searcher(value);

            #[expect(unsafe_code)]
            if let Some((index, _)) = matcher.next_reject() {
                // SAFETY: `Searcher` is known to return valid indices.
                value = unsafe { value.get_unchecked(index..value.len()) };

                Some(current_line + (index as u32))
            } else {
                value = "";

                // The whole line is a caret(?)
                Some(current_line + (value.len() as u32))
            }
        } else if let Some(next) = value.strip_prefix('?') {
            value = next.trim();
            None
        } else {
            Some(current_line)
        };

        // Making sure that we're not tripped up by `//~^ ERROR`
        value = value.trim();

        // Figure out the severity
        for severity in Severity::variants() {
            if let Some(next) = value.strip_prefix(&severity.name().to_ascii_uppercase()) {
                value = next.trim();

                annotation_severity = Some(*severity);

                break;
            }
        }

        // If present, parse the category
        if let Some(next) = value.strip_prefix('[')
            && let Some((category, next)) = next.split_once(']')
        {
            value = next.trim();

            if !category.is_empty() {
                annotation_category = Some(category.to_owned());
            }
        }

        // False-positive, therefore we do not advance the string

        let message = value.trim().to_owned();

        let severity = annotation_severity.ok_or(DiagnosticParseError::MissingSeverity)?;

        Ok(Self {
            severity,
            message,
            category: annotation_category,
            line: annotation_line_number,
        })
    }
}

#[cfg(test)]
mod tests {
    use core::assert_matches;

    use super::*;

    #[test]
    fn simple_error_annotation() {
        let annotation = DiagnosticAnnotation::parse("ERROR message text", 10, Some(9))
            .expect("should successfully parse a simple ERROR annotation");

        assert_eq!(
            annotation,
            DiagnosticAnnotation {
                severity: Severity::Error,
                message: "message text".to_owned(),
                category: None,
                line: Some(10),
            }
        );
    }

    #[test]
    fn severity_levels() {
        for &severity in Severity::variants() {
            let input = format!("{} test message", severity.name().to_ascii_uppercase());
            let annotation =
                DiagnosticAnnotation::parse(&input, 5, Some(4)).expect("should successfully parse");

            assert_eq!(
                annotation,
                DiagnosticAnnotation {
                    severity,
                    message: "test message".to_owned(),
                    category: None,
                    line: Some(5),
                }
            );
        }
    }

    #[test]
    fn annotation_with_category() {
        let annotation = DiagnosticAnnotation::parse("ERROR[E001] categorized error", 15, Some(14))
            .expect("should successfully parse annotation with category");

        assert_eq!(
            annotation,
            DiagnosticAnnotation {
                severity: Severity::Error,
                message: "categorized error".to_owned(),
                category: Some("E001".to_owned()),
                line: Some(15),
            }
        );
    }

    #[test]
    fn caret_line_reference() {
        let annotation = DiagnosticAnnotation::parse("^^^ERROR missing semicolon", 20, Some(19))
            .expect("should successfully parse caret line reference");

        assert_eq!(
            annotation,
            DiagnosticAnnotation {
                severity: Severity::Error,
                message: "missing semicolon".to_owned(),
                category: None,
                line: Some(17),
            }
        );
    }

    #[test]
    fn v_line_reference() {
        let annotation = DiagnosticAnnotation::parse("vvvERROR undefined variable", 20, Some(19))
            .expect("should successfully parse v line reference");

        assert_eq!(
            annotation,
            DiagnosticAnnotation {
                severity: Severity::Error,
                message: "undefined variable".to_owned(),
                category: None,
                line: Some(23),
            }
        );
    }

    #[test]
    fn pipe_previous_line_reference() {
        let annotation = DiagnosticAnnotation::parse("| ERROR previous line error", 10, Some(9))
            .expect("should successfully parse pipe line reference");

        assert_eq!(
            annotation,
            DiagnosticAnnotation {
                severity: Severity::Error,
                message: "previous line error".to_owned(),
                category: None,
                line: Some(9),
            }
        );
    }

    #[test]
    fn pipe_with_no_previous_line() {
        let error = DiagnosticAnnotation::parse("| ERROR no previous line", 10, None)
            .expect_err("should fail when using pipe without a previous line reference");

        assert_matches!(error, DiagnosticParseError::MissingPreviousLine);
    }

    #[test]
    fn question_mark_unknown_line() {
        let annotation = DiagnosticAnnotation::parse("? WARNING might occur anywhere", 10, Some(9))
            .expect("should successfully parse question mark");

        assert_eq!(
            annotation,
            DiagnosticAnnotation {
                severity: Severity::Warning,
                message: "might occur anywhere".to_owned(),
                category: None,
                line: None,
            }
        );
    }

    #[test]
    fn complex_annotations() {
        let annotation =
            DiagnosticAnnotation::parse("^^ ERROR[E100] complex error description", 15, Some(14))
                .expect("should successfully parse complex annotation");

        assert_eq!(
            annotation,
            DiagnosticAnnotation {
                severity: Severity::Error,
                message: "complex error description".to_owned(),
                category: Some("E100".to_owned()),
                line: Some(13),
            }
        );

        // Test another complex case
        let annotation =
            DiagnosticAnnotation::parse("| WARNING[W200] previous line warning", 25, Some(24))
                .expect("should successfully parse complex pipe annotation");

        assert_eq!(
            annotation,
            DiagnosticAnnotation {
                severity: Severity::Warning,
                message: "previous line warning".to_owned(),
                category: Some("W200".to_owned()),
                line: Some(24),
            }
        );
    }

    #[test]
    fn whitespace_handling() {
        let annotation =
            DiagnosticAnnotation::parse("  ERROR   [E001]    spaced   message  ", 10, Some(9))
                .expect("should handle extra whitespace");

        assert_eq!(
            annotation,
            DiagnosticAnnotation {
                severity: Severity::Error,
                message: "spaced   message".to_owned(),
                category: Some("E001".to_owned()),
                line: Some(10),
            }
        );
    }

    #[test]
    fn unsupported_severity() {
        let error = DiagnosticAnnotation::parse("FAILURE not a supported severity", 10, Some(9))
            .expect_err("should fail to parse unsupported severity");

        assert_matches!(error, DiagnosticParseError::MissingSeverity);
    }

    #[test]
    fn incomplete_category() {
        let annotation = DiagnosticAnnotation::parse("ERROR[incomplete category", 10, Some(9))
            .expect("should parse even with incomplete category");

        assert_eq!(
            annotation,
            DiagnosticAnnotation {
                severity: Severity::Error,
                message: "[incomplete category".to_owned(),
                category: None,
                line: Some(10),
            }
        );
    }

    #[test]
    fn empty_message() {
        let annotation = DiagnosticAnnotation::parse("ERROR", 10, Some(9))
            .expect("should parse annotation with empty message");

        assert_eq!(
            annotation,
            DiagnosticAnnotation {
                severity: Severity::Error,
                message: String::new(),
                category: None,
                line: Some(10),
            }
        );
    }

    #[test]
    fn empty_category() {
        let annotation = DiagnosticAnnotation::parse("ERROR[] empty category", 10, Some(9))
            .expect("should parse annotation with empty category");

        assert_eq!(
            annotation,
            DiagnosticAnnotation {
                severity: Severity::Error,
                message: "empty category".to_owned(),
                category: None,
                line: Some(10),
            }
        );
    }
}
