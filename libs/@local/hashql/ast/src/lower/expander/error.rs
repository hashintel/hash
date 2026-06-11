use alloc::borrow::Cow;

use hashql_core::span::SpanId;
use hashql_diagnostics::{Diagnostic, DiagnosticIssues, Severity, category::DiagnosticCategory};

pub(crate) type ExpanderDiagnostic<K = Severity> =
    Diagnostic<ExpanderDiagnosticCategory, SpanId, K>;

pub(crate) type ExpanderDiagnosticIssues<K = Severity> =
    DiagnosticIssues<ExpanderDiagnosticCategory, SpanId, K>;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum ExpanderDiagnosticCategory {}

impl DiagnosticCategory for ExpanderDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        match *self {}
    }

    fn name(&self) -> Cow<'_, str> {
        match *self {}
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match *self {}
    }
}
