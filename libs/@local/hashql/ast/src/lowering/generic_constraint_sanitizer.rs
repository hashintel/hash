use alloc::borrow::Cow;
use core::mem;

use hashql_core::span::SpanId;
use hashql_diagnostics::{
    Diagnostic,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
    help::Help,
    label::Label,
    note::Note,
    severity::Severity,
};

use crate::{
    node::{generic::GenericConstraint, path::PathSegmentArgument},
    visit::Visitor,
};

pub(crate) type GenericConstraintSanitizerDiagnostic =
    Diagnostic<GenericConstraintSanitizerDiagnosticCategory, SpanId>;

const INVALID_GENERIC_CONSTRAINT: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-generic-constraint",
    name: "Invalid generic constraint",
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum GenericConstraintSanitizerDiagnosticCategory {
    InvalidGenericConstraint,
}

impl DiagnosticCategory for GenericConstraintSanitizerDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("import-resolver")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("Import Resolver")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match self {
            Self::InvalidGenericConstraint => Some(&INVALID_GENERIC_CONSTRAINT),
        }
    }
}

fn invalid_generic_constraint(span: SpanId, name: &str) -> GenericConstraintSanitizerDiagnostic {
    let mut diagnostic = Diagnostic::new(
        GenericConstraintSanitizerDiagnosticCategory::InvalidGenericConstraint,
        Severity::ERROR,
    );

    diagnostic.labels.push(Label::new(
        span,
        format!("Generic constraint with bound is not allowed here"),
    ));

    diagnostic.help = Some(Help::new(format!(
        "Generic parameter '{name}' cannot have constraints in this context. Remove the \
         constraint."
    )));

    diagnostic.note = Some(Note::new(
        "Generic constraints with bounds are only allowed in certain positions like function \
         declarations.",
    ));

    diagnostic
}

pub struct GenericConstraintSanitizer {
    diagnostics: Vec<GenericConstraintSanitizerDiagnostic>,
}

impl GenericConstraintSanitizer {
    #[must_use]
    pub const fn new() -> Self {
        Self {
            diagnostics: Vec::new(),
        }
    }

    pub fn take_diagnostics(&mut self) -> Vec<GenericConstraintSanitizerDiagnostic> {
        mem::take(&mut self.diagnostics)
    }
}

impl<'heap> Visitor<'heap> for GenericConstraintSanitizer {
    fn visit_path_segment_argument(&mut self, argument: &mut PathSegmentArgument<'heap>) {
        if let PathSegmentArgument::Constraint(GenericConstraint {
            id,
            span,
            name,
            bound: bound @ Some(_),
        }) = argument
        {
            // Remove the bound for further processing
            *bound = None;

            todo!("emit diagnostic")
        }
    }
}

impl Default for GenericConstraintSanitizer {
    fn default() -> Self {
        Self::new()
    }
}
