use core::iter;

use error_stack::{Report, ReportSink};
use hashql_core::span::node::SpanNode;
use hashql_diagnostics::{
    category::canonical_category_name,
    help::Help,
    label::Label,
    note::Note,
    span::{AbsoluteDiagnosticSpan, DiagnosticSpan},
};
use hashql_syntax_jexpr::span::Span;
use line_index::{LineCol, LineIndex};

use super::{TrialError, render_diagnostic};
use crate::{annotation::diagnostic::DiagnosticAnnotation, suite::ResolvedSuiteDiagnostic};

fn filter_labels<'label>(
    line_index: &LineIndex,
    line_number: u32,
    labels: &'label [Label<SpanNode<Span>>],
) -> impl IntoIterator<Item = &'label Label<SpanNode<Span>>> {
    labels.iter().filter(move |label| {
        let absolute_span = AbsoluteDiagnosticSpan::new(label.span(), &mut |span: &Span| {
            DiagnosticSpan::from(span)
        });
        let range = absolute_span.range();

        let LineCol {
            line: start,
            col: _,
        } = line_index.line_col(range.start());
        let LineCol { line: end, col: _ } = line_index.line_col(range.end());

        start == line_number || end == line_number
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
                    .chain(diagnostic.help.as_ref().map(Help::message))
                    .chain(diagnostic.note.as_ref().map(Note::message))
                    .chain(iter::once(canonical_name.as_str()));

                sources.any(|source| source.contains(query))
            })
            .filter(|(_, diagnostic, _)| {
                // 4) Find if all the other expectations are fulfilled
                // - severity
                // - category
                let severity_matches = annotation.severity == *diagnostic.severity;

                let category_matches = annotation.category.as_ref().is_some_and(|category| {
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
