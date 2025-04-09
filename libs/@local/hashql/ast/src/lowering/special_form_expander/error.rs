use alloc::borrow::Cow;
use core::fmt::{self, Display};

use hashql_core::span::SpanId;
use hashql_diagnostics::{
    Diagnostic,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
    help::Help,
    label::Label,
    note::Note,
    severity::Severity,
};
use strsim::jaro_winkler;

use super::SpecialFormKind;
use crate::node::{
    expr::call::{Argument, LabeledArgument},
    generic::GenericArgument,
    path::Path,
};

pub(crate) type SpecialFormExpanderDiagnostic =
    Diagnostic<SpecialFormExpanderDiagnosticCategory, SpanId>;

const UNKNOWN_SPECIAL_FORM: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "unknown-special-form",
    name: "Unknown special form",
};

const SPECIAL_FORM_ARGUMENT_LENGTH: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "special-form-argument-length",
    name: "Incorrect number of arguments for special form",
};

const LABELED_ARGUMENTS_NOT_SUPPORTED: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "labeled-arguments-not-supported",
    name: "Labeled arguments not supported in special forms",
};

const INVALID_TYPE_EXPRESSION: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-type-expression",
    name: "Invalid type expression",
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum SpecialFormExpanderDiagnosticCategory {
    UnknownSpecialForm,
    SpecialFormArgumentLength,
    LabeledArgumentsNotSupported,
    InvalidTypeExpression,
}

impl DiagnosticCategory for SpecialFormExpanderDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("special-form-expander")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("Special Form Expander")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match self {
            Self::UnknownSpecialForm => Some(&UNKNOWN_SPECIAL_FORM),
            Self::SpecialFormArgumentLength => Some(&SPECIAL_FORM_ARGUMENT_LENGTH),
            Self::LabeledArgumentsNotSupported => Some(&LABELED_ARGUMENTS_NOT_SUPPORTED),
            Self::InvalidTypeExpression => Some(&INVALID_TYPE_EXPRESSION),
        }
    }
}

pub(crate) fn unknown_special_form_length(
    span: SpanId,
    path: &Path<'_>,
) -> SpecialFormExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        SpecialFormExpanderDiagnosticCategory::UnknownSpecialForm,
        Severity::ERROR,
    );

    // More specific, action-oriented label
    diagnostic
        .labels
        .push(Label::new(span, "Fix this path to have exactly 3 segments"));

    // Add a second label to show what segment is causing the issue
    if path.segments.len() > 3 {
        // Point to the problematic segment(s)
        #[expect(clippy::cast_possible_truncation, clippy::cast_possible_wrap)]
        for (index, segment) in path.segments.iter().enumerate().skip(3) {
            diagnostic.labels.push(
                Label::new(segment.span, "Remove this extra segment").with_order(index as i32 - 2),
            );
        }
    }

    diagnostic.help = Some(Help::new(
        "Special form paths must follow the pattern '::kernel::special_form::<name>' with exactly \
         3 segments",
    ));

    diagnostic.note = Some(Note::new(format!(
        "Found path with {} segments, but special form paths must have exactly 3 segments",
        path.segments.len()
    )));

    diagnostic
}

pub(crate) fn unknown_special_form_name(
    span: SpanId,
    path: &Path<'_>,
) -> SpecialFormExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        SpecialFormExpanderDiagnosticCategory::UnknownSpecialForm,
        Severity::ERROR,
    );

    let function_name = &path.segments[2].name.value;
    let function_span = path.segments[2].name.span;

    diagnostic.labels.push(Label::new(
        function_span,
        format!("Replace '{function_name}' with a valid special form name"),
    ));

    // Add a contextual label for the entire path
    diagnostic
        .labels
        .push(Label::new(span, "This special form path is invalid").with_order(1));

    let closest_match = enum_iterator::all::<SpecialFormKind>()
        .map(|kind| (kind, jaro_winkler(function_name.as_str(), kind.as_str())))
        .max_by(|&(_, a), &(_, b)| a.total_cmp(&b));

    let help = if let Some((kind, distance)) = closest_match
        && distance > 0.7
    {
        Cow::Owned(format!(
            "Did you mean to use '{}' instead? Replace '{}' with '{}'",
            kind.as_str(),
            function_name,
            kind.as_str()
        ))
    } else {
        Cow::Borrowed("Special forms must use one of the predefined names shown in the note below")
    };

    diagnostic.help = Some(Help::new(help));

    let names = enum_iterator::all::<SpecialFormKind>()
        .map(|kind| kind.as_str())
        .collect::<Vec<_>>()
        .join(", ");

    diagnostic.note = Some(Note::new(format!(
        "Available special forms include: {names}"
    )));

    diagnostic
}

pub(crate) fn unknown_special_form_generics(
    generics: &[&GenericArgument],
) -> SpecialFormExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        SpecialFormExpanderDiagnosticCategory::UnknownSpecialForm,
        Severity::ERROR,
    );

    let (first, rest) = generics
        .split_first()
        .expect("should have at least one generic argument");

    diagnostic
        .labels
        .push(Label::new(first.span, "Remove these generic arguments"));

    #[expect(clippy::cast_possible_truncation, clippy::cast_possible_wrap)]
    for (index, arg) in rest.iter().enumerate() {
        diagnostic
            .labels
            .push(Label::new(arg.span, "... and these too").with_order((index + 1) as i32));
    }

    diagnostic.help = Some(Help::new(
        "Special form paths must not include generic arguments. Remove the angle brackets and \
         their contents.",
    ));

    diagnostic.note = Some(Note::new(
        "Special forms are built-in language constructs that don't support generics in their path \
         reference.",
    ));

    diagnostic
}

pub(super) fn invalid_argument_length(
    kind: SpecialFormKind,
    arguments: &[Argument],
    expected: &[usize],
) -> SpecialFormExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        SpecialFormExpanderDiagnosticCategory::SpecialFormArgumentLength,
        Severity::ERROR,
    );

    let actual = arguments.len();

    let canonical: Vec<_> = expected
        .iter()
        .map(|length| format!("{kind}/{length}"))
        .collect();

    let max_expected = expected.iter().max().copied().unwrap_or(0);

    if actual > max_expected {
        let excess = &arguments[max_expected..];

        let (first, rest) = excess.split_first().unwrap_or_else(|| unreachable!());

        diagnostic
            .labels
            .push(Label::new(first.span, "Remove this argument"));

        for (index, argument) in rest.iter().enumerate() {
            diagnostic.labels.push(
                Label::new(argument.span, "... and this argument").with_order(-(index as i32 + 1)),
            );
        }
    }

    // Specific help text with code examples
    let help_text = match kind {
        SpecialFormKind::If => {
            "Use either:\n- if/2: (if condition then-expr)\n- if/3: (if condition then-expr \
             else-expr)"
        }
        SpecialFormKind::Is => "The is/2 form should look like: (is value type-expr)",
        SpecialFormKind::Let => {
            "Use either:\n- let/3: (let name value body)\n- let/4: (let name type value body)"
        }
        SpecialFormKind::Type => "The type/3 form should look like: (type name type-expr body)",
        SpecialFormKind::Newtype => {
            "The newtype/3 form should look like: (newtype name type-expr body)"
        }
        SpecialFormKind::Use => todo!(),
        SpecialFormKind::Fn => todo!(),
        SpecialFormKind::Input => {
            "Use either:\n- input/3: (input name type body)\n- input/4: (input name type default \
             body)"
        }
        SpecialFormKind::Access => "The access/2 form should look like: (access object field)",
        SpecialFormKind::Index => "The index/2 form should look like: (index object index)",
    };

    diagnostic.help = Some(Help::new(help_text));

    diagnostic.note = Some(Note::new(format!(
        "The {kind} function has {} variant{}: {}",
        expected.len(),
        if expected.len() == 1 { "" } else { "s" },
        canonical.join(", ")
    )));

    diagnostic
}

pub(crate) fn labeled_arguments_not_supported(
    arguments: &[LabeledArgument],
) -> SpecialFormExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        SpecialFormExpanderDiagnosticCategory::LabeledArgumentsNotSupported,
        Severity::ERROR,
    );

    let (first, rest) = arguments.split_first().unwrap_or_else(|| unreachable!());

    diagnostic
        .labels
        .push(Label::new(first.span, "Remove this labeled argument"));

    for (index, argument) in rest.iter().enumerate() {
        diagnostic.labels.push(
            Label::new(argument.span, "... and this labeled argument")
                .with_order(-(index as i32 - 1)),
        );
    }

    diagnostic.help = Some(Help::new(
        "Special forms only accept positional arguments. Convert all labeled arguments to \
         positional arguments in the correct order.",
    ));

    diagnostic.note = Some(Note::new(
        "Unlike regular functions, special forms have fixed parameter positions and cannot use \
         labeled arguments.",
    ));

    diagnostic
}

pub(crate) enum InvalidTypeExpressionKind {
    Dict,
    List,
    Literal,
    Let,
    Type,
    NewType,
    Use,
    Input,
    Closure,
    If,
    Field,
    Index,
    Is,
    Dummy,
}

impl InvalidTypeExpressionKind {
    fn as_str(&self) -> &'static str {
        match self {
            InvalidTypeExpressionKind::Dict => "dictionary",
            InvalidTypeExpressionKind::List => "list",
            InvalidTypeExpressionKind::Literal => "literal",
            InvalidTypeExpressionKind::Let => "let binding",
            InvalidTypeExpressionKind::Type => "type definition",
            InvalidTypeExpressionKind::NewType => "newtype definition",
            InvalidTypeExpressionKind::Use => "use",
            InvalidTypeExpressionKind::Input => "input",
            InvalidTypeExpressionKind::Closure => "function",
            InvalidTypeExpressionKind::If => "if",
            InvalidTypeExpressionKind::Field => "field access",
            InvalidTypeExpressionKind::Index => "index",
            InvalidTypeExpressionKind::Is => "is",
            InvalidTypeExpressionKind::Dummy => "dummy",
        }
    }
}

impl Display for InvalidTypeExpressionKind {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str(self.as_str())
    }
}

pub(crate) fn invalid_type_expression(
    span: SpanId,
    kind: InvalidTypeExpressionKind,
) -> SpecialFormExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        SpecialFormExpanderDiagnosticCategory::InvalidTypeExpression,
        Severity::ERROR,
    );

    // More specific, action-oriented message
    let message = match kind {
        InvalidTypeExpressionKind::Dict => {
            "Replace this dictionary with a proper type expression".to_string()
        }
        InvalidTypeExpressionKind::List => {
            "Replace this list with a proper type expression".to_string()
        }
        InvalidTypeExpressionKind::Literal => "Replace this literal with a type name".to_string(),
        InvalidTypeExpressionKind::Closure => {
            "Replace this function with a type expression".to_string()
        }
        InvalidTypeExpressionKind::If => {
            "Replace this conditional with a concrete type".to_string()
        }
        _ => format!("Replace this {} with a proper type expression", kind),
    };

    diagnostic.labels.push(Label::new(span, message));

    // Specific help text with examples for each case
    let help_text = match kind {
        InvalidTypeExpressionKind::Dict => {
            "Dictionaries do not constitute a valid type expression, did you mean to instantiate a \
             struct type or refer to the `Dict<K, V>` type?"
        }
        InvalidTypeExpressionKind::List => {
            "Arrays do not constitute a valid type expression, did you mean to instantiate a tuple \
             type or refer to the `Array<T>` type?"
        }
        InvalidTypeExpressionKind::If => {
            "HashQL does not support conditional types. Use a concrete type like Int or String."
        }
        _ => "Replace this expression with a valid type reference, struct type, or tuple type",
    };

    diagnostic.help = Some(Help::new(help_text));

    diagnostic.note = Some(Note::new(
        "Valid type expressions include:
- Type names: String, Int, Float
- Struct types: {name: String, age: Int}
- Tuple types: (String, Int, Boolean)
- Generic types: Array<String>, Option<Int>",
    ));

    diagnostic
}
