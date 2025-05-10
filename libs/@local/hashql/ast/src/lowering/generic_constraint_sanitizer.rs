use alloc::borrow::Cow;
use core::mem;

use hashql_core::{span::SpanId, symbol::Symbol};
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
        Cow::Borrowed("generic-constraint-sanitizer")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("Generic Constraint Sanitizer")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match self {
            Self::InvalidGenericConstraint => Some(&INVALID_GENERIC_CONSTRAINT),
        }
    }
}

fn invalid_generic_constraint(span: SpanId, name: Symbol) -> GenericConstraintSanitizerDiagnostic {
    let mut diagnostic = Diagnostic::new(
        GenericConstraintSanitizerDiagnosticCategory::InvalidGenericConstraint,
        Severity::ERROR,
    );

    diagnostic.labels.push(
        Label::new(
            span,
            format!("Remove this constraint from generic parameter '{name}'"),
        )
        .with_order(0),
    );

    diagnostic.help = Some(Help::new(format!(
        "Generic constraints (like '{name}: Bound') are not allowed in this context. Use just the \
         generic parameter name without bounds: '{name}'."
    )));

    diagnostic.note = Some(Note::new(
        "Generic constraints with bounds can only be used in certain positions such as function \
         declarations, type declarations and newtype declarations",
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
            id: _,
            span,
            name,
            bound: bound @ Some(_),
        }) = argument
        {
            // Remove the bound for further processing
            *bound = None;

            self.diagnostics
                .push(invalid_generic_constraint(*span, name.value));
        }
    }
}

impl Default for GenericConstraintSanitizer {
    fn default() -> Self {
        Self::new()
    }
}
