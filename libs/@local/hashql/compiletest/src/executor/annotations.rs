use core::iter;

use anstream::adapter::strip_str;
use error_stack::{Report, ReportSink};
use hashql_diagnostics::{
    category::canonical_category_name, help::Help, label::Label, note::Note,
    span::AbsoluteDiagnosticSpan,
};
use line_index::{LineCol, LineIndex};

use super::{TrialError, render_diagnostic};
use crate::{annotation::diagnostic::DiagnosticAnnotation, suite::ResolvedSuiteDiagnostic};

fn filter_labels<'label>(
    line_index: &LineIndex,
    line_number: u32,
    labels: &'label [Label<AbsoluteDiagnosticSpan>],
) -> impl IntoIterator<Item = &'label Label<AbsoluteDiagnosticSpan>> {
    labels.iter().filter(move |label| {
        let range = label.span().range();

        let LineCol {
            line: start,
            col: _,
        } = line_index.line_col(range.start());
        let LineCol { line: end, col: _ } = line_index.line_col(range.end());

        (start + 1) == line_number || (end + 1) == line_number
    })
}

pub(crate) fn verify_annotations(
    source: &str,
    line_index: &LineIndex,
    diagnostics: &[ResolvedSuiteDiagnostic],
    annotations: &[DiagnosticAnnotation],
    sink: &mut ReportSink<TrialError>,
) {
    // We cannot clone diagnostics here, because of the fact that they are not `Clone` due to
    // the `dyn Trait`.
    let mut visited = vec![false; diagnostics.len()];

    // Go through every annotation and see if there is a corresponding diagnostic
    for annotation in annotations {
        let query = annotation.message.as_str();

        let matches: Vec<_> = diagnostics
            .iter()
            .enumerate()
            .filter(
                // 1) Find all diagnostics that haven't been visited yet
                |&(index, _)| !visited[index],
            )
            .filter_map(|(index, diagnostic)| {
                // 2) From the candidates, find the ones that have matching line number
                let Some(line_number) = annotation.line else {
                    return Some((index, diagnostic, diagnostic.labels.iter().collect()));
                };

                let labels: Vec<_> = filter_labels(line_index, line_number, &diagnostic.labels)
                    .into_iter()
                    .collect();

                if labels.is_empty() {
                    return None;
                }

                Some((index, diagnostic, labels))
            })
            .filter(|(_, diagnostic, labels)| {
                // 3) From the candidates find if there is a matching string in either:
                // - the labels on the same line
                // - the help
                // - the note
                // - the canonical name
                let canonical_name = canonical_category_name(&diagnostic.category).to_string();

                let mut sources = labels
                    .iter()
                    .map(|label| label.message())
                    .chain(diagnostic.help.iter().map(Help::message))
                    .chain(diagnostic.notes.iter().map(Note::message))
                    .chain(iter::once(canonical_name.as_str()))
                    .map(|value| strip_str(value).to_string());

                sources.any(|source| source.contains(query))
            })
            .filter(|(_, diagnostic, _)| {
                // 4) Find if all the other expectations are fulfilled
                // - severity
                // - category
                let severity_matches = annotation.severity == diagnostic.severity;

                let category_matches = annotation.category.as_ref().is_none_or(|category| {
                    let diagnostic_id =
                        hashql_diagnostics::category::canonical_category_id(&diagnostic.category)
                            .to_string();

                    *category == diagnostic_id
                });

                severity_matches && category_matches
            })
            .collect();

        if matches.is_empty() {
            sink.append(Report::new(TrialError::UnfulfilledAnnotation(
                annotation.clone(),
            )));
            continue;
        }

        // if we have multiple matches, simply choose the first one
        let &(index, _, _) = &matches[0];
        visited[index] = true;
    }

    let unmatched = visited
        .into_iter()
        .enumerate()
        .filter(|&(_, visited)| !visited)
        .map(|(index, _)| &diagnostics[index]);

    for diagnostic in unmatched {
        let diagnostic = render_diagnostic(source, diagnostic);
        sink.append(Report::new(TrialError::UnexpectedDiagnostic(diagnostic)));
    }
}

#[cfg(test)]
mod tests {
    use core::assert_matches::assert_matches;

    use error_stack::ReportSink;
    use hashql_diagnostics::{
        Diagnostic,
        category::{DiagnosticCategory, TerminalDiagnosticCategory},
        label::Label,
        severity::Severity,
    };
    use line_index::{LineIndex, TextRange};

    use super::*;

    // Helper to create test spans
    fn make_span(start: u32, end: u32) -> AbsoluteDiagnosticSpan {
        AbsoluteDiagnosticSpan::from_range(TextRange::new(start.into(), end.into()))
    }

    // Helper to create a simple diagnostic for testing
    fn make_diagnostic(
        category: &'static str,
        severity: Severity,
        message: &'static str,
        span: AbsoluteDiagnosticSpan,
    ) -> ResolvedSuiteDiagnostic {
        let mock_category = TerminalDiagnosticCategory {
            id: category,
            name: category,
        };

        let mut diagnostic = Diagnostic::new(
            Box::new(mock_category) as Box<dyn DiagnosticCategory>,
            severity,
        );

        diagnostic.labels.push(Label::new(span, message));

        diagnostic
    }

    // Helper to create an annotation
    fn make_annotation(
        message: &str,
        line: Option<u32>,
        severity: Severity,
    ) -> DiagnosticAnnotation {
        DiagnosticAnnotation {
            message: message.to_owned(),
            line,
            severity,
            category: None,
        }
    }

    #[test]
    fn basic_match() {
        let source = "line1\nline2\nline3\nline4";
        let line_index = LineIndex::new(source);

        let diagnostics = vec![make_diagnostic(
            "test",
            Severity::Error,
            "test error",
            make_span(6, 11),
        ) /* spans "line2" */];

        let annotations = vec![
            make_annotation("error", Some(2), Severity::Error), // matches line2
        ];

        let mut sink = ReportSink::<TrialError>::new();

        verify_annotations(source, &line_index, &diagnostics, &annotations, &mut sink);

        let result = sink.finish();

        println!("{result:?}");

        // Test should pass - no errors reported
        assert!(result.is_ok(), "Expected no errors");
    }

    #[test]
    fn unmatched_annotation() {
        let source = "line1\nline2\nline3";
        let line_index = LineIndex::new(source);

        let diagnostics = vec![make_diagnostic(
            "test",
            Severity::Error,
            "test error",
            make_span(0, 5),
        ) /* spans "line1" */];

        let annotations = vec![
            make_annotation("warning", Some(2), Severity::Warning), // doesn't match
        ];

        let mut sink = ReportSink::<TrialError>::new();

        verify_annotations(source, &line_index, &diagnostics, &annotations, &mut sink);

        let report = sink.finish().expect_err("should have errored out");
        let context: Vec<_> = report.current_contexts().collect();

        assert_eq!(context.len(), 2, "Expected one error");
        assert_matches!(&context[0], TrialError::UnexpectedDiagnostic(_));
        assert_matches!(&context[1], TrialError::UnfulfilledAnnotation(_));
    }

    #[test]
    fn unexpected_diagnostic() {
        let source = "line1\nline2\nline3";
        let line_index = LineIndex::new(source);

        let diagnostics = vec![make_diagnostic(
            "test",
            Severity::Error,
            "test error",
            make_span(0, 5),
        ) /* spans "line1" */];

        // No annotations - should report the diagnostic as unexpected
        let annotations = vec![];

        let mut sink = ReportSink::<TrialError>::new();

        verify_annotations(source, &line_index, &diagnostics, &annotations, &mut sink);

        let report = sink.finish().expect_err("should have errored out");
        let context: Vec<_> = report.current_contexts().collect();

        assert_eq!(context.len(), 1, "Expected one error");
        assert_matches!(&context[0], TrialError::UnexpectedDiagnostic(_));
    }

    #[test]
    fn multiple_matching_diagnostics() {
        let source = "line1\nline2\nline3";
        let line_index = LineIndex::new(source);

        let diagnostics = vec![
            make_diagnostic("test1", Severity::Error, "first error", make_span(0, 5)), // line1
            make_diagnostic("test2", Severity::Error, "second error", make_span(6, 11)), // line2
        ];

        let annotations = vec![
            make_annotation("error", Some(1), Severity::Error), // matches first diagnostic
        ];

        let mut sink = ReportSink::<TrialError>::new();

        verify_annotations(source, &line_index, &diagnostics, &annotations, &mut sink);

        let report = sink.finish().expect_err("should have errored out");
        let context: Vec<_> = report.current_contexts().collect();

        assert_eq!(context.len(), 1, "Expected one error");
        assert_matches!(&context[0], TrialError::UnexpectedDiagnostic(_));
    }

    #[test]
    fn two_diagnostics_same_position_one_annotation() {
        let source = "line1\nline2\nline3";
        let line_index = LineIndex::new(source);

        // Create two diagnostics at the same line with similar messages
        let diagnostics = vec![
            make_diagnostic("test1", Severity::Error, "error in line1", make_span(0, 5)), // line1
            make_diagnostic(
                "test2",
                Severity::Error,
                "another error in line1",
                make_span(0, 5),
            ), /* also line1 */
        ];

        // Only one annotation for the line
        let annotations = vec![
            make_annotation("error", Some(1), Severity::Error), // matches both diagnostics
        ];

        let mut sink = ReportSink::<TrialError>::new();

        verify_annotations(source, &line_index, &diagnostics, &annotations, &mut sink);

        // Should report one of the diagnostics as unexpected
        let report = sink.finish().expect_err("should have errored out");
        let contexts: Vec<_> = report.current_contexts().collect();

        assert_eq!(contexts.len(), 1, "Expected one error");
        assert_matches!(&contexts[0], TrialError::UnexpectedDiagnostic(diagnostic) if diagnostic.contains("another error in line1"));
    }

    #[test]
    fn filter_labels_by_line() {
        let source = "line1\nline2\nline3";
        let line_index = LineIndex::new(source);

        let labels = vec![
            Label::new(make_span(0, 5), "label on line 1"), // line1
            Label::new(make_span(6, 11), "label on line 2"), // line2
            Label::new(make_span(12, 17), "label on line 3"), // line3
        ];

        // Filter for line 1 (1-indexed)
        let filtered: Vec<_> = filter_labels(&line_index, 1, &labels).into_iter().collect();

        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].message(), "label on line 1");
    }
}
