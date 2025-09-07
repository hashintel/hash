use alloc::borrow::Cow;
use core::{cmp::Ordering, fmt::Display};

use hashql_core::{
    span::{SpanId, Spanned},
    r#type::{TypeId, error::TypeCheckDiagnosticCategory, kind::generic::GenericArgumentReference},
};
use hashql_diagnostics::{
    Diagnostic, Help, Note, Severity,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
    color::{AnsiColor, Color},
    label::Label,
};

use super::specialization::error::SpecializationDiagnosticCategory;
use crate::node::variable::Variable;

const GENERIC_ARGUMENT_MISMATCH: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "generic-argument-mismatch",
    name: "Incorrect number of type arguments",
};

const ARGUMENT_OVERRIDE: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "argument-override",
    name: "Type arguments would be overridden",
};

pub type LoweringDiagnostic = Diagnostic<LoweringDiagnosticCategory, SpanId>;

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
    let mut diagnostic = Diagnostic::new(
        LoweringDiagnosticCategory::GenericArgumentMismatch,
        Severity::Error,
    );

    let expected = parameters.len();
    let actual = arguments.len();

    let missing = parameters.get(actual..).unwrap_or(&[]);
    let extraneous = arguments.get(expected..).unwrap_or(&[]);

    let context_name = match context {
        GenericArgumentContext::TypeConstructor => "type constructor",
        GenericArgumentContext::Closure => "closure",
    };

    diagnostic.labels.push(Label::new(
        variable_span,
        format!(
            "This {context_name} requires {expected} generic argument{}, but {actual} {} provided",
            if expected == 1 { "" } else { "s" },
            if actual == 1 { "was" } else { "were" }
        ),
    ));

    let mut order = -1;
    for missing in missing {
        diagnostic.labels.push(
            Label::new(
                node_span,
                format!("Add missing parameter `{}`", missing.name.demangle()),
            )
            .with_order(order)
            .with_color(Color::Ansi(AnsiColor::Yellow)),
        );

        order -= 1;
    }

    for &extraneous in extraneous {
        diagnostic.labels.push(
            Label::new(extraneous.span, "Remove this argument")
                .with_order(order)
                .with_color(Color::Ansi(AnsiColor::Red)),
        );

        order -= 1;
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

    diagnostic.add_help(Help::new(help));

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

        diagnostic.add_note(Note::new(note_message));
    }

    diagnostic
}

pub(crate) fn argument_override<'heap>(
    variable: &Variable<'heap>,
    replacement: &Variable<'heap>,
) -> LoweringDiagnostic {
    let mut diagnostic = Diagnostic::new(
        LoweringDiagnosticCategory::ArgumentOverride,
        Severity::Error,
    );

    let variable_arguments = variable.arguments();
    let replacement_arguments = replacement.arguments();

    diagnostic.labels.push(Label::new(
        variable.span,
        format!(
            "This variable `{}` already has {} type argument{}",
            variable.name(),
            variable_arguments.len(),
            if variable_arguments.len() == 1 {
                ""
            } else {
                "s"
            }
        ),
    ));

    diagnostic.labels.push(
        Label::new(
            replacement.span,
            format!(
                "... but it aliases `{}` which also has {} type argument{} applied",
                replacement.name(),
                replacement_arguments.len(),
                if replacement_arguments.len() == 1 {
                    ""
                } else {
                    "s"
                }
            ),
        )
        .with_order(1)
        .with_color(Color::Ansi(AnsiColor::Blue)),
    );

    for argument in variable_arguments {
        diagnostic.labels.push(
            Label::new(argument.span, "... remove this argument")
                .with_order(-2)
                .with_color(Color::Ansi(AnsiColor::Red)),
        );
    }

    diagnostic.add_help(Help::new(format!(
        "Variable aliases cannot override type arguments. Remove the type arguments from either \
         `{}` or `{}` to resolve this conflict. Consider using the aliased variable `{}` directly \
         instead of creating an alias with conflicting arguments.",
        variable.name(),
        replacement.name(),
        replacement.name()
    )));

    diagnostic.add_note(Note::new(
        "When a variable aliases another variable with type arguments, the alias cannot specify \
         additional type arguments as this would create ambiguity about which arguments should be \
         used.",
    ));

    diagnostic
}
