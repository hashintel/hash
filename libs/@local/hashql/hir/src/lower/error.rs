use alloc::borrow::Cow;
use core::{cmp::Ordering, fmt::Display};

use hashql_core::{
    pretty::{PrettyOptions, PrettyPrint as _},
    span::{SpanId, Spanned},
    r#type::{
        Type, TypeId,
        environment::Environment,
        error::TypeCheckDiagnosticCategory,
        kind::{IntrinsicType, PrimitiveType, TypeKind, generic::GenericArgumentReference},
    },
};
use hashql_diagnostics::{
    Diagnostic, DiagnosticIssues, Label, Severity, Status,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
    diagnostic::Message,
};

use super::specialization::error::SpecializationDiagnosticCategory;
use crate::{context::SymbolRegistry, node::variable::Variable};

const GENERIC_ARGUMENT_MISMATCH: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "generic-argument-mismatch",
    name: "Incorrect number of type arguments",
};

const ARGUMENT_OVERRIDE: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "argument-override",
    name: "Cannot apply type arguments to already-parameterized variable",
};

pub type LoweringDiagnostic<K = Severity> = Diagnostic<LoweringDiagnosticCategory, SpanId, K>;
pub type LoweringDiagnosticIssues<K = Severity> =
    DiagnosticIssues<LoweringDiagnosticCategory, SpanId, K>;
pub type LoweringDiagnosticStatus<T> = Status<T, LoweringDiagnosticCategory, SpanId>;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum LoweringDiagnosticCategory {
    GenericArgumentMismatch,
    ArgumentOverride,
    TypeChecking(TypeCheckDiagnosticCategory),
    Specialization(SpecializationDiagnosticCategory),
}

impl DiagnosticCategory for LoweringDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("lower")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("Lowering")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match self {
            Self::GenericArgumentMismatch => Some(&GENERIC_ARGUMENT_MISMATCH),
            Self::ArgumentOverride => Some(&ARGUMENT_OVERRIDE),
            Self::TypeChecking(category) => Some(category),
            Self::Specialization(category) => Some(category),
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum GenericArgumentContext {
    TypeConstructor,
    Closure,
}

pub(crate) fn generic_argument_mismatch(
    context: GenericArgumentContext,

    node_span: SpanId,

    variable_span: SpanId,
    variable_name: impl Display,

    parameters: &[GenericArgumentReference],
    arguments: &[Spanned<TypeId>],
) -> LoweringDiagnostic {
    let expected = parameters.len();
    let actual = arguments.len();

    let missing = parameters.get(actual..).unwrap_or(&[]);
    let extraneous = arguments.get(expected..).unwrap_or(&[]);

    let context_name = match context {
        GenericArgumentContext::TypeConstructor => "type constructor",
        GenericArgumentContext::Closure => "closure",
    };

    let mut diagnostic = Diagnostic::new(
        LoweringDiagnosticCategory::GenericArgumentMismatch,
        Severity::Error,
    )
    .primary(Label::new(
        variable_span,
        format!(
            "This {context_name} requires {expected} generic argument{}, but {actual} {} provided",
            if expected == 1 { "" } else { "s" },
            if actual == 1 { "was" } else { "were" }
        ),
    ));

    for missing in missing {
        diagnostic.labels.push(Label::new(
            node_span,
            format!("Add missing parameter `{}`", missing.name.demangle()),
        ));
    }

    for &extraneous in extraneous {
        diagnostic
            .labels
            .push(Label::new(extraneous.span, "Remove this argument"));
    }

    let usage = format!(
        "{}{}",
        variable_name,
        GenericArgumentReference::display(parameters)
    );

    let help = match actual.cmp(&expected) {
        Ordering::Less => format!(
            "This {context_name} requires exactly {} generic argument{}. Provide the missing \
             parameter{}: {usage}",
            expected,
            if expected == 1 { "" } else { "s" },
            if missing.len() == 1 { "" } else { "s" },
        ),
        Ordering::Greater => format!(
            "This {context_name} accepts exactly {} generic argument{}. Remove the extra \
             parameter{}: {usage}",
            expected,
            if expected == 1 { "" } else { "s" },
            if extraneous.len() == 1 { "" } else { "s" },
        ),
        Ordering::Equal => format!("Correct usage: {usage}"),
    };

    diagnostic.add_message(Message::help(help));

    if !parameters.is_empty() {
        let note_message = match context {
            GenericArgumentContext::TypeConstructor => {
                "Generic type parameters must be provided when instantiating parameterized types. \
                 Each parameter corresponds to a specific type that will be substituted throughout \
                 the type definition."
            }
            GenericArgumentContext::Closure => {
                "Generic type parameters must be provided when invoking parameterized closures. \
                 Each parameter corresponds to a specific type that will be used within the \
                 closure's execution."
            }
        };

        diagnostic.add_message(Message::note(note_message));
    }

    diagnostic
}

pub(crate) fn argument_override<'heap>(
    variable: &Variable<'heap>,
    replacement: &Variable<'heap>,
    symbols: &SymbolRegistry<'heap>,
) -> LoweringDiagnostic {
    let mut diagnostic = Diagnostic::new(
        LoweringDiagnosticCategory::ArgumentOverride,
        Severity::Error,
    )
    .primary(Label::new(
        replacement.span,
        format!(
            "`{}` was defined with type arguments here",
            variable.name(symbols)
        ),
    ));

    let variable_arguments = variable.arguments();

    for argument in variable_arguments {
        diagnostic.labels.push(Label::new(
            argument.span,
            "... but additional type arguments are provided here",
        ));
    }

    diagnostic.add_message(Message::help(format!(
        "The variable `{}` already represents `{}` with type arguments applied. Use `{}` directly \
         without additional type arguments, or create a new binding if you need different type \
         parameters.",
        variable.name(symbols),
        replacement.name(symbols),
        variable.name(symbols)
    )));

    diagnostic.add_message(Message::note(
        "Variables that alias parameterized expressions cannot have additional type arguments \
         applied to them, as this would create ambiguous type parameter bindings.",
    ));

    diagnostic
}

pub(crate) fn type_mismatch_if<'heap>(
    env: &Environment<'heap>,
    r#type: Type<'heap>,
) -> LoweringDiagnostic {
    let mut diagnostic = Diagnostic::new(
        LoweringDiagnosticCategory::TypeChecking(TypeCheckDiagnosticCategory::TypeMismatch),
        Severity::Error,
    )
    .primary(Label::new(
        r#type.span,
        format!(
            "expected `Boolean`, found `{}`",
            r#type.pretty_print(env, PrettyOptions::default())
        ),
    ));

    // Add a helpful note for common cases (primitives)
    #[expect(clippy::wildcard_enum_match_arm)]
    match r#type.kind {
        TypeKind::Primitive(PrimitiveType::String) => {
            diagnostic.add_message(Message::help(
                "to check if a string is empty, use `core::string::is_empty`",
            ));
        }
        TypeKind::Primitive(PrimitiveType::Number | PrimitiveType::Integer) => {
            diagnostic.add_message(Message::help(
                "to check if a number is zero, compare it to zero using `==` or `!=`",
            ));
        }
        TypeKind::Intrinsic(IntrinsicType::List(_)) => {
            diagnostic.add_message(Message::help(
                "to check if a list is empty, use `core::list::is_empty`",
            ));
        }
        TypeKind::Intrinsic(IntrinsicType::Dict(_)) => {
            diagnostic.add_message(Message::help(
                "to check if a dictionary is empty, use `core::dict::is_empty`",
            ));
        }
        _ => {
            diagnostic.add_message(Message::help(
                "add a comparison or boolean conversion to make this a boolean expression",
            ));
        }
    }

    diagnostic.add_message(Message::note(
        "if conditions require boolean expressions to determine which branch to execute",
    ));

    diagnostic
}
