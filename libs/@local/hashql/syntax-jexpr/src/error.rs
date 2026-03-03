use alloc::borrow::Cow;

use hashql_core::span::SpanId;
use hashql_diagnostics::{Diagnostic, category::DiagnosticCategory};

use crate::parser::error::ParserDiagnosticCategory;

pub type JExprDiagnostic = Diagnostic<JExprDiagnosticCategory, SpanId>;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum JExprDiagnosticCategory {
    Parser(ParserDiagnosticCategory),
}

impl DiagnosticCategory for JExprDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("jexpr")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("J-Expr syntax")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match self {
            Self::Parser(parser) => Some(parser),
        }
    }
}

/// Extension trait for changing diagnostic categories in results.
pub(crate) trait ResultExt {
    type Ok;
    type DiagnosticCategory;
    type Span;

    /// Transforms the diagnostic category of an error while preserving the rest of the diagnostic.
    fn change_category<C>(
        self,
        category: impl FnOnce(Self::DiagnosticCategory) -> C,
    ) -> Result<Self::Ok, Diagnostic<C, Self::Span>>;
}

impl<T, C, S> ResultExt for Result<T, Diagnostic<C, S>> {
    type DiagnosticCategory = C;
    type Ok = T;
    type Span = S;

    fn change_category<D>(
        self,
        category: impl FnOnce(Self::DiagnosticCategory) -> D,
    ) -> Result<T, Diagnostic<D, Self::Span>> {
        self.map_err(|diagnostic| diagnostic.map_category(category))
    }
}
