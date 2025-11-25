use alloc::borrow::Cow;
use core::cmp::Ordering;

use hashql_core::{
    algorithms::did_you_mean,
    heap::Heap,
    module::{Universe, error::ResolutionError, item::ItemKind},
    span::SpanId,
    symbol::Symbol,
    r#type::{error::TypeCheckDiagnosticCategory, kind::generic::GenericArgumentReference},
};
use hashql_diagnostics::{
    Diagnostic, DiagnosticIssues, Label,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
    diagnostic::Message,
    severity::Severity,
};

use super::translate::VariableReference;
use crate::node::path::{Path, PathSegmentArgument};

pub(crate) type TypeExtractorDiagnostic = Diagnostic<TypeExtractorDiagnosticCategory, SpanId>;
pub(crate) type TypeExtractorDiagnosticIssues =
    DiagnosticIssues<TypeExtractorDiagnosticCategory, SpanId>;

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

const GENERIC_CONSTRAINT_NOT_ALLOWED: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "generic-constraint-not-allowed",
    name: "Constraint not allowed in generic arguments",
};

const UNUSED_GENERIC_PARAMETER: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "unused-generic-parameter",
    name: "Generic parameter not used in type definition",
};

const NON_CONTRACTIVE_TYPE: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "non-contractive-type",
    name: "Invalid recursive type definition",
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum TypeExtractorDiagnosticCategory {
    DuplicateTypeAlias,
    DuplicateNewtype,
    GenericParameterMismatch,
    UnboundTypeVariable,
    IntrinsicParameterMismatch,
    UnknownIntrinsicType,
    InvalidResolution,
    ResolutionError,
    InferWithArguments,
    DuplicateStructField,
    GenericConstraintNotAllowed,
    UnusedGenericParameter,
    NonContractiveType,
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
            Self::IntrinsicParameterMismatch => Some(&INTRINSIC_PARAMETER_MISMATCH),
            Self::UnknownIntrinsicType => Some(&UNKNOWN_INTRINSIC_TYPE),
            Self::InvalidResolution => Some(&INVALID_RESOLUTION),
            Self::ResolutionError => Some(&RESOLUTION_ERROR),
            Self::InferWithArguments => Some(&INFER_WITH_ARGUMENTS),
            Self::DuplicateStructField => Some(&DUPLICATE_STRUCT_FIELD),
            Self::GenericConstraintNotAllowed => Some(&GENERIC_CONSTRAINT_NOT_ALLOWED),
            Self::UnusedGenericParameter => Some(&UNUSED_GENERIC_PARAMETER),
            Self::NonContractiveType => Some(&NON_CONTRACTIVE_TYPE),
            Self::TypeCheck(category) => Some(category),
        }
    }
}

/// Creates a diagnostic for a duplicate type alias name.
///
/// This diagnostic is generated when the type extractor finds a duplicate type alias name
/// which should have been prevented by the name mangler at an earlier stage.
#[coverage(off)] // Compiler Bugs should never be hit
pub(crate) fn duplicate_type_alias(
    original_span: SpanId,
    duplicate_span: SpanId,
    name: Symbol<'_>,
) -> TypeExtractorDiagnostic {
    let mut diagnostic = Diagnostic::new(
        TypeExtractorDiagnosticCategory::DuplicateTypeAlias,
        Severity::Bug,
    )
    .primary(Label::new(
        original_span,
        format!("Type '{name}' first defined here"),
    ));

    diagnostic
        .labels
        .push(Label::new(duplicate_span, "... but was redefined here"));

    diagnostic.add_message(Message::note(
        "This likely represents a compiler bug in the name mangling pass. The name mangler should \
         have given these identical names unique internal identifiers to avoid this collision.",
    ));

    diagnostic
}

/// Creates a diagnostic for when a constraint is used in a generic argument position.
///
/// This diagnostic is generated when a generic constraint (like `T: Bound`) is used in a place
/// where only a type argument is allowed, such as in `Foo<T: Bound>`.
pub(crate) fn generic_constraint_not_allowed(
    constraint_span: SpanId,
    type_span: SpanId,
    name: Symbol<'_>,
) -> TypeExtractorDiagnostic {
    let mut diagnostic = Diagnostic::new(
        TypeExtractorDiagnosticCategory::GenericConstraintNotAllowed,
        Severity::Error,
    )
    .primary(Label::new(
        constraint_span,
        format!("Constraint on `{name}` not allowed here"),
    ));

    diagnostic
        .labels
        .push(Label::new(type_span, "... in this type instantiation"));

    diagnostic.add_message(Message::help(format!("Use `{name}` without a constraint")));

    diagnostic.add_message(Message::note(
        "Type constraints cannot be specified at the usage site in HashQL. Constraints on type \
         parameters must be declared where the type is defined, not where it is used.",
    ));

    diagnostic
}

/// Creates a diagnostic for a duplicate newtype name.
///
/// This diagnostic is generated when the type extractor finds a duplicate newtype name
/// which should have been prevented by the name mangler at an earlier stage.
#[coverage(off)] // Compiler Bugs should never be hit
pub(crate) fn duplicate_newtype(
    original_span: SpanId,
    duplicate_span: SpanId,
    name: Symbol<'_>,
) -> TypeExtractorDiagnostic {
    let mut diagnostic = Diagnostic::new(
        TypeExtractorDiagnosticCategory::DuplicateNewtype,
        Severity::Bug,
    )
    .primary(Label::new(
        original_span,
        format!("Newtype '{name}' first defined here"),
    ));

    diagnostic
        .labels
        .push(Label::new(duplicate_span, "... but was redefined here"));

    diagnostic.add_message(Message::note(
        "This likely represents a compiler bug in the name mangling pass. The compiler \
         encountered duplicate newtype definitions with the same name that should have been given \
         unique internal identifiers. The name mangler should have prevented this collision \
         automatically.",
    ));

    diagnostic
}

fn demangle_unwrap(symbol: Symbol<'_>) -> &str {
    symbol.demangle()
}

fn demangle<'s>(symbol: &'s Symbol) -> &'s str {
    demangle_unwrap(*symbol)
}

/// Creates a diagnostic for incorrect generic parameter count.
///
/// This diagnostic is generated when a type is provided with an incorrect number of generic
/// parameters. It handles both too many and too few parameters cases.
pub(crate) fn generic_parameter_mismatch<'heap, T>(
    variable: &VariableReference,
    parameters: &[T],
    arguments: &[PathSegmentArgument<'heap>],
) -> TypeExtractorDiagnostic
where
    T: Into<GenericArgumentReference<'heap>> + Copy,
{
    let diagnostic = Diagnostic::new(
        TypeExtractorDiagnosticCategory::GenericParameterMismatch,
        Severity::Error,
    );

    let name = match variable {
        VariableReference::Local(ident) => Cow::Borrowed(demangle(&ident.value)),
        VariableReference::Global(path) => path
            .rooted
            .then_some("")
            .into_iter()
            .chain(
                path.segments
                    .iter()
                    .map(|segment| segment.name.value.as_str()),
            )
            .intersperse("::")
            .collect(),
    };

    let expected = parameters.len();
    let actual = arguments.len();

    let missing = parameters.get(actual..).unwrap_or(&[]);
    let extraneous = arguments.get(expected..).unwrap_or(&[]);

    let message = if actual < expected {
        format!(
            "Type `{name}` needs {expected} type parameter{}, but only {actual} {} provided",
            if expected == 1 { "" } else { "s" },
            if actual == 1 { "was" } else { "were" }
        )
    } else {
        format!(
            "Type `{name}` takes {expected} type parameter{}, but {actual} {} provided",
            if expected == 1 { "" } else { "s" },
            if actual == 1 { "was" } else { "were" }
        )
    };

    let mut diagnostic = diagnostic.primary(Label::new(variable.span(), message));

    for &missing in missing {
        diagnostic.labels.push(Label::new(
            variable.span(),
            format!(
                "Missing parameter `{}`",
                demangle_unwrap(missing.into().name)
            ),
        ));
    }

    for extraneous in extraneous {
        diagnostic
            .labels
            .push(Label::new(extraneous.span(), "Remove this argument"));
    }

    let params = parameters
        .iter()
        .map(|&param| demangle_unwrap(param.into().name))
        .intersperse(", ")
        .collect::<String>();

    let usage = format!("`{name}<{params}>`");

    let help = match actual.cmp(&expected) {
        Ordering::Less => format!("Add the missing parameter(s): {usage}"),
        Ordering::Greater => format!("Remove the extra parameter(s): {usage}"),
        Ordering::Equal => format!("Use: {usage}"),
    };

    diagnostic.add_message(Message::help(help));

    diagnostic.add_message(Message::note(
        "Generic type parameters allow types to work with different data types while maintaining \
         type safety. Each generic type has specific requirements for the number and names of \
         type parameters it accepts. For example, List<T> requires exactly one type parameter, \
         while Dict<K, V> requires two.",
    ));

    diagnostic
}

/// Creates a diagnostic for an unbound type variable.
///
/// This diagnostic is generated when a variable reference cannot be resolved within
/// the current scope, which should have been caught by an earlier pass.
#[coverage(off)] // Compiler Bugs should never be hit
pub(crate) fn unbound_type_variable<'heap>(
    span: SpanId,
    name: Symbol<'heap>,
    locals: impl IntoIterator<Item = Symbol<'heap>> + Clone,
) -> TypeExtractorDiagnostic {
    let mut diagnostic = Diagnostic::new(
        TypeExtractorDiagnosticCategory::UnboundTypeVariable,
        Severity::Bug,
    )
    .primary(Label::new(span, format!("Cannot find type '{name}'")));

    let suggestions = did_you_mean(name, locals, Some(3), None);

    if !suggestions.is_empty() {
        let suggestions: String = suggestions
            .iter()
            .map(demangle)
            .intersperse("`, `")
            .collect();

        diagnostic.add_message(Message::help(format!("Did you mean `{suggestions}`?")));
    }

    diagnostic.add_message(Message::note(
        "This is likely a compiler bug in the name resolution system. The type checker has \
         encountered a name that wasn't properly resolved earlier in compilation. The name \
         resolution pass should have caught this error or provided a more specific error message.",
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
    let diagnostic = Diagnostic::new(
        TypeExtractorDiagnosticCategory::IntrinsicParameterMismatch,
        Severity::Error,
    );

    let message = if actual < expected {
        format!(
            "Intrinsic `{name}` needs {expected} parameter{}, but found {actual}",
            if expected == 1 { "" } else { "s" }
        )
    } else {
        format!(
            "Intrinsic `{name}` takes {expected} parameter{}, but found {actual}",
            if expected == 1 { "" } else { "s" }
        )
    };

    let mut diagnostic = diagnostic.primary(Label::new(span, message));

    let help_example = match name {
        "::kernel::type::List" => Cow::Borrowed("List<ElementType>"),
        "::kernel::type::Dict" => Cow::Borrowed("Dict<KeyType, ValueType>"),
        _ => {
            let params = (0..expected)
                .map(|i| Cow::Owned(format!("T{}", i + 1)))
                .intersperse(Cow::Borrowed(", "))
                .collect::<String>();

            Cow::Owned(format!("{name}<{params}>"))
        }
    };

    let help_message = if actual < expected {
        format!("Add missing parameter(s): `{help_example}`")
    } else {
        format!("Remove extra parameter(s): `{help_example}`")
    };

    diagnostic.add_message(Message::help(help_message));

    // Add a note explaining the purpose of the intrinsic type
    let note_message = match name {
        "::kernel::type::List" => {
            "List is a generic container that requires exactly one type parameter specifying the \
             element type. For example, List<String> is a list of strings, while List<Number> is a \
             list of numbers."
        }
        "::kernel::type::Dict" => {
            "Dict is a key-value mapping that requires exactly two type parameters: the key type \
             and the value type. For example, Dict<String, Number> maps string keys to number \
             values."
        }
        _ => {
            "Intrinsic types are built-in types provided by the language with specific \
             requirements for their type parameters. Each intrinsic has a defined number of type \
             parameters it can accept."
        }
    };

    diagnostic.add_message(Message::note(note_message));

    diagnostic
}

/// Creates a diagnostic for an unknown intrinsic type.
///
/// This diagnostic is generated when a reference to an unknown intrinsic type is encountered.
#[coverage(off)] // Compiler Bugs should never be hit
pub(crate) fn unknown_intrinsic_type(
    span: SpanId,
    heap: &Heap,
    name: &str,
    available: &[&str],
) -> TypeExtractorDiagnostic {
    let mut diagnostic = Diagnostic::new(
        TypeExtractorDiagnosticCategory::UnknownIntrinsicType,
        Severity::Bug,
    )
    .primary(Label::new(span, format!("Unknown intrinsic type `{name}`")));

    let similar = did_you_mean(
        heap.intern_symbol(name),
        available.iter().map(|name| heap.intern_symbol(name)),
        Some(3),
        None,
    );

    if similar.is_empty() {
        // Provide helpful guidance even without close matches
        diagnostic.add_message(Message::help(
            "Check the HashQL documentation for a complete list of available intrinsic types. \
             Make sure you're using the correct namespace and capitalization for the type you're \
             trying to use.",
        ));
    } else {
        let suggestions: String = similar
            .into_iter()
            .map(|symbol| symbol.unwrap())
            .intersperse("`, `")
            .collect();

        diagnostic.add_message(Message::help(format!("Did you mean `{suggestions}`?")));
    }

    let available: String = available.iter().copied().intersperse("`, `").collect();

    diagnostic.add_message(Message::note(format!(
        "Available intrinsic types: `{available}`\n\nIntrinsic types are fundamental building \
         blocks provided by the language runtime. They form the basis of the type system and \
         cannot be redefined by user code.\n\nThis is likely a compiler bug. The import resolver \
         should've caught this error beforehand."
    )));

    diagnostic
}

/// Creates a diagnostic for invalid item resolution.
///
/// This diagnostic is generated when a resolution succeeds but produces an item
/// of the wrong kind, which indicates a compiler bug.
#[coverage(off)] // Compiler Bugs should never be hit
pub(crate) fn invalid_resolved_item(
    span: SpanId,
    expected: Universe,
    actual: ItemKind,
) -> TypeExtractorDiagnostic {
    let mut diagnostic = Diagnostic::new(
        TypeExtractorDiagnosticCategory::InvalidResolution,
        Severity::Bug,
    )
    .primary(Label::new(
        span,
        format!(
            "a {} was expected here",
            match expected {
                Universe::Type => "value",
                Universe::Value => "type",
            }
        ),
    ));

    diagnostic.add_message(Message::help(format!(
        "Found a {actual:?} instead of a {}. This is an internal compiler issue with type \
         resolution, not a problem with your code.",
        match expected {
            Universe::Type => "type",
            Universe::Value => "value",
        }
    )));

    diagnostic.add_message(Message::note(
        "This is likely a compiler bug in the import resolution system. The compiler has confused \
         types and values during name resolution. The import resolver should have caught this \
         error before reaching this stage.",
    ));

    diagnostic
}

/// Creates a diagnostic for a resolution error.
///
/// This diagnostic is generated when path resolution fails due to a compiler bug.
#[coverage(off)] // Compiler Bugs should never be hit
pub(crate) fn resolution_error(path: &Path, error: &ResolutionError) -> TypeExtractorDiagnostic {
    let diagnostic = Diagnostic::new(
        TypeExtractorDiagnosticCategory::ResolutionError,
        Severity::Bug,
    );

    let path_display = path
        .rooted
        .then_some("::")
        .into_iter()
        .chain(
            path.segments
                .iter()
                .map(|segment| segment.name.value.as_str()),
        )
        .intersperse("::")
        .collect::<String>();

    let mut diagnostic = diagnostic.primary(Label::new(
        path.span,
        format!("Could not resolve '{path_display}'"),
    ));

    diagnostic.add_message(Message::note(
        "This is likely a compiler bug in the name resolution system. During type checking, the \
         compiler failed to resolve a path that should have been properly processed by earlier \
         compilation stages. Either the path resolution should have succeeded or a more specific \
         error should have been reported earlier in compilation.",
    ));
    diagnostic.add_message(Message::note(format!(
        "Technical error details:\n{error:#?}"
    )));

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
        Severity::Error,
    )
    .primary(Label::new(
        original_span,
        format!("Field `{field_name}` first defined here"),
    ));

    for duplicate in duplicates {
        diagnostic
            .labels
            .push(Label::new(duplicate, "..., but was redefined here"));
    }

    diagnostic.add_message(Message::help(format!(
        "To fix this error, you can either:\n1. Rename the duplicate `{field_name}` field to a \
         different name, or\n2. Remove the redundant field definition entirely if it's not needed"
    )));

    diagnostic.add_message(Message::note(
        "Struct types in HashQL require that each field has a unique name. Having multiple fields \
         with the same name would create ambiguity when accessing fields through dot notation or \
         destructuring. The compiler enforces this constraint to ensure clear and predictable \
         access patterns for struct data.",
    ));

    diagnostic
}

/// Creates a diagnostic for a generic parameter that's declared but not used in a type definition.
///
/// This is emitted when a type declares a generic parameter but doesn't use it in its body,
/// for example: `type Option<T, E> = Some<T> | None` where `E` is never referenced.
pub(crate) fn unused_generic_parameter(
    param: GenericArgumentReference,
    param_span: SpanId,

    type_def_span: SpanId,
) -> TypeExtractorDiagnostic {
    let mut diagnostic = Diagnostic::new(
        TypeExtractorDiagnosticCategory::UnusedGenericParameter,
        Severity::Error,
    )
    .primary(Label::new(
        param_span,
        format!(
            "Generic parameter `{}` declared here...",
            demangle(&param.name)
        ),
    ));

    diagnostic.labels.push(Label::new(
        type_def_span,
        "...but never used in this type definition",
    ));

    diagnostic.add_message(Message::help(format!(
        "Generic parameter `{}` is declared but not referenced. Either remove the unused \
         parameter or incorporate it into your type definition.",
        demangle(&param.name)
    )));

    diagnostic.add_message(Message::note(
        "Each generic parameter should serve a purpose in parameterizing the type. Unused \
         parameters can make code harder to understand and may indicate a design oversight or \
         incomplete implementation. They are unconstrained variables, and therefore considered \
         erroneous.",
    ));

    diagnostic
}

/// Creates a diagnostic for a non-contractive recursive type.
///
/// This diagnostic is generated when a recursive type definition violates the contractive
/// constraint, which could lead to non-termination during type checking. A recursive type
/// is contractive if every recursive reference is protected by at least one type constructor.
pub(crate) fn non_contractive_recursive_type(
    type_span: SpanId,
    recursive_ref_span: SpanId,
    type_name: Symbol<'_>,
) -> TypeExtractorDiagnostic {
    let type_name = demangle_unwrap(type_name);

    let mut diagnostic = Diagnostic::new(
        TypeExtractorDiagnosticCategory::NonContractiveType,
        Severity::Error,
    )
    .primary(Label::new(
        recursive_ref_span,
        format!("Type `{type_name}` cannot reference itself directly"),
    ));

    diagnostic.labels.push(Label::new(
        type_span,
        "... in this recursive type definition",
    ));

    diagnostic.add_message(Message::help(format!(
        "Add structure around the recursive reference. Such as, but not limited to, a struct, \
         tuple, or union with at least one non-recursive alternative:\n- `type {type_name} = \
         {type_name} | Null`\n- `type {type_name} = (value: {type_name})`\n- `type {type_name} = \
         ({type_name}, String)`"
    )));

    diagnostic.add_message(Message::note(
        "Recursive types need some 'structure' between the type and itself (be 'contractive') to \
         ensure type checking terminates. This means every recursive reference must be protected \
         by at least one type constructor (struct, tuple, etc.). Direct self-references like \
         `type T = T` are not allowed as they do not guarantee progression during type checking.",
    ));

    diagnostic
}
