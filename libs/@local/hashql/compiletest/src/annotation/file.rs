use core::{
    error,
    str::pattern::{Pattern as _, Searcher as _},
};
use std::io::{self, BufRead};

use super::{
    diagnostic::{DiagnosticAnnotation, DiagnosticParseError},
    directive::{Directive, DirectiveParseError},
};

/// Errors that can occur when parsing file annotations.
#[derive(Debug, derive_more::Display)]
pub(crate) enum FileAnnotationError {
    /// Error reading from the file.
    Io(io::Error),

    /// Error parsing a directive.
    #[display("failed to parse directive at line {line}: {error}")]
    Directive {
        line: u32,
        error: DirectiveParseError,
    },

    /// Error parsing a diagnostic annotation.
    #[display("failed to parse diagnostic annotation at line {line}: {error}")]
    Diagnostic {
        line: u32,
        error: DiagnosticParseError,
    },
}

impl error::Error for FileAnnotationError {}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct FileAnnotations {
    pub diagnostics: Vec<DiagnosticAnnotation>,
    pub directive: Directive,
}

impl FileAnnotations {
    pub(crate) fn new(name: impl Into<String>) -> Self {
        Self {
            diagnostics: Vec::new(),
            directive: Directive::new(name),
        }
    }

    /// Parses a file for annotations, extracting directives and diagnostic annotations.
    ///
    /// # Arguments
    ///
    /// * `reader` - The reader providing file content
    /// * `load_diagnostics` - Whether to load diagnostic annotations or just directives
    ///
    /// # Errors
    ///
    /// - [`Io`] if reading from the file fails
    /// - [`Directive`] if parsing a directive fails
    /// - [`Diagnostic`] if parsing a diagnostic annotation fails
    ///
    /// [`Io`]: FileAnnotationError::Io
    /// [`Directive`]: FileAnnotationError::Directive
    /// [`Diagnostic`]: FileAnnotationError::Diagnostic
    pub(crate) fn parse_file(
        &mut self,
        mut reader: impl BufRead,
        load_diagnostics: bool,
    ) -> Result<(), FileAnnotationError> {
        // First read directives at the beginning of the file
        // Then find diagnostic annotations throughout the rest of the file

        let mut line = String::new();
        let mut line_number = 0;

        // First, process directives at the beginning of the file
        loop {
            line_number += 1;
            line.clear();

            if reader
                .read_line(&mut line)
                .map_err(FileAnnotationError::Io)?
                == 0
            {
                break;
            }

            let trimmed = line.trim_start();
            let Some(after_marker) = trimmed.strip_prefix(Directive::MARKER) else {
                // No more directives at the beginning
                break;
            };

            self.directive
                .parse(after_marker)
                .map_err(|error| FileAnnotationError::Directive {
                    line: line_number,
                    error,
                })?;
        }

        if !load_diagnostics {
            return Ok(());
        }

        // Now we've already read the first non-directive line, check it for diagnostic annotations
        let mut last_annotation_line_number = None;

        // Process the current line (first non-directive) for diagnostic annotations
        process_line_for_diagnostics(
            &line,
            line_number,
            &mut last_annotation_line_number,
            &mut self.diagnostics,
        )?;

        // Continue with the rest of the file
        loop {
            line.clear();
            if reader
                .read_line(&mut line)
                .map_err(FileAnnotationError::Io)?
                == 0
            {
                break; // End of file
            }

            line_number += 1;

            process_line_for_diagnostics(
                &line,
                line_number,
                &mut last_annotation_line_number,
                &mut self.diagnostics,
            )?;
        }

        Ok(())
    }
}

/// Helper function to process a line for diagnostic annotations.
#[expect(clippy::string_slice)]
fn process_line_for_diagnostics(
    line: &str,
    line_number: u32,
    last_annotation_line_number: &mut Option<u32>,
    diagnostics: &mut Vec<DiagnosticAnnotation>,
) -> Result<(), FileAnnotationError> {
    let mut searcher = DiagnosticAnnotation::MARKER.into_searcher(line);

    if let Some((_, end)) = searcher.next_match() {
        let annotation =
            DiagnosticAnnotation::parse(&line[end..], line_number, *last_annotation_line_number)
                .map_err(|error| FileAnnotationError::Diagnostic {
                    line: line_number,
                    error,
                })?;

        *last_annotation_line_number = annotation.line;
        diagnostics.push(annotation);
    } else {
        // No annotation on this line
        *last_annotation_line_number = None;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use core::assert_matches;
    use std::io::Cursor;

    use crate::annotation::{
        directive::Directive,
        file::{FileAnnotationError, FileAnnotations},
    };

    #[test]
    fn parse_empty_file() {
        let mut annotations = FileAnnotations::new("test");
        let result = annotations.parse_file(Cursor::new(""), true);

        assert!(result.is_ok(), "should successfully parse an empty file");
        assert!(annotations.diagnostics.is_empty());
    }

    #[test]
    fn parse_directives_only() {
        let content = "//@run: pass\n//@run: skip\n\n// Normal comment\ncode line";

        let mut annotations = FileAnnotations::new("test");
        annotations
            .parse_file(Cursor::new(content), false)
            .expect("should successfully parse directives");

        // The last directive should take precedence
        assert_eq!(annotations.directive, {
            let mut directive = Directive::new("test");
            directive
                .parse("run: skip")
                .expect("should parse directive");
            directive
        });
        assert!(
            annotations.diagnostics.is_empty(),
            "should not load diagnostics when load_diagnostics is false"
        );
    }

    #[test]
    fn parse_directives_only_with_diagnostic_in_code() {
        let content = "//@run: skip\n\n// Normal code\nlet x = 5; //~ ERROR variable not \
                       used\nfunction(); //~ WARNING function deprecated";

        let mut annotations = FileAnnotations::new("test");
        annotations
            .parse_file(Cursor::new(content), false)
            .expect("should successfully parse directives");

        assert_eq!(
            annotations.directive,
            {
                let mut directive = Directive::new("test");
                directive
                    .parse("run: skip")
                    .expect("should parse directive");
                directive
            },
            "should parse directives only"
        );
        assert!(
            annotations.diagnostics.is_empty(),
            "should not load diagnostics when load_diagnostics is false"
        );
    }

    #[test]
    fn parse_directives_and_diagnostics() {
        let content = "\
            //@run: pass\n\n// Normal code\nlet x = 5; //~ ERROR variable not used\nfunction(); \
                       //~ WARNING function deprecated";

        let mut annotations = FileAnnotations::new("test");
        annotations
            .parse_file(Cursor::new(content), true)
            .expect("should successfully parse directives and diagnostics");

        assert_eq!(
            annotations.diagnostics.len(),
            2,
            "should find two diagnostic annotations"
        );
    }

    #[test]
    fn parse_invalid_directive() {
        let content = "//@invalid: directive\n";

        let mut annotations = FileAnnotations::new("test");
        let error = annotations
            .parse_file(Cursor::new(content), true)
            .expect_err("should fail with invalid directive");

        assert_matches!(error, FileAnnotationError::Directive { line: 1, error: _ });
    }

    #[test]
    fn parse_invalid_diagnostic() {
        let content = "\
            //@run: fail\n\ncode line //~ INVALID diagnostic";

        let mut annotations = FileAnnotations::new("test");
        let error = annotations
            .parse_file(Cursor::new(content), true)
            .expect_err("should fail with invalid diagnostic");

        assert_matches!(error, FileAnnotationError::Diagnostic { line: 3, error: _ });
    }

    #[test]
    fn parse_mixed_content() {
        let content = "\
            //@run: fail\n\n// Code with comments\nlet x = 5; //~ ERROR variable not used\n// More \
                       comments\nfunction(); //~ WARNING function deprecated\n\n// Non-annotation \
                       comments\n";

        let mut annotations = FileAnnotations::new("test");
        annotations
            .parse_file(Cursor::new(content), true)
            .expect("should successfully parse mixed content");

        assert_eq!(
            annotations.diagnostics.len(),
            2,
            "should find two diagnostic annotations"
        );
    }

    #[test]
    fn directives_must_be_at_beginning() {
        let content = "\
            // Some comment\n//@run: fail\ncode line";

        let mut annotations = FileAnnotations::new("test");
        annotations
            .parse_file(Cursor::new(content), true)
            .expect("should parse successfully");

        // The directive should be ignored since it's not at the beginning
        assert_eq!(annotations.directive, Directive::new("test"));
    }
}
