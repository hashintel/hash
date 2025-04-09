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
use crate::node::{generic::GenericArgument, path::Path};

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

    diagnostic
        .labels
        .push(Label::new(span, "This path has an incorrect length"));

    diagnostic.help = Some(Help::new(
        "The special form module does not contain any nested modules.",
    ));

    diagnostic.note = Some(Note::new(format!(
        "Found path with {} segments",
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

    diagnostic.labels.push(Label::new(
        span,
        format!("'{function_name}' is not a recognized special form"),
    ));

    let closest_match = enum_iterator::all::<SpecialFormKind>()
        .map(|kind| (kind, jaro_winkler(function_name.as_str(), kind.as_str())))
        .max_by(|&(_, a), &(_, b)| a.total_cmp(&b));

    let help = if let Some((kind, distance)) = closest_match
        && distance > 0.7
    {
        Cow::Owned(format!(
            "Did you mean to use the '{}' special form?",
            kind.as_str()
        ))
    } else {
        Cow::Borrowed("Special forms are built-in language constructs with specialized behavior")
    };

    diagnostic.help = Some(Help::new(help));

    let names = enum_iterator::all::<SpecialFormKind>()
        .map(|kind| kind.as_str())
        .collect::<Vec<_>>()
        .join(", ");

    diagnostic.note = Some(Note::new(format!(
        "Available special forms include: {}",
        names
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

    diagnostic.labels.push(Label::new(
        first.span,
        "Generic arguments not allowed in special form path",
    ));

    for arg in rest {
        diagnostic.labels.push(Label::new(
            arg.span,
            "Generic arguments not allowed in special form path",
        ));
    }

    let help_text = "Special form path segments cannot have generic arguments";
    diagnostic.help = Some(Help::new(help_text));

    diagnostic
}

pub(crate) fn invalid_argument_length(
    span: SpanId,
    kind: SpecialFormKind,
    actual: usize,
    expected: &[usize],
) -> SpecialFormExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        SpecialFormExpanderDiagnosticCategory::SpecialFormArgumentLength,
        Severity::ERROR,
    );

    let canonical: Vec<_> = expected
        .iter()
        .map(|length| format!("{kind}/{length}"))
        .collect();

    // Format the expected values list in a readable way
    let expected = if expected.len() == 0 {
        Cow::Borrowed("no arguments")
    } else if expected.len() == 1 {
        Cow::Owned(format!("exactly {}", expected[0]))
    } else {
        let (last, initial) = expected.split_last().unwrap_or_else(|| unreachable!());

        let formatted_initial = initial
            .iter()
            .map(ToString::to_string)
            .collect::<Vec<_>>()
            .join(", ");

        Cow::Owned(format!("either {formatted_initial} or {}", last))
    };

    let message = format!(
        "Found {} arguments, but {} expects {}",
        actual, kind, expected
    );

    diagnostic.labels.push(Label::new(span, message));

    let help_text = match kind {
        SpecialFormKind::If => {
            "Use either `if/2` form (if condition then-expr) or `if/3` form (if condition \
             then-expr else-expr)"
        }
        SpecialFormKind::Is => "The `is/2` form requires exactly 2 arguments: (is value type)",
        SpecialFormKind::Let => {
            "Use either `let/3` (let name value body) or `let/4` (let name type value body)"
        }
        SpecialFormKind::Type => {
            "The `type/3` form requires exactly 3 arguments: (type name type body)"
        }
        SpecialFormKind::Newtype => {
            "The `newtype/3` form requires exactly 3 arguments: (newtype name type body)"
        }
        SpecialFormKind::Use => todo!(),
        SpecialFormKind::Fn => todo!(),
        SpecialFormKind::Input => {
            "Use either `input/3` form (input name type body) or `input/4` form (input name type \
             default body)"
        }
        SpecialFormKind::Access => {
            "The `access/2` form requires exactly 2 arguments: (access object field)"
        }
        SpecialFormKind::Index => {
            "The `index/2` form requires exactly 2 arguments: (index object index)"
        }
    };

    diagnostic.help = Some(Help::new(help_text));

    diagnostic.note = Some(Note::new(format!(
        "The {kind} function has the following variants: {}",
        canonical.join(", ")
    )));

    diagnostic
}

pub(crate) fn labeled_arguments_not_supported(span: SpanId) -> SpecialFormExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        SpecialFormExpanderDiagnosticCategory::LabeledArgumentsNotSupported,
        Severity::ERROR,
    );

    diagnostic.labels.push(Label::new(
        span,
        "Labeled arguments are not supported in special forms",
    ));

    let help_text = "Special forms only accept positional arguments";
    diagnostic.help = Some(Help::new(help_text));

    diagnostic
}

pub(crate) enum InvalidTypeExpressionKind {
    Dict,
    List,
    Literal,
    Function,
    If,
}

impl InvalidTypeExpressionKind {
    fn as_str(&self) -> &'static str {
        match self {
            InvalidTypeExpressionKind::Dict => "dict",
            InvalidTypeExpressionKind::List => "list",
            InvalidTypeExpressionKind::Literal => "literal",
            InvalidTypeExpressionKind::Function => "function",
            InvalidTypeExpressionKind::If => "if",
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

    // More specific message about what's wrong
    let message = format!("A {} expression cannot be used as a type", kind);
    diagnostic.labels.push(Label::new(span, message));

    // Customize help text based on the expression kind
    let help_text = match kind {
        InvalidTypeExpressionKind::Dict => {
            "Use a struct type instead of a dictionary: {field1: Type1, field2: Type2}"
        }
        InvalidTypeExpressionKind::List => "Consider using an array type instead: [ElementType]",
        InvalidTypeExpressionKind::Literal => {
            "Replace this literal with a type name like 'String', 'Int', etc."
        }
        InvalidTypeExpressionKind::Function => {
            "Functions cannot be directly used as types. Use a function type like (ArgType) -> \
             ReturnType"
        }
        InvalidTypeExpressionKind::If => {
            "Conditional expressions cannot be used as types. Use a specific type instead."
        }
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
