use alloc::borrow::Cow;

use hashql_core::span::SpanId;
use hashql_diagnostics::{Diagnostic, category::DiagnosticCategory};

pub(crate) type StringDiagnostic = Diagnostic<StringDiagnosticCategory, SpanId>;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum StringDiagnosticCategory {}

impl DiagnosticCategory for StringDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("string")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("String")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match *self {}
    }
}
