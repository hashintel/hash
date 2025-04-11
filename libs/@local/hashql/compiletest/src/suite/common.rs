use hashql_core::span::SpanId;
use hashql_diagnostics::{Diagnostic, category::DiagnosticCategory};

use super::SuiteDiagnostic;

pub(crate) fn process_diagnostics<C>(
    output: &mut Vec<SuiteDiagnostic>,
    reported: impl IntoIterator<Item = Diagnostic<C, SpanId>>,
) -> Result<(), SuiteDiagnostic>
where
    C: DiagnosticCategory + 'static,
{
    // Find if there's a diagnostic that's fatal
    let mut fatal = None;

    for diagnostic in reported {
        let diagnostic = diagnostic.boxed();

        if fatal.is_none() && diagnostic.severity.is_fatal() {
            fatal = Some(diagnostic);
            continue;
        }

        output.push(diagnostic);
    }

    fatal.map_or(Ok(()), Err)
}
