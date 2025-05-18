use core::mem;

use hashql_core::span::SpanId;
use hashql_diagnostics::{
    Diagnostic,
    category::TerminalDiagnosticCategory,
    color::{AnsiColor, Color},
    label::Label,
    note::Note,
    severity::Severity,
};

use crate::{
    node::{
        expr::{Expr, ExprKind},
        path::Path,
        r#type::{Type, TypeKind},
    },
    visit::{Visitor, walk_expr, walk_path, walk_type},
};

pub(crate) type SpecialFormSanitizerDiagnostic =
    Diagnostic<SpecialFormSanitizerDiagnosticCategory, SpanId>;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum SpecialFormSanitizerDiagnosticCategory {
    NotSupported,
}

fn special_form_not_supported(span: SpanId) -> SpecialFormSanitizerDiagnostic {
    let mut diagnostic = Diagnostic::new(
        SpecialFormSanitizerDiagnosticCategory::NotSupported,
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

pub struct SpecialFormSanitizer {
    diagnostics: Vec<SpecialFormSanitizerDiagnostic>,
    handled_diagnostics: usize,
}

impl SpecialFormSanitizer {
    #[must_use]
    pub const fn new() -> Self {
        Self {
            diagnostics: Vec::new(),
            handled_diagnostics: 0,
        }
    }

    pub fn take_diagnostics(&mut self) -> Vec<SpecialFormSanitizerDiagnostic> {
        mem::take(&mut self.diagnostics)
    }

    fn fatal_diagnostics_count(&self) -> usize {
        self.diagnostics
            .iter()
            .filter(|diagnostic| diagnostic.severity.is_fatal())
            .count()
    }
}

impl Default for SpecialFormSanitizer {
    fn default() -> Self {
        Self::new()
    }
}

impl<'heap> Visitor<'heap> for SpecialFormSanitizer {
    fn visit_path(&mut self, path: &mut Path<'heap>) {
        if !path.starts_with_absolute_path(["kernel", "special_form"], false) {
            walk_path(self, path);
            return;
        }

        self.diagnostics.push(special_form_not_supported(path.span));
    }

    fn visit_expr(&mut self, expr: &mut Expr<'heap>) {
        walk_expr(self, expr);

        if matches!(expr.kind, ExprKind::Path(_)) {
            let fatal = self.fatal_diagnostics_count();
            if self.handled_diagnostics < fatal {
                expr.kind = ExprKind::Dummy;
                self.handled_diagnostics = fatal;
            }
        }
    }

    fn visit_type(&mut self, r#type: &mut Type<'heap>) {
        walk_type(self, r#type);

        if matches!(r#type.kind, TypeKind::Path(_)) {
            let fatal = self.fatal_diagnostics_count();
            if self.handled_diagnostics < fatal {
                r#type.kind = TypeKind::Dummy;
                self.handled_diagnostics = fatal;
            }
        }
    }
}
