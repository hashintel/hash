use alloc::borrow::Cow;

use hashql_core::span::SpanId;
use hashql_diagnostics::{Diagnostic, category::DiagnosticCategory};

pub(crate) type ResolveNamesDiagnostic = Diagnostic<ResolveNamesDiagnosticCategory, SpanId>;

pub enum ResolveNamesDiagnosticCategory {}

impl DiagnosticCategory for ResolveNamesDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("resolve-names")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("Resolve Names")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match *self {}
    }
}
