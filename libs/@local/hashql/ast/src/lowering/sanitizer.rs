use alloc::borrow::Cow;
use core::mem;

use hashql_core::{span::SpanId, symbol::Symbol};
use hashql_diagnostics::{
    Diagnostic,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
    color::{AnsiColor, Color},
    help::Help,
    label::Label,
    note::Note,
    severity::Severity,
};

use crate::{
    node::{
        expr::{Expr, ExprKind},
        generic::GenericConstraint,
        path::{Path, PathSegmentArgument},
        r#type::{Type, TypeKind},
    },
    visit::{Visitor, walk_expr, walk_path, walk_type},
};

pub(crate) type SanitizerDiagnostic = Diagnostic<SanitizerDiagnosticCategory, SpanId>;

const INVALID_GENERIC_CONSTRAINT: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-generic-constraint",
    name: "Invalid generic constraint",
};

const INVALID_SPECIAL_FORM: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-special-form",
    name: "Invalid special form",
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum SanitizerDiagnosticCategory {
    InvalidGenericConstraint,
    InvalidSpecialForm,
}

impl DiagnosticCategory for SanitizerDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("sanitizer")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("Sanitizer")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match self {
            Self::InvalidGenericConstraint => Some(&INVALID_GENERIC_CONSTRAINT),
            Self::InvalidSpecialForm => Some(&INVALID_SPECIAL_FORM),
        }
    }
}

fn invalid_generic_constraint(span: SpanId, name: Symbol) -> SanitizerDiagnostic {
    let mut diagnostic = Diagnostic::new(
        SanitizerDiagnosticCategory::InvalidGenericConstraint,
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

fn special_form_not_supported(span: SpanId) -> SanitizerDiagnostic {
    let mut diagnostic = Diagnostic::new(
        SanitizerDiagnosticCategory::InvalidSpecialForm,
        Severity::ERROR,
    );

    diagnostic.labels.push(
        Label::new(span, "This special form could not be expanded")
            .with_color(Color::Ansi(AnsiColor::Red)),
    );

    diagnostic.note = Some(Note::new(
        "You have used a special form function in a place where it couldn't be evaluated and \
         expanded, such as a value position. Special forms must always be called as a function \
         with arguments, as cannot be used as a value.",
    ));

    diagnostic
}

pub struct Sanitizer {
    diagnostics: Vec<SanitizerDiagnostic>,

    special_form_diagnostics: usize,
    handled_special_form_diagnostics: usize,
}

impl Sanitizer {
    #[must_use]
    pub const fn new() -> Self {
        Self {
            diagnostics: Vec::new(),
            special_form_diagnostics: 0,
            handled_special_form_diagnostics: 0,
        }
    }

    pub fn take_diagnostics(&mut self) -> Vec<SanitizerDiagnostic> {
        mem::take(&mut self.diagnostics)
    }
}

impl<'heap> Visitor<'heap> for Sanitizer {
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

    fn visit_path(&mut self, path: &mut Path<'heap>) {
        walk_path(self, path);

        if !path.starts_with_absolute_path(["kernel", "special_form"], false) {
            return;
        }

        self.diagnostics.push(special_form_not_supported(path.span));
        self.special_form_diagnostics += 1;
    }

    fn visit_expr(&mut self, expr: &mut Expr<'heap>) {
        walk_expr(self, expr);

        if matches!(expr.kind, ExprKind::Path(_))
            && self.handled_special_form_diagnostics < self.special_form_diagnostics
        {
            expr.kind = ExprKind::Dummy;
            self.handled_special_form_diagnostics = self.special_form_diagnostics;
        }
    }

    fn visit_type(&mut self, r#type: &mut Type<'heap>) {
        walk_type(self, r#type);

        if matches!(r#type.kind, TypeKind::Path(_))
            && self.handled_special_form_diagnostics < self.special_form_diagnostics
        {
            r#type.kind = TypeKind::Dummy;
            self.handled_special_form_diagnostics = self.special_form_diagnostics;
        }
    }
}

impl Default for Sanitizer {
    fn default() -> Self {
        Self::new()
    }
}
