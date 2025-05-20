use alloc::borrow::Cow;

use hashql_core::span::SpanId;
use hashql_diagnostics::{Diagnostic, category::DiagnosticCategory};

pub type ReificationDiagnostic = Diagnostic<ReificationDiagnosticCategory, SpanId>;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum ReificationDiagnosticCategory {}

impl DiagnosticCategory for ReificationDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("reify")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("Reification")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match *self {}
    }
}
