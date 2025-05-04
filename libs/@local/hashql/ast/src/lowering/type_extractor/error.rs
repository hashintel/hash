use std::borrow::Cow;

use hashql_core::span::SpanId;
use hashql_diagnostics::{Diagnostic, category::DiagnosticCategory};

pub(crate) type TypeExtractorDiagnostic = Diagnostic<TypeExtractorDiagnosticCategory, SpanId>;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum TypeExtractorDiagnosticCategory {}

impl DiagnosticCategory for TypeExtractorDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("type-extractor")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("Type Extractor")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        todo!()
    }
}
