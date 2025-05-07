use alloc::borrow::Cow;

use hashql_core::{
    module::{
        error::ResolutionError,
        item::{ItemKind, Universe},
    },
    span::SpanId,
    symbol::Symbol,
    r#type::{error::TypeCheckDiagnosticCategory, kind::GenericArgument},
};
use hashql_diagnostics::{
    Diagnostic,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
    color::{AnsiColor, Color},
    help::Help,
    label::Label,
    note::Note,
    severity::Severity,
};
use strsim::jaro_winkler;

use crate::node::path::{Path, PathSegmentArgument};

pub(crate) type TypeExtractorDiagnostic = Diagnostic<TypeExtractorDiagnosticCategory, SpanId>;

const DUPLICATE_TYPE_ALIAS: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "duplicate-type-alias",
    name: "Duplicate type alias name",
};

const DUPLICATE_NEWTYPE: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "duplicate-newtype",
    name: "Duplicate newtype name",
};

const GENERIC_PARAMETER_MISMATCH: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "generic-parameter-mismatch",
    name: "Incorrect number of type parameters",
};

const UNBOUND_TYPE_VARIABLE: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "unbound-type-variable",
    name: "Unbound type variable",
};

const SPECIAL_FORM_NOT_SUPPORTED: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "special-form-not-supported",
    name: "Unsupported special form",
};

const INTRINSIC_PARAMETER_MISMATCH: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "intrinsic-parameter-mismatch",
    name: "Incorrect intrinsic type parameters",
};

const UNKNOWN_INTRINSIC_TYPE: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "unknown-intrinsic-type",
    name: "Unknown intrinsic type",
};

const INVALID_RESOLUTION: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-resolution",
    name: "Invalid item resolution",
};

const RESOLUTION_ERROR: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "resolution-error",
    name: "Path resolution error",
};

const INFER_WITH_ARGUMENTS: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "infer-with-arguments",
    name: "Inference placeholder with type arguments",
};

const DUPLICATE_STRUCT_FIELD: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "duplicate-struct-field",
    name: "Duplicate struct field",
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum TypeExtractorDiagnosticCategory {
    DuplicateTypeAlias,
    DuplicateNewtype,
    GenericParameterMismatch,
    UnboundTypeVariable,
    SpecialFormNotSupported,
    IntrinsicParameterMismatch,
    UnknownIntrinsicType,
    InvalidResolution,
    ResolutionError,
    InferWithArguments,
    DuplicateStructField,
    TypeCheck(TypeCheckDiagnosticCategory),
}

impl DiagnosticCategory for TypeExtractorDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("type-extractor")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("Type Extractor")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match self {
            Self::DuplicateTypeAlias => Some(&DUPLICATE_TYPE_ALIAS),
            Self::DuplicateNewtype => Some(&DUPLICATE_NEWTYPE),
            Self::GenericParameterMismatch => Some(&GENERIC_PARAMETER_MISMATCH),
            Self::UnboundTypeVariable => Some(&UNBOUND_TYPE_VARIABLE),
            Self::SpecialFormNotSupported => Some(&SPECIAL_FORM_NOT_SUPPORTED),
            Self::IntrinsicParameterMismatch => Some(&INTRINSIC_PARAMETER_MISMATCH),
            Self::UnknownIntrinsicType => Some(&UNKNOWN_INTRINSIC_TYPE),
            Self::InvalidResolution => Some(&INVALID_RESOLUTION),
            Self::ResolutionError => Some(&RESOLUTION_ERROR),
            Self::InferWithArguments => Some(&INFER_WITH_ARGUMENTS),
            Self::DuplicateStructField => Some(&DUPLICATE_STRUCT_FIELD),
            Self::TypeCheck(category) => Some(category),
        }
    }
}

/// Creates a diagnostic for a duplicate type alias name.
///
/// This diagnostic is generated when the type extractor finds a duplicate type alias name
/// which should have been prevented by the name mangler at an earlier stage.
pub(crate) fn duplicate_type_alias(
    original_span: SpanId,
    duplicate_span: SpanId,
    name: Symbol<'_>,
) -> TypeExtractorDiagnostic {
    let mut diagnostic = Diagnostic::new(
        TypeExtractorDiagnosticCategory::DuplicateTypeAlias,
        Severity::COMPILER_BUG,
    );

    diagnostic.labels.extend([
        Label::new(
            original_span,
            format!("Type '{name}' was already defined here"),
        )
        .with_order(1)
        .with_color(Color::Ansi(AnsiColor::Blue)),
        Label::new(duplicate_span, "... but was redefined here")
            .with_order(0)
            .with_color(Color::Ansi(AnsiColor::Red)),
    ]);

    diagnostic.note = Some(Note::new(
        "This likely represents a compiler bug in the name mangling pass. The name mangler should \
         have given these identical names unique internal identifiers to avoid this collision. \
         Please report this issue to the HashQL team with a minimal reproduction case.",
    ));

    diagnostic
}

/// Creates a diagnostic for a duplicate newtype name.
///
/// This diagnostic is generated when the type extractor finds a duplicate newtype name
/// which should have been prevented by the name mangler at an earlier stage.
pub(crate) fn duplicate_newtype(
    original_span: SpanId,
    duplicate_span: SpanId,
    name: Symbol<'_>,
) -> TypeExtractorDiagnostic {
    let mut diagnostic = Diagnostic::new(
        TypeExtractorDiagnosticCategory::DuplicateNewtype,
        Severity::COMPILER_BUG,
    );

    diagnostic.labels.extend([
        Label::new(
            original_span,
            format!("Newtype '{name}' was already defined here"),
        )
        .with_order(1)
        .with_color(Color::Ansi(AnsiColor::Blue)),
        Label::new(duplicate_span, "... but was redefined here")
            .with_order(0)
            .with_color(Color::Ansi(AnsiColor::Red)),
    ]);

    diagnostic.note = Some(Note::new(
        "This likely represents a compiler bug in the name mangling pass. The name mangler should \
         have given these identical names unique internal identifiers to avoid this collision. \
         Please report this issue to the HashQL team with a minimal reproduction case.",
    ));

    diagnostic
}

/// Creates a diagnostic for incorrect generic parameter count.
///
/// This diagnostic is generated when a type is provided with an incorrect number of generic
/// parameters. It handles both too many and too few parameters cases.
pub(crate) fn generic_parameter_mismatch(
    span: SpanId,
    name: Symbol<'_>,
    parameters: &[GenericArgument<'_>],
    arguments: &[PathSegmentArgument<'_>],
) -> TypeExtractorDiagnostic {
    let mut diagnostic = Diagnostic::new(
        TypeExtractorDiagnosticCategory::GenericParameterMismatch,
        Severity::ERROR,
    );

    let expected = parameters.len();
    let actual = arguments.len();

    let missing = &parameters[actual..];
    let extraneous = &arguments[expected..];

    let message = if actual < expected {
        format!(
            "Type `{name}` requires {expected} type parameter{}, but only {actual} {} provided",
            if expected == 1 { "" } else { "s" },
            if actual == 1 { "was" } else { "were" }
        )
    } else {
        format!(
            "Type `{name}` accepts {expected} type parameter{}, but {actual} {} provided",
            if expected == 1 { "" } else { "s" },
            if actual == 1 { "was" } else { "were" }
        )
    };

    diagnostic
        .labels
        .push(Label::new(span, message).with_color(Color::Ansi(AnsiColor::Red)));

    let mut index = -1;

    for missing in missing {
        diagnostic.labels.push(
            Label::new(
                span,
                format!("Missing generic parameter `{}`", missing.name),
            )
            .with_order(index)
            .with_color(Color::Ansi(AnsiColor::Red)),
        );

        index -= 1;
    }

    for extraneous in extraneous {
        diagnostic.labels.push(
            Label::new(extraneous.span(), "Unexpected generic parameter")
                .with_order(index)
                .with_color(Color::Ansi(AnsiColor::Red)),
        );

        index -= 1;
    }

    let help = format!(
        "`{name}<{}>` expects {} argument{}",
        parameters
            .iter()
            .map(|param| param.name.as_str())
            .intersperse(", ")
            .collect::<String>(),
        parameters.len(),
        if parameters.len() == 1 { "" } else { "s" }
    );

    diagnostic.help = Some(Help::new(help));

    diagnostic
}

/// Creates a diagnostic for an unbound type variable.
///
/// This diagnostic is generated when a variable reference cannot be resolved within
/// the current scope, which should have been caught by an earlier pass.
pub(crate) fn unbound_type_variable<'heap>(
    span: SpanId,
    name: Symbol<'heap>,
    locals: impl IntoIterator<Item = Symbol<'heap>>,
) -> TypeExtractorDiagnostic {
    let mut diagnostic = Diagnostic::new(
        TypeExtractorDiagnosticCategory::UnboundTypeVariable,
        Severity::COMPILER_BUG,
    );

    diagnostic.labels.push(
        Label::new(span, format!("Cannot find '{name}'")).with_color(Color::Ansi(AnsiColor::Red)),
    );

    let suggestions: Vec<_> = locals
        .into_iter()
        .filter(|local| jaro_winkler(local.as_str(), name.as_str()) > 0.7)
        .collect();

    if !suggestions.is_empty() {
        let suggestions: String = suggestions
            .iter()
            .take(3)
            .map(Symbol::as_str)
            .intersperse("`, `")
            .collect();

        diagnostic.help = Some(Help::new(format!("Did you mean `{suggestions}`?")));
    }

    diagnostic.note = Some(Note::new(
        "This is likely a compiler bug. The name resolution pass should have caught this error. \
         Please report this issue to the HashQL team with a minimal reproduction case.",
    ));

    diagnostic
}

/// Creates a diagnostic for a special form usage where it's no longer supported.
///
/// This diagnostic is generated when code attempts to use a special form in a context
/// where they are no longer supported (likely after a language change).
pub(crate) fn special_form_not_supported(span: SpanId, name: &str) -> TypeExtractorDiagnostic {
    let mut diagnostic = Diagnostic::new(
        TypeExtractorDiagnosticCategory::SpecialFormNotSupported,
        Severity::ERROR,
    );

    diagnostic.labels.push(
        Label::new(span, format!("'{name}' is not supported in this context"))
            .with_color(Color::Ansi(AnsiColor::Red)),
    );

    diagnostic.note = Some(Note::new(
        "Before this step any special forms should have been replaced with native type syntax in \
         the special form expander compilation pass. Special forms in this position are not \
         supported.",
    ));

    diagnostic
}

/// Creates a diagnostic for an incorrect number of type parameters for an intrinsic type.
///
/// This diagnostic is generated when an intrinsic type like List or Dict is used with
/// an incorrect number of type parameters.
pub(crate) fn intrinsic_parameter_count_mismatch(
    span: SpanId,
    name: &str,
    expected: usize,
    actual: usize,
) -> TypeExtractorDiagnostic {
    let mut diagnostic = Diagnostic::new(
        TypeExtractorDiagnosticCategory::IntrinsicParameterMismatch,
        Severity::ERROR,
    );

    let message = format!(
        "Intrinsic type `{name}` expects {expected} type parameter{}, but {actual} {} provided",
        if expected == 1 { "" } else { "s" },
        if actual == 1 { "was" } else { "were" }
    );

    diagnostic
        .labels
        .push(Label::new(span, message).with_color(Color::Ansi(AnsiColor::Red)));

    let help_example = match name {
        "::kernel::type::List" => Cow::Borrowed("List<T>"),
        "::kernel::type::Dict" => Cow::Borrowed("Dict<K, V>"),
        _ => {
            let params = (0..expected)
                .map(|i| Cow::Owned(format!("T{}", i + 1)))
                .intersperse(Cow::Borrowed(", "))
                .collect::<String>();

            Cow::Owned(format!("{name}<{params}>"))
        }
    };

    diagnostic.help = Some(Help::new(format!("Use the correct form: `{help_example}`")));

    diagnostic
}

/// Creates a diagnostic for an unknown intrinsic type.
///
/// This diagnostic is generated when a reference to an unknown intrinsic type is encountered.
pub(crate) fn unknown_intrinsic_type(
    span: SpanId,
    name: &str,
    available: &[&str],
) -> TypeExtractorDiagnostic {
    let mut diagnostic = Diagnostic::new(
        TypeExtractorDiagnosticCategory::UnknownIntrinsicType,
        Severity::ERROR,
    );

    diagnostic.labels.push(
        Label::new(span, format!("Unknown intrinsic `{name}`"))
            .with_color(Color::Ansi(AnsiColor::Red)),
    );

    let similar: Vec<_> = available
        .iter()
        .copied()
        .filter(|intrinsic| jaro_winkler(intrinsic, name) > 0.7)
        .take(3)
        .collect();

    if !similar.is_empty() {
        let suggestions: String = similar.into_iter().intersperse("`, `").collect();

        diagnostic.help = Some(Help::new(format!("Did you mean `{suggestions}`?")));
    }

    let available: String = available.iter().copied().intersperse("`, `").collect();

    diagnostic.note = Some(Note::new(format!(
        "Available intrinsic types are: `{available}`"
    )));

    diagnostic
}

/// Creates a diagnostic for invalid item resolution.
///
/// This diagnostic is generated when a resolution succeeds but produces an item
/// of the wrong kind, which indicates a compiler bug.
pub(crate) fn invalid_resolved_item(
    span: SpanId,
    expected: Universe,
    actual: ItemKind,
) -> TypeExtractorDiagnostic {
    let mut diagnostic = Diagnostic::new(
        TypeExtractorDiagnosticCategory::InvalidResolution,
        Severity::COMPILER_BUG,
    );

    diagnostic.labels.push(
        Label::new(
            span,
            format!(
                "a {} was expected here",
                match expected {
                    Universe::Type => "value",
                    Universe::Value => "type",
                }
            ),
        )
        .with_color(Color::Ansi(AnsiColor::Red)),
    );

    diagnostic.help = Some(Help::new(format!("Found a {actual:?} instead")));

    diagnostic.note = Some(Note::new(
        "This is likely a compiler bug. An earlier compilation pass (the import resolver) \
         should've caught this error. Please report this issue to the HashQL team with a minimal \
         reproduction case.",
    ));

    diagnostic
}

/// Creates a diagnostic for a resolution error.
///
/// This diagnostic is generated when path resolution fails due to a compiler bug.
pub(crate) fn resolution_error(
    span: SpanId,
    path: &Path,
    error: &ResolutionError,
) -> TypeExtractorDiagnostic {
    let mut diagnostic = Diagnostic::new(
        TypeExtractorDiagnosticCategory::ResolutionError,
        Severity::COMPILER_BUG,
    );

    let path = path
        .segments
        .iter()
        .map(|segment| segment.name.value.as_str())
        .intersperse("::")
        .collect::<String>();

    diagnostic.labels.push(
        Label::new(span, format!("Failed to resolve '::{path}'"))
            .with_color(Color::Ansi(AnsiColor::Red)),
    );

    diagnostic.note = Some(Note::new(
        "This is likely a compiler bug. Path resolution should have succeeded or been caught \
         earlier. Please report this issue to the HashQL team with a minimal reproduction case.",
    ));

    diagnostic.help = Some(Help::new(format!(
        "The error which occured while trying to resolve was:\n\n{error:#?}",
    )));

    diagnostic
}

/// Creates a diagnostic for infer variable with arguments.
///
/// This diagnostic is generated when an inferred type ('_') is provided with type arguments,
/// which doesn't make sense semantically.
pub(crate) fn infer_with_arguments(
    infer_span: SpanId,
    arguments_span: SpanId,
) -> TypeExtractorDiagnostic {
    let mut diagnostic = Diagnostic::new(
        TypeExtractorDiagnosticCategory::InferWithArguments,
        Severity::ERROR,
    );

    diagnostic.labels.extend([
        Label::new(
            arguments_span,
            "These type arguments are not applicable to an inference placeholder",
        )
        .with_order(0)
        .with_color(Color::Ansi(AnsiColor::Red)),
        Label::new(infer_span, "... which is defined here")
            .with_order(-1)
            .with_color(Color::Ansi(AnsiColor::Blue)),
    ]);

    diagnostic.help = Some(Help::new(
        "Either remove the type arguments or replace '_' with a concrete generic type",
    ));

    diagnostic.note = Some(Note::new(
        "The type inference placeholder '_' represents a type that will be determined by the \
         compiler. It cannot accept type arguments because it doesn't represent a generic type.",
    ));

    diagnostic
}

/// Creates a diagnostic for duplicate struct fields.
///
/// This diagnostic is generated when a struct type definition contains duplicate field names.
pub(crate) fn duplicate_struct_fields(
    original_span: SpanId,
    duplicates: impl IntoIterator<Item = SpanId>,
    field_name: Symbol<'_>,
) -> TypeExtractorDiagnostic {
    let mut diagnostic = Diagnostic::new(
        TypeExtractorDiagnosticCategory::DuplicateStructField,
        Severity::ERROR,
    );

    diagnostic.labels.push(
        Label::new(
            original_span,
            format!("Field `{field_name}` first defined here"),
        )
        .with_order(1)
        .with_color(Color::Ansi(AnsiColor::Blue)),
    );

    let mut index = -1;
    for duplicate in duplicates {
        diagnostic.labels.push(
            Label::new(duplicate, "..., but was redefined here")
                .with_order(index)
                .with_color(Color::Ansi(AnsiColor::Red)),
        );

        index -= 1;
    }

    diagnostic.help = Some(Help::new("Rename or remove one of the duplicate fields"));

    diagnostic.note = Some(Note::new(
        "Struct types require unique field names to ensure clear and unambiguous access patterns.",
    ));

    diagnostic
}
