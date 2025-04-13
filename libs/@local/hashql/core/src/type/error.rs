use alloc::borrow::Cow;

use hashql_diagnostics::{
    Diagnostic,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
    help::Help,
    label::Label,
    note::Note,
    severity::Severity,
};

use super::{Type, pretty_print::PrettyPrint};
use crate::{arena::Arena, span::SpanId};

pub type TypeCheckDiagnostic = Diagnostic<TypeCheckDiagnosticCategory, SpanId>;

const TYPE_MISMATCH: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "type-mismatch",
    name: "Type mismatch",
};

const CIRCULAR_TYPE: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "circular-type",
    name: "Circular type reference",
};

const EXPECTED_NEVER: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "expected-never",
    name: "Expected uninhabited type",
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum TypeCheckDiagnosticCategory {
    TypeMismatch,
    CircularType,
    ExpectedNever,
}

impl DiagnosticCategory for TypeCheckDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("type-check")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("Type Checker")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match self {
            Self::TypeMismatch => Some(&TYPE_MISMATCH),
            Self::CircularType => Some(&CIRCULAR_TYPE),
            Self::ExpectedNever => Some(&EXPECTED_NEVER),
        }
    }
}

/// Creates a type mismatch diagnostic with specific labels for the left and right types
pub(crate) fn type_mismatch<K>(
    span: SpanId,
    arena: &Arena<Type>,

    lhs: &Type<K>,
    rhs: &Type<K>,

    help: Option<&str>,
) -> TypeCheckDiagnostic
where
    K: PrettyPrint,
{
    let mut diagnostic =
        Diagnostic::new(TypeCheckDiagnosticCategory::TypeMismatch, Severity::ERROR);

    diagnostic
        .labels
        .push(Label::new(span, "Type mismatch in this expression").with_order(3));

    diagnostic.labels.push(
        Label::new(
            lhs.span,
            format!("This is of type `{}`", lhs.kind.pretty_print(arena, 80)),
        )
        .with_order(1),
    );

    diagnostic.labels.push(
        Label::new(
            rhs.span,
            format!("This is of type `{}`", rhs.kind.pretty_print(arena, 80)),
        )
        .with_order(2),
    );

    if let Some(text) = help {
        diagnostic.help = Some(Help::new(text));
    }

    diagnostic.note = Some(Note::new(
        "Types in expressions must be compatible according to the language's type system",
    ));

    diagnostic
}

/// Creates a circular type reference diagnostic
pub(crate) fn circular_type_reference<K>(
    span: SpanId,
    lhs: &Type<K>,
    rhs: &Type<K>,
) -> TypeCheckDiagnostic
where
    K: PrettyPrint,
{
    let mut diagnostic =
        Diagnostic::new(TypeCheckDiagnosticCategory::CircularType, Severity::ERROR);

    diagnostic.labels.push(
        Label::new(span, "Circular type reference detected in this expression").with_order(3),
    );

    diagnostic
        .labels
        .push(Label::new(lhs.span, "This type depends on itself").with_order(1));

    diagnostic
        .labels
        .push(Label::new(rhs.span, "... through this reference").with_order(2));

    diagnostic.help = Some(Help::new(
        "Recursive types are not allowed in this context. Break the dependency cycle by \
         introducing an indirect reference or reorganizing your type definitions.",
    ));

    diagnostic.note = Some(Note::new(
        "Circular type references cannot be resolved because they would create an infinitely \
         nested type. Certain language constructs like recursive functions are supported, but \
         direct recursion in type definitions is not.",
    ));

    diagnostic
}

/// Creates a diagnostic for when a value has a non-Never type but a Never type is expected
pub(crate) fn expected_never<K>(
    span: SpanId,
    arena: &Arena<Type>,
    actual_type: &Type<K>,
) -> TypeCheckDiagnostic
where
    K: PrettyPrint,
{
    let mut diagnostic =
        Diagnostic::new(TypeCheckDiagnosticCategory::ExpectedNever, Severity::ERROR);

    diagnostic
        .labels
        .push(Label::new(span, "This expression should not return a value").with_order(2));

    diagnostic.labels.push(
        Label::new(
            actual_type.span,
            format!(
                "But it returns a value of type `{}`",
                actual_type.kind.pretty_print(arena, 80)
            ),
        )
        .with_order(1),
    );

    diagnostic.help = Some(Help::new(
        "This code path expects an uninhabited type (Never), meaning it should not produce a \
         value. This typically happens in code paths that should never be reached, or in branches \
         that must terminate execution (e.g., by returning early, throwing an error, or entering \
         an infinite loop).",
    ));

    diagnostic.note = Some(Note::new(
        "The Never type represents computations that do not produce a value, such as infinite \
         loops, unreachable code paths, or code that always throws an error. When a Never type is \
         expected, your code must not return any value.",
    ));

    diagnostic
}
