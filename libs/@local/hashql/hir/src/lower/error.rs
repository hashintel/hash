use alloc::borrow::Cow;

use hashql_core::span::SpanId;
use hashql_diagnostics::{Diagnostic, category::DiagnosticCategory};

pub type LoweringDiagnostic = Diagnostic<LoweringDiagnosticCategory, SpanId>;

#[expect(clippy::empty_enum)]
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum LoweringDiagnosticCategory {}

impl DiagnosticCategory for LoweringDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("lower")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("Lowering")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        unreachable!()
    }
}
