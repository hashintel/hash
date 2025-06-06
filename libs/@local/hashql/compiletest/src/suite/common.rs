use core::fmt::{self, Display, Write as _};

use hashql_core::span::SpanId;
use hashql_diagnostics::{Diagnostic, category::DiagnosticCategory};

use super::SuiteDiagnostic;

/// Process diagnostics from a lowering step.
///
/// This will scan through all the reported diagnostics and
/// push them into the output vector. If a fatal diagnostic is found,
/// it will be returned as an error.
pub(crate) fn process_diagnostics<C>(
    output: &mut Vec<SuiteDiagnostic>,
    reported: impl IntoIterator<Item = Diagnostic<C, SpanId>>,
) -> Result<(), SuiteDiagnostic>
where
    C: DiagnosticCategory + 'static,
{
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

pub(crate) struct Header(&'static str);

impl Header {
    pub(crate) const fn new(title: &'static str) -> Self {
        Self(title)
    }
}

impl Display for Header {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        const HEADER: char = '\u{2550}';

        let len = self.0.len();

        for _ in 0..4 {
            fmt.write_char(HEADER)?;
        }

        write!(fmt, " {} ", self.0)?;

        let remaining = (80_usize - 4).saturating_sub(len + 2);

        for _ in 0..remaining {
            fmt.write_char(HEADER)?;
        }

        Ok(())
    }
}

// TODO: one for the items c:
