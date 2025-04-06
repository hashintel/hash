use alloc::borrow::Cow;

use hashql_core::span::SpanId;
use hashql_diagnostics::{Diagnostic, category::DiagnosticCategory};

pub type AstDiagnostic = Diagnostic<AstDiagnosticCategory, SpanId>;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum AstDiagnosticCategory {}

impl DiagnosticCategory for AstDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("ast")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("AST")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match *self {}
    }
}
