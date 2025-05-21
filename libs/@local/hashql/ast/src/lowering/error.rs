use alloc::borrow::Cow;

use hashql_core::span::SpanId;
use hashql_diagnostics::{Diagnostic, category::DiagnosticCategory};

use super::{
    import_resolver::error::ImportResolverDiagnosticCategory,
    sanitizer::SanitizerDiagnosticCategory,
    special_form_expander::error::SpecialFormExpanderDiagnosticCategory,
    type_extractor::error::TypeExtractorDiagnosticCategory,
};

pub type LoweringDiagnostic = Diagnostic<LoweringDiagnosticCategory, SpanId>;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum LoweringDiagnosticCategory {
    Expander(SpecialFormExpanderDiagnosticCategory),
    Sanitizer(SanitizerDiagnosticCategory),
    Resolver(ImportResolverDiagnosticCategory),
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
            Self::Expander(special_form) => Some(special_form),
            Self::Sanitizer(sanitizer) => Some(sanitizer),
            Self::Resolver(resolver) => Some(resolver),
            Self::Extractor(extractor) => Some(extractor),
        }
    }
}
