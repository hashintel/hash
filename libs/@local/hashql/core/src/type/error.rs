use alloc::borrow::Cow;

use hashql_diagnostics::{
    Diagnostic,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
    help::Help,
    label::Label,
    note::Note,
    severity::Severity,
};

use super::{Type, environment::Environment, pretty_print::PrettyPrint};
use crate::{span::SpanId, symbol::InternedSymbol};

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

const INTERSECTION_VARIANT_MISMATCH: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "intersection-variant-mismatch",
    name: "Intersection variant mismatch",
};

const STRUCT_FIELD_MISMATCH: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "struct-field-mismatch",
    name: "Struct field mismatch",
};

const DUPLICATE_STRUCT_FIELD: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "duplicate-struct-field",
    name: "Duplicate struct field",
};

const MISSING_STRUCT_FIELD: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "missing-struct-field",
    name: "Missing struct field",
};

const NO_TYPE_INFERENCE: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "no-type-inference",
    name: "No type inference substitution",
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
    IntersectionVariantMismatch,
    StructFieldMismatch,
    DuplicateStructField,
    MissingStructField,
    NoTypeInference,
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
            Self::IntersectionVariantMismatch => Some(&INTERSECTION_VARIANT_MISMATCH),
            Self::StructFieldMismatch => Some(&STRUCT_FIELD_MISMATCH),
            Self::DuplicateStructField => Some(&DUPLICATE_STRUCT_FIELD),
            Self::MissingStructField => Some(&MISSING_STRUCT_FIELD),
            Self::NoTypeInference => Some(&NO_TYPE_INFERENCE),
        }
    }
}

/// Creates a type mismatch diagnostic with specific labels for the left and right types
pub(crate) fn type_mismatch<T, U>(
    env: &Environment,

    lhs: Type<T>,
    rhs: Type<U>,

    help: Option<&str>,
) -> TypeCheckDiagnostic
where
    T: PrettyPrint,
    U: PrettyPrint,
{
    let mut diagnostic =
        Diagnostic::new(TypeCheckDiagnosticCategory::TypeMismatch, Severity::ERROR);

    diagnostic
        .labels
        .push(Label::new(env.source, "Type mismatch in this expression").with_order(3));

    diagnostic.labels.push(
        Label::new(
            lhs.span,
            format!("This is of type `{}`", lhs.kind.pretty_print(env, 80)),
        )
        .with_order(1),
    );

    diagnostic.labels.push(
        Label::new(
            rhs.span,
            format!("This is of type `{}`", rhs.kind.pretty_print(env, 80)),
        )
        .with_order(2),
    );

    if let Some(text) = help {
        diagnostic.help = Some(Help::new(text));
    }

    diagnostic.note = Some(Note::new(
        "This type system uses a combination of nominal and structural typing. Types are \
         compatible when they have the same structure (same fields/elements with compatible \
         types) or when they represent the same named type. Union types must have at least one \
         compatible variant, and intersection types require all constraints to be satisfied.",
    ));

    diagnostic
}

/// Creates a diagnostic for when there's no substitution available for an inference variable
///
/// This error occurs when type inference cannot determine a concrete type for a variable
/// because it wasn't constrained by any usage in the code.
pub(crate) fn no_type_inference<K>(env: &Environment, infer_type: Type<K>) -> TypeCheckDiagnostic
where
    K: PrettyPrint,
{
    let mut diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::NoTypeInference,
        // This is a compiler bug, as we should've encountered the `Infer` at an earlier stage
        Severity::COMPILER_BUG,
    );

    diagnostic.labels.push(
        Label::new(
            infer_type.span,
            "cannot infer the type of this expression; it is unconstrained",
        )
        .with_order(1),
    );

    diagnostic.labels.push(
        Label::new(
            env.source,
            "no constraints were generated for this type variable",
        )
        .with_order(2),
    );

    diagnostic.help = Some(Help::new(
        "This error occurs when the type system cannot determine a specific type for an \
         expression. Add explicit type annotations to help the compiler understand your intent.",
    ));

    diagnostic.note = Some(Note::new(
        "Type inference requires sufficient context to determine types. When a type variable has \
         no constraints from usage, the compiler cannot choose an appropriate type. Consider \
         adding an explicit type annotation or using the expression in a context that provides \
         more type information.",
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
        Diagnostic::new(TypeCheckDiagnosticCategory::CircularType, Severity::WARNING);

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
        "While circular type references are allowed, they can lead to infinite type expansion and \
         potential issues with type checking and serialization. Consider removing the circular \
         dependency.",
    ));

    diagnostic.note = Some(Note::new(
        "Circular type references create types that can expand infinitely. This may lead to \
         unpredictable behavior in some contexts like serialization, code generation, or when \
         working with external systems. While supported, use circular types with caution and \
         ensure you understand their implications.",
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

    lhs_name: InternedSymbol,
    rhs_name: InternedSymbol,
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
    // argument_id: GenericArgumentId,
) -> TypeCheckDiagnostic
where
    K: PrettyPrint,
{
    let argument_id = 12;
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
    bad_variant: Type<K1>,
    expected_union: Type<K2>,
) -> TypeCheckDiagnostic
where
    K1: PrettyPrint,
    K2: PrettyPrint,
{
    let mut diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::UnionVariantMismatch,
        Severity::ERROR,
    );

    // Primary: point at the failing variant
    diagnostic.labels.push(Label::new(
        bad_variant.span,
        format!(
            "variant `{}` must be a subtype of at least one variant in the expected union",
            bad_variant.kind.pretty_print(env, 80)
        ),
    ));

    // Secondary: point at the union we tried to match against
    diagnostic.labels.push(Label::new(
        expected_union.span,
        format!(
            "expected union containing at least one supertype variant for `{}`",
            bad_variant.kind.pretty_print(env, 80)
        ),
    ));

    diagnostic.help = Some(Help::new(
        "For a type `A | B` to be a subtype of `C | D`, every variant (A, B) must be a subtype of \
         at least one variant in the expected union (C, D).\nIn other words: (A <: C \u{2228} A \
         <: D) \u{2227} (B <: C \u{2228} B <: D)",
    ));

    diagnostic.note = Some(Note::new(format!(
        "expected union: `{}`\nfound variant: `{}` which is not a subtype of any expected variants",
        expected_union.kind.pretty_print(env, 80),
        bad_variant.kind.pretty_print(env, 80),
    )));

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

pub(crate) fn cannot_be_subtype_of_never<K>(
    env: &Environment,
    actual_type: Type<K>,
) -> TypeCheckDiagnostic
where
    K: PrettyPrint,
{
    let mut diagnostic =
        Diagnostic::new(TypeCheckDiagnosticCategory::TypeMismatch, Severity::ERROR);

    diagnostic
        .labels
        .push(Label::new(env.source, "This type cannot be a subtype of `!`").with_order(2));

    diagnostic.labels.push(
        Label::new(
            actual_type.span,
            format!(
                "This type `{}` has values, but `!` has no values",
                actual_type.kind.pretty_print(env, 80)
            ),
        )
        .with_order(1),
    );

    diagnostic.help = Some(Help::new(
        "Only the `!` (Never) type itself can be a subtype of `!`. Any type with values cannot be \
         a subtype of `!`, which by definition has no values.",
    ));

    diagnostic.note = Some(Note::new(
        "In type theory, the `!` type (also called 'bottom type' or 'Never') is a type with no \
         values. It can be a subtype of any type, but only `!` can be a subtype of `!`.",
    ));

    diagnostic
}

pub(crate) fn cannot_be_supertype_of_unknown<K>(
    env: &Environment,
    actual_type: Type<K>,
) -> TypeCheckDiagnostic
where
    K: PrettyPrint,
{
    let mut diagnostic =
        Diagnostic::new(TypeCheckDiagnosticCategory::TypeMismatch, Severity::ERROR);

    diagnostic
        .labels
        .push(Label::new(env.source, "This type cannot be a supertype of `?`").with_order(2));

    diagnostic.labels.push(
        Label::new(
            actual_type.span,
            format!(
                "{} is more specific than `?`",
                actual_type.kind.pretty_print(env, 80)
            ),
        )
        .with_order(1),
    );

    diagnostic.help = Some(Help::new(
        "Only the `?` (Unknown) type itself can be a supertype of `?`.",
    ));

    diagnostic.note = Some(Note::new(
        "In type theory, the `?` type (also called 'top type' or 'Unknown') is a type that \
         encompasses all values. It can be a supertype of any type, but only `?` can be a \
         supertype of `?`.",
    ));

    diagnostic
}

pub(crate) fn intersection_variant_mismatch<K1, K2>(
    env: &Environment,
    variant: Type<K1>,
    expected_intersection: Type<K2>,
) -> TypeCheckDiagnostic
where
    K1: PrettyPrint,
    K2: PrettyPrint,
{
    let mut diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::IntersectionVariantMismatch,
        Severity::ERROR,
    );

    // Primary: point at the failing variant
    diagnostic.labels.push(Label::new(
        variant.span,
        format!(
            "variant `{}` must be a subtype of all variants in the expected intersection",
            variant.kind.pretty_print(env, 80)
        ),
    ));

    // Secondary: point at the intersection we tried to match against
    diagnostic.labels.push(Label::new(
        expected_intersection.span,
        format!(
            "expected intersection containing incompatible variants for `{}`",
            variant.kind.pretty_print(env, 80)
        ),
    ));

    diagnostic.help = Some(Help::new(
        "For a type `A & B` to be a subtype of `C & D`, every variant (A, B) must be a subtype of \
         every variant in the expected intersection (C, D).\nIn other words: (A <: C) \u{2227} (A \
         <: D) \u{2227} (B <: C) \u{2227} (B <: D)",
    ));

    diagnostic.note = Some(Note::new(format!(
        "expected intersection: `{}`\nfound variant: `{}` which is not a subtype of all expected \
         variants",
        expected_intersection.kind.pretty_print(env, 80),
        variant.kind.pretty_print(env, 80),
    )));

    diagnostic
}

/// Creates a diagnostic for when structs have different field names or keys
///
/// This is used when two structs being compared have different fields,
/// which violates structural equivalence requirements.
pub(crate) fn struct_field_mismatch<K>(
    span: SpanId,
    lhs: Type<K>,
    rhs: Type<K>,
) -> TypeCheckDiagnostic
where
    K: PrettyPrint,
{
    let mut diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::StructFieldMismatch,
        Severity::ERROR,
    );

    diagnostic
        .labels
        .push(Label::new(span, "Structs have different field names").with_order(3));

    diagnostic
        .labels
        .push(Label::new(lhs.span, "This struct has a different set of fields").with_order(1));

    diagnostic
        .labels
        .push(Label::new(rhs.span, "... than this struct").with_order(2));

    diagnostic.help = Some(Help::new(
        "For structs to be equivalent, they must have exactly the same field names. Check that \
         both structs define the same set of fields.",
    ));

    diagnostic.note = Some(Note::new(
        "When comparing structs for equivalence, they must have the exact same field names. \
         Subtyping allows a struct with more fields to be a subtype of one with fewer fields, but \
         for equivalence they must match exactly.",
    ));

    diagnostic
}

/// Creates a diagnostic for when a struct has duplicate field names
///
/// This is used when a struct declaration contains multiple fields with the same name,
/// which is not allowed in the type system.
#[must_use]
pub fn duplicate_struct_field<K>(
    span: SpanId,
    struct_type: Type<K>,
    field_name: InternedSymbol,
) -> TypeCheckDiagnostic
where
    K: PrettyPrint,
{
    let mut diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::DuplicateStructField,
        Severity::ERROR,
    );

    diagnostic.labels.push(
        Label::new(
            span,
            format!("Duplicate field name '{field_name}' in struct"),
        )
        .with_order(2),
    );

    diagnostic.labels.push(
        Label::new(
            struct_type.span,
            "Field appears multiple times in this struct type",
        )
        .with_order(1),
    );

    diagnostic.help = Some(Help::new(
        "Each field in a struct must have a unique name. Remove or rename duplicate fields.",
    ));

    diagnostic.note = Some(Note::new(
        "Structs cannot have multiple fields with the same name, as this would make field access \
         ambiguous. Each field name must be unique within a struct.",
    ));

    diagnostic
}

/// Creates a diagnostic for when a struct is missing a required field for subtyping
///
/// This is used when a struct being checked for subtyping relationship is missing
/// a field that is present in the supertype, violating the subtyping requirements.
pub(crate) fn missing_struct_field<K>(
    span: SpanId,
    subtype: Type<K>,
    supertype: Type<K>,
    field_name: InternedSymbol,
) -> TypeCheckDiagnostic
where
    K: PrettyPrint,
{
    let mut diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::MissingStructField,
        Severity::ERROR,
    );

    diagnostic
        .labels
        .push(Label::new(span, format!("Missing required field '{field_name}'")).with_order(3));

    diagnostic
        .labels
        .push(Label::new(subtype.span, "This struct is missing a required field").with_order(1));

    diagnostic.labels.push(
        Label::new(
            supertype.span,
            format!("The field '{field_name}' is required by this type"),
        )
        .with_order(2),
    );

    diagnostic.help = Some(Help::new(
        "For a struct to be a subtype of another, it must contain all fields from the supertype. \
         Add the missing field to fix this error.",
    ));

    diagnostic.note = Some(Note::new(
        "In structural subtyping, a subtype can have more fields than its supertype (width \
         subtyping), but it must include all fields from the supertype with compatible types.",
    ));

    diagnostic
}
