use alloc::borrow::Cow;

use hashql_diagnostics::{
    Diagnostic,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
    help::Help,
    label::Label,
    note::Note,
    severity::Severity,
};

use super::{
    Type, environment::Environment, kind::generic_argument::GenericArgumentId,
    pretty_print::PrettyPrint,
};
use crate::span::SpanId;

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

const TUPLE_LENGTH_MISMATCH: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "tuple-length-mismatch",
    name: "Tuple length mismatch",
};

const OPAQUE_TYPE_NAME_MISMATCH: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "opaque-type-name-mismatch",
    name: "Opaque type name mismatch",
};

const GENERIC_ARGUMENT_NOT_FOUND: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "generic-argument-not-found",
    name: "Generic argument not found",
};

const FUNCTION_PARAMETER_COUNT_MISMATCH: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "function-parameter-count-mismatch",
    name: "Function parameter count mismatch",
};

const UNION_VARIANT_MISMATCH: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "union-variant-mismatch",
    name: "Union variant mismatch",
};

const INTERSECTION_COERCION: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "intersection-coercion",
    name: "Intersection coercion to Never",
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum TypeCheckDiagnosticCategory {
    TypeMismatch,
    CircularType,
    ExpectedNever,
    TupleLengthMismatch,
    OpaqueTypeNameMismatch,
    GenericArgumentNotFound,
    UnionVariantMismatch,
    FunctionParameterCountMismatch,
    IntersectionCoercion,
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
            Self::TupleLengthMismatch => Some(&TUPLE_LENGTH_MISMATCH),
            Self::OpaqueTypeNameMismatch => Some(&OPAQUE_TYPE_NAME_MISMATCH),
            Self::GenericArgumentNotFound => Some(&GENERIC_ARGUMENT_NOT_FOUND),
            Self::UnionVariantMismatch => Some(&UNION_VARIANT_MISMATCH),
            Self::FunctionParameterCountMismatch => Some(&FUNCTION_PARAMETER_COUNT_MISMATCH),
            Self::IntersectionCoercion => Some(&INTERSECTION_COERCION),
        }
    }
}

/// Creates a type mismatch diagnostic with specific labels for the left and right types
pub(crate) fn type_mismatch<K>(
    env: &Environment,

    lhs: Type<K>,
    rhs: Type<K>,

    help: Option<&str>,
) -> TypeCheckDiagnostic
where
    K: PrettyPrint,
{
    let mut diagnostic =
        Diagnostic::new(TypeCheckDiagnosticCategory::TypeMismatch, Severity::ERROR);

    diagnostic
        .labels
        .push(Label::new(env.source, "Type mismatch in this expression").with_order(3));

    diagnostic.labels.push(
        Label::new(
            lhs.span,
            format!("This is of type `{}`", lhs.kind.pretty_print(&env, 80)),
        )
        .with_order(1),
    );

    diagnostic.labels.push(
        Label::new(
            rhs.span,
            format!("This is of type `{}`", rhs.kind.pretty_print(&env, 80)),
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
    lhs: Type<K>,
    rhs: Type<K>,
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
pub(crate) fn expected_never<K>(env: &Environment, actual_type: &Type<K>) -> TypeCheckDiagnostic
where
    K: PrettyPrint,
{
    let mut diagnostic =
        Diagnostic::new(TypeCheckDiagnosticCategory::ExpectedNever, Severity::ERROR);

    diagnostic
        .labels
        .push(Label::new(env.source, "This expression should not return a value").with_order(2));

    diagnostic.labels.push(
        Label::new(
            actual_type.span,
            format!(
                "But it returns a value of type `{}`",
                actual_type.kind.pretty_print(&env, 80)
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

/// Creates a diagnostic for when tuple types have a different number of fields
pub(crate) fn tuple_length_mismatch<K>(
    span: SpanId,
    lhs: Type<K>,
    rhs: Type<K>,
    lhs_len: usize,
    rhs_len: usize,
) -> TypeCheckDiagnostic
where
    K: PrettyPrint,
{
    let mut diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::TupleLengthMismatch,
        Severity::ERROR,
    );

    diagnostic
        .labels
        .push(Label::new(span, "The tuples have different numbers of elements").with_order(3));

    diagnostic.labels.push(
        Label::new(
            lhs.span,
            format!(
                "This tuple has {} element{}",
                lhs_len,
                if lhs_len == 1 { "" } else { "s" }
            ),
        )
        .with_order(1),
    );

    diagnostic.labels.push(
        Label::new(
            rhs.span,
            format!(
                "This tuple has {} element{}",
                rhs_len,
                if rhs_len == 1 { "" } else { "s" }
            ),
        )
        .with_order(2),
    );

    diagnostic.help = Some(Help::new(
        "Tuples must have the same number of elements to be compatible. You need to adjust one of \
         the tuples to match the other's length.",
    ));

    diagnostic.note = Some(Note::new(
        "Unlike some collections, tuples have a fixed length that is part of their type. This \
         means (String, Number) and (String, Number, Boolean) are completely different types.",
    ));

    diagnostic
}

/// Creates a diagnostic for when opaque types have different names
pub(crate) fn opaque_type_name_mismatch<K>(
    span: SpanId,

    lhs: Type<K>,
    rhs: Type<K>,

    lhs_name: &str,
    rhs_name: &str,
) -> TypeCheckDiagnostic
where
    K: PrettyPrint,
{
    let mut diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::OpaqueTypeNameMismatch,
        Severity::ERROR,
    );

    diagnostic.labels.push(
        Label::new(
            span,
            "These named types are different and cannot be used interchangeably",
        )
        .with_order(3),
    );

    diagnostic
        .labels
        .push(Label::new(lhs.span, format!("This is type '{lhs_name}'")).with_order(1));

    diagnostic
        .labels
        .push(Label::new(rhs.span, format!("This is type '{rhs_name}'")).with_order(2));

    diagnostic.help = Some(Help::new(
        "Named types can only be used with other instances of the exact same type. This is \
         similar to how 'UserId' and 'PostId' would be different types even if they're both \
         numbers underneath.",
    ));

    diagnostic.note = Some(Note::new(
        "This distinction prevents accidentally mixing up different types that happen to have the \
         same internal structure, helping catch logical errors in your code.",
    ));

    diagnostic
}

/// Creates a diagnostic for when a generic argument is not found in the current scope
pub(crate) fn generic_argument_not_found<K>(
    span: SpanId,
    param_type: Type<K>,
    argument_id: GenericArgumentId,
) -> TypeCheckDiagnostic
where
    K: PrettyPrint,
{
    let mut diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::GenericArgumentNotFound,
        Severity::ERROR,
    );

    diagnostic
        .labels
        .push(Label::new(span, "Generic argument not found in this context").with_order(2));

    diagnostic.labels.push(
        Label::new(
            param_type.span,
            format!("This parameter refers to an undefined generic argument ID {argument_id}"),
        )
        .with_order(1),
    );

    diagnostic.help = Some(Help::new(
        "This error occurs when a type parameter references a generic argument that is not in \
         scope. Make sure all generic arguments are properly defined and in scope before using \
         them.",
    ));

    diagnostic.note = Some(Note::new(
        "Generic arguments must be entered into scope before they can be referenced. This \
         typically happens during instantiation of generic types or when entering function bodies \
         with generic parameters.",
    ));

    diagnostic
}

/// Creates a diagnostic for when a union type variant doesn't match any variant in the expected
/// union type
pub(crate) fn union_variant_mismatch<K1, K2>(
    env: &Environment,
    variant_type: &Type<K1>,
    expected_union_type: &Type<K2>,
) -> TypeCheckDiagnostic
where
    K1: PrettyPrint,
    K2: PrettyPrint,
{
    let mut diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::UnionVariantMismatch,
        Severity::ERROR,
    );

    diagnostic.labels.push(
        Label::new(
            env.source,
            "This union type contains an incompatible variant",
        )
        .with_order(3),
    );

    diagnostic.labels.push(
        Label::new(
            variant_type.span,
            format!(
                "This variant of type `{}` is not compatible with any variant in the expected \
                 union",
                variant_type.kind.pretty_print(&env, 80)
            ),
        )
        .with_order(1),
    );

    diagnostic.labels.push(
        Label::new(
            expected_union_type.span,
            format!(
                "Expected a variant compatible with this union type `{}`",
                expected_union_type.kind.pretty_print(&env, 80)
            ),
        )
        .with_order(2),
    );

    diagnostic.help = Some(Help::new(
        "For a union type to be compatible with another, each of its variants must be compatible \
         with at least one variant in the other union. Check that the problematic variant matches \
         the expected type structure.",
    ));

    diagnostic.note = Some(Note::new(
        "Union types follow subtyping rules where (A | B) <: C if and only if A <: C and B <: C. \
         This means each variant in the provided union must be a subtype of at least one variant \
         in the expected union.",
    ));

    diagnostic
}

/// Creates a diagnostic for when a function has the wrong number of parameters.
///
/// This is used when a function type has a different number of parameters than expected,
/// which is an invariant property of function types.
pub(crate) fn function_parameter_count_mismatch<K>(
    span: SpanId,

    lhs: Type<K>,
    rhs: Type<K>,

    lhs_param_count: usize,
    rhs_param_count: usize,
) -> TypeCheckDiagnostic
where
    K: PrettyPrint,
{
    let mut diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::FunctionParameterCountMismatch,
        Severity::ERROR,
    );

    diagnostic
        .labels
        .push(Label::new(span, "Function has wrong number of parameters").with_order(3));

    diagnostic.labels.push(
        Label::new(
            lhs.span,
            format!(
                "This function type expects {} parameter{}",
                lhs_param_count,
                if lhs_param_count == 1 { "" } else { "s" }
            ),
        )
        .with_order(1),
    );

    diagnostic.labels.push(
        Label::new(
            rhs.span,
            format!(
                "This function has {} parameter{}",
                rhs_param_count,
                if rhs_param_count == 1 { "" } else { "s" }
            ),
        )
        .with_order(2),
    );

    diagnostic.help = Some(Help::new(
        "Function types must have the same number of parameters to be compatible. Check that \
         you're using the correct function type with the right number of parameters.",
    ));

    diagnostic.note = Some(Note::new(
        "In strongly typed languages, functions with different numbers of parameters are \
         considered different types, even if the parameters they do have are compatible.",
    ));

    diagnostic
}

pub(crate) fn intersection_coerced_to_never<K1, K2>(
    env: &Environment,

    lhs: Type<K1>,
    rhs: Type<K2>,

    reason: &str,
) -> TypeCheckDiagnostic
where
    K1: PrettyPrint,
    K2: PrettyPrint,
{
    let mut diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::IntersectionCoercion,
        Severity::INFO,
    );

    diagnostic.labels.push(
        Label::new(
            env.source,
            "This intersection operation results in an empty type (Never)",
        )
        .with_order(3),
    );

    diagnostic.labels.push(
        Label::new(
            lhs.span,
            format!("this is of type: `{}`", lhs.kind.pretty_print(&env, 80)),
        )
        .with_order(1),
    );

    diagnostic.labels.push(
        Label::new(
            rhs.span,
            format!("this is of type: `{}`", rhs.kind.pretty_print(&env, 80)),
        )
        .with_order(2),
    );

    diagnostic.help = Some(Help::new(reason));

    diagnostic.note = Some(Note::new(
        "When two types have an empty intersection, the result is the Never type. This means \
         there are no values that can satisfy both type constraints simultaneously.",
    ));

    diagnostic
}
