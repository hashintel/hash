use alloc::borrow::Cow;

use hashql_core::span::SpanId;
use hashql_diagnostics::{Diagnostic, category::DiagnosticCategory};

use super::{
    expander::error::ExpanderDiagnosticCategory, sanitizer::SanitizerDiagnosticCategory,
    type_extractor::error::TypeExtractorDiagnosticCategory,
};

pub type LoweringDiagnostic = Diagnostic<LoweringDiagnosticCategory, SpanId>;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum LoweringDiagnosticCategory {
    Expander(ExpanderDiagnosticCategory),
    Sanitizer(SanitizerDiagnosticCategory),

    Extractor(TypeExtractorDiagnosticCategory),
}

impl DiagnosticCategory for LoweringDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("lowering")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("Lowering")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match self {
            Self::Expander(expander) => Some(expander),
            Self::Sanitizer(sanitizer) => Some(sanitizer),
            Self::Extractor(extractor) => Some(extractor),
        }
    }
}
