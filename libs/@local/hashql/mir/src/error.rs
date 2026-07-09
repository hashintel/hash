use alloc::borrow::Cow;

use hashql_core::span::SpanId;
use hashql_diagnostics::{Diagnostic, DiagnosticCategory, DiagnosticIssues, Severity};

use crate::{
    pass::{
        execution::PlacementDiagnosticCategory, transform::error::TransformationDiagnosticCategory,
    },
    reify::ReifyDiagnosticCategory,
};

pub type MirDiagnostic<K = Severity> = Diagnostic<MirDiagnosticCategory, SpanId, K>;
pub type MirDiagnosticIssues<K = Severity> = DiagnosticIssues<MirDiagnosticCategory, SpanId, K>;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum MirDiagnosticCategory {
    Reify(ReifyDiagnosticCategory),
    Placement(PlacementDiagnosticCategory),
    Transformation(TransformationDiagnosticCategory),
}

impl DiagnosticCategory for MirDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("mir")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("MIR")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match self {
            Self::Reify(category) => Some(category),
            Self::Placement(category) => Some(category),
            Self::Transformation(category) => Some(category),
        }
    }
}
