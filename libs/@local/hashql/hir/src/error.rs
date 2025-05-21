use alloc::borrow::Cow;

use hashql_core::span::SpanId;
use hashql_diagnostics::{Diagnostic, category::DiagnosticCategory};

use crate::reify::error::ReificationDiagnosticCategory;

pub type HirDiagnostic = Diagnostic<HirDiagnosticCategory, SpanId>;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum HirDiagnosticCategory {
    Reification(ReificationDiagnosticCategory),
}

impl DiagnosticCategory for HirDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("hir")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("HIR")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match self {
            Self::Reification(reify) => Some(reify),
        }
    }
}
