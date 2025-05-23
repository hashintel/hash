use alloc::borrow::Cow;
use core::mem;

use hashql_core::{module::Universe, span::SpanId, symbol::Symbol};
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
        Severity::Error,
    );

    diagnostic.labels.push(
        Label::new(span, format!("Remove this constraint from '{name}'"))
            .with_order(0)
            .with_color(Color::Ansi(AnsiColor::Red)),
    );

    diagnostic.add_help(Help::new(format!(
        "Generic constraints (like '{name}: Bound') are not allowed in this context. Use just the \
         parameter name without bounds: '{name}'. For example, change 'T: Clone' to just 'T'."
    )));

    diagnostic.add_note(Note::new(
        "Generic constraints with bounds can only be used in certain positions such as function \
         declarations, type declarations and newtype declarations. In other contexts, like usage \
         sites, only the parameter name should be specified.",
    ));

    diagnostic
}
fn special_form_not_supported(path: &Path, universe: Universe) -> SanitizerDiagnostic {
    let mut diagnostic = Diagnostic::new(
        SanitizerDiagnosticCategory::InvalidSpecialForm,
        Severity::Error,
    );

    // Primary label - the direct issue with context-specific message
    let label_message = match universe {
        Universe::Value => "Special form cannot be used as a value",
        Universe::Type => "Special form cannot be used as a type",
    };

    diagnostic.labels.push(
        Label::new(path.span, label_message)
            .with_order(0)
            .with_color(Color::Ansi(AnsiColor::Red)),
    );

    // Form the special form name for display
    let special_form = path
        .segments
        .last()
        .unwrap_or_else(|| unreachable!())
        .name
        .value;

    // Customize help message based on universe
    let context = match universe {
        Universe::Value => "value expression",
        Universe::Type => "type annotation or declaration",
    };

    diagnostic.add_help(Help::new(format!(
        "The special form '{special_form}' must be called directly with arguments. It cannot be \
         used as a {context} or passed to other functions. Instead, use it in a direct function \
         call syntax.",
    )));

    diagnostic.add_note(Note::new(
        "Special forms in HashQL are compile-time constructs that must be expanded during \
         compilation. They can only be used in call position with their expected arguments, not \
         as regular values, types, or function references.",
    ));

    diagnostic
}

pub struct Sanitizer {
    diagnostics: Vec<SanitizerDiagnostic>,
    universe: Universe,

    special_form_diagnostics: usize,
    handled_special_form_diagnostics: usize,
}

impl Sanitizer {
    #[must_use]
    pub const fn new() -> Self {
        Self {
            diagnostics: Vec::new(),
            universe: Universe::Value,

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

        self.diagnostics
            .push(special_form_not_supported(path, self.universe));
        self.special_form_diagnostics += 1;
    }

    fn visit_expr(&mut self, expr: &mut Expr<'heap>) {
        let previous = self.universe;
        self.universe = Universe::Value;
        walk_expr(self, expr);
        self.universe = previous;

        if matches!(expr.kind, ExprKind::Path(_))
            && self.handled_special_form_diagnostics < self.special_form_diagnostics
        {
            expr.kind = ExprKind::Dummy;
            self.handled_special_form_diagnostics = self.special_form_diagnostics;
        }
    }

    fn visit_type(&mut self, r#type: &mut Type<'heap>) {
        let previous = self.universe;
        self.universe = Universe::Type;
        walk_type(self, r#type);
        self.universe = previous;

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
