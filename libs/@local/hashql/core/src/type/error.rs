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
    Type, environment::Environment, inference::Variable, kind::generic::GenericArgumentId,
};
use crate::{
    pretty::{PrettyOptions, PrettyPrint},
    span::SpanId,
    symbol::Symbol,
};

pub type TypeCheckDiagnostic = Diagnostic<TypeCheckDiagnosticCategory, SpanId>;

const TYPE_MISMATCH: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "type-mismatch",
    name: "Type mismatch",
};

const CIRCULAR_TYPE: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "circular-type",
    name: "Circular type reference",
};

const TUPLE_LENGTH_MISMATCH: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "tuple-length-mismatch",
    name: "Tuple length mismatch",
};

const OPAQUE_TYPE_NAME_MISMATCH: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "opaque-type-name-mismatch",
    name: "Opaque type name mismatch",
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

const BOUND_CONSTRAINT_VIOLATION: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "bound-constraint-violation",
    name: "Type bound constraint violation",
};

const UNCONSTRAINED_TYPE_VARIABLE: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "unconstrained-type-variable",
    name: "Unconstrained type variable",
};

const INCOMPATIBLE_LOWER_EQUAL_CONSTRAINT: TerminalDiagnosticCategory =
    TerminalDiagnosticCategory {
        id: "incompatible-lower-equal-constraint",
        name: "Incompatible lower bound and equality constraint",
    };

const INCOMPATIBLE_UPPER_EQUAL_CONSTRAINT: TerminalDiagnosticCategory =
    TerminalDiagnosticCategory {
        id: "incompatible-upper-equal-constraint",
        name: "Incompatible upper bound and equality constraint",
    };

const CONFLICTING_EQUALITY_CONSTRAINTS: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "conflicting-equality-constraints",
    name: "Conflicting equality constraints",
};

const TYPE_PARAMETER_NOT_FOUND: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "type-parameter-not-found",
    name: "Type parameter not found",
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum TypeCheckDiagnosticCategory {
    TypeMismatch,
    CircularType,
    TupleLengthMismatch,
    OpaqueTypeNameMismatch,
    UnionVariantMismatch,
    FunctionParameterCountMismatch,
    IntersectionVariantMismatch,
    StructFieldMismatch,
    DuplicateStructField,
    MissingStructField,
    NoTypeInference,
    BoundConstraintViolation,
    UnconstrainedTypeVariable,
    IncompatibleLowerEqualConstraint,
    IncompatibleUpperEqualConstraint,
    ConflictingEqualityConstraints,
    TypeParameterNotFound,
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
            Self::TupleLengthMismatch => Some(&TUPLE_LENGTH_MISMATCH),
            Self::OpaqueTypeNameMismatch => Some(&OPAQUE_TYPE_NAME_MISMATCH),
            Self::UnionVariantMismatch => Some(&UNION_VARIANT_MISMATCH),
            Self::FunctionParameterCountMismatch => Some(&FUNCTION_PARAMETER_COUNT_MISMATCH),
            Self::IntersectionVariantMismatch => Some(&INTERSECTION_VARIANT_MISMATCH),
            Self::StructFieldMismatch => Some(&STRUCT_FIELD_MISMATCH),
            Self::DuplicateStructField => Some(&DUPLICATE_STRUCT_FIELD),
            Self::MissingStructField => Some(&MISSING_STRUCT_FIELD),
            Self::NoTypeInference => Some(&NO_TYPE_INFERENCE),
            Self::BoundConstraintViolation => Some(&BOUND_CONSTRAINT_VIOLATION),
            Self::UnconstrainedTypeVariable => Some(&UNCONSTRAINED_TYPE_VARIABLE),
            Self::IncompatibleLowerEqualConstraint => Some(&INCOMPATIBLE_LOWER_EQUAL_CONSTRAINT),
            Self::IncompatibleUpperEqualConstraint => Some(&INCOMPATIBLE_UPPER_EQUAL_CONSTRAINT),
            Self::ConflictingEqualityConstraints => Some(&CONFLICTING_EQUALITY_CONSTRAINTS),
            Self::TypeParameterNotFound => Some(&TYPE_PARAMETER_NOT_FOUND),
        }
    }
}

/// Creates a type mismatch diagnostic with specific labels for the left and right types
pub(crate) fn type_mismatch<'heap, T, U>(
    env: &Environment<'heap>,

    lhs: Type<'heap, T>,
    rhs: Type<'heap, U>,

    help: Option<&str>,
) -> TypeCheckDiagnostic
where
    T: PrettyPrint<'heap>,
    U: PrettyPrint<'heap>,
{
    let mut diagnostic =
        Diagnostic::new(TypeCheckDiagnosticCategory::TypeMismatch, Severity::ERROR);

    diagnostic
        .labels
        .push(Label::new(env.source, "Type mismatch in this expression").with_order(3));

    diagnostic.labels.push(
        Label::new(
            lhs.span,
            format!(
                "This is of type `{}`",
                lhs.kind.pretty_print(env, PrettyOptions::default())
            ),
        )
        .with_order(1),
    );

    diagnostic.labels.push(
        Label::new(
            rhs.span,
            format!(
                "This is of type `{}`",
                rhs.kind.pretty_print(env, PrettyOptions::default())
            ),
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
pub(crate) fn no_type_inference<'heap, K>(
    env: &Environment<'heap>,
    infer_type: Type<'heap, K>,
) -> TypeCheckDiagnostic
where
    K: PrettyPrint<'heap>,
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
pub(crate) fn circular_type_reference<'heap, K>(
    span: SpanId,
    lhs: Type<'heap, K>,
    rhs: Type<'heap, K>,
) -> TypeCheckDiagnostic
where
    K: PrettyPrint<'heap>,
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
pub(crate) fn tuple_length_mismatch<'heap, K>(
    span: SpanId,
    lhs: Type<'heap, K>,
    rhs: Type<'heap, K>,
    lhs_len: usize,
    rhs_len: usize,
) -> TypeCheckDiagnostic
where
    K: PrettyPrint<'heap>,
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
pub(crate) fn opaque_type_name_mismatch<'heap, K>(
    span: SpanId,

    lhs: Type<'heap, K>,
    rhs: Type<'heap, K>,

    lhs_name: Symbol<'heap>,
    rhs_name: Symbol<'heap>,
) -> TypeCheckDiagnostic
where
    K: PrettyPrint<'heap>,
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

/// Creates a diagnostic for when a union type variant doesn't match any variant in the expected
/// union type
pub(crate) fn union_variant_mismatch<'heap, K1, K2>(
    env: &Environment<'heap>,
    bad_variant: Type<'heap, K1>,
    expected_union: Type<'heap, K2>,
) -> TypeCheckDiagnostic
where
    K1: PrettyPrint<'heap>,
    K2: PrettyPrint<'heap>,
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
            bad_variant.kind.pretty_print(env, PrettyOptions::default())
        ),
    ));

    // Secondary: point at the union we tried to match against
    diagnostic.labels.push(Label::new(
        expected_union.span,
        format!(
            "expected union containing at least one supertype variant for `{}`",
            bad_variant.kind.pretty_print(env, PrettyOptions::default())
        ),
    ));

    diagnostic.help = Some(Help::new(
        "For a type `A | B` to be a subtype of `C | D`, every variant (A, B) must be a subtype of \
         at least one variant in the expected union (C, D).\nIn other words: (A <: C \u{2228} A \
         <: D) \u{2227} (B <: C \u{2228} B <: D)",
    ));

    diagnostic.note = Some(Note::new(format!(
        "expected union: `{}`\nfound variant: `{}` which is not a subtype of any expected variants",
        expected_union
            .kind
            .pretty_print(env, PrettyOptions::default()),
        bad_variant.kind.pretty_print(env, PrettyOptions::default()),
    )));

    diagnostic
}

/// Creates a diagnostic for when a function has the wrong number of parameters.
///
/// This is used when a function type has a different number of parameters than expected,
/// which is an invariant property of function types.
pub(crate) fn function_parameter_count_mismatch<'heap, K>(
    span: SpanId,

    lhs: Type<'heap, K>,
    rhs: Type<'heap, K>,

    lhs_param_count: usize,
    rhs_param_count: usize,
) -> TypeCheckDiagnostic
where
    K: PrettyPrint<'heap>,
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

pub(crate) fn cannot_be_subtype_of_never<'heap, K>(
    env: &Environment<'heap>,
    actual_type: Type<'heap, K>,
) -> TypeCheckDiagnostic
where
    K: PrettyPrint<'heap>,
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
                actual_type.kind.pretty_print(env, PrettyOptions::default())
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

pub(crate) fn cannot_be_supertype_of_unknown<'heap, K>(
    env: &Environment<'heap>,
    actual_type: Type<'heap, K>,
) -> TypeCheckDiagnostic
where
    K: PrettyPrint<'heap>,
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
                actual_type.kind.pretty_print(env, PrettyOptions::default())
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

pub(crate) fn intersection_variant_mismatch<'heap, K1, K2>(
    env: &Environment<'heap>,
    variant: Type<'heap, K1>,
    expected_intersection: Type<'heap, K2>,
) -> TypeCheckDiagnostic
where
    K1: PrettyPrint<'heap>,
    K2: PrettyPrint<'heap>,
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
            variant.kind.pretty_print(env, PrettyOptions::default())
        ),
    ));

    // Secondary: point at the intersection we tried to match against
    diagnostic.labels.push(Label::new(
        expected_intersection.span,
        format!(
            "expected intersection containing incompatible variants for `{}`",
            variant.kind.pretty_print(env, PrettyOptions::default())
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
        expected_intersection
            .kind
            .pretty_print(env, PrettyOptions::default()),
        variant.kind.pretty_print(env, PrettyOptions::default()),
    )));

    diagnostic
}

/// Creates a diagnostic for when structs have different field names or keys
///
/// This is used when two structs being compared have different fields,
/// which violates structural equivalence requirements.
pub(crate) fn struct_field_mismatch<'heap, K>(
    span: SpanId,
    lhs: Type<'heap, K>,
    rhs: Type<'heap, K>,
) -> TypeCheckDiagnostic
where
    K: PrettyPrint<'heap>,
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
pub fn duplicate_struct_field<'heap, K>(
    span: SpanId,
    struct_type: Type<'heap, K>,
    field_name: Symbol<'heap>,
) -> TypeCheckDiagnostic
where
    K: PrettyPrint<'heap>,
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
pub(crate) fn missing_struct_field<'heap, K>(
    span: SpanId,
    subtype: Type<'heap, K>,
    supertype: Type<'heap, K>,
    field_name: Symbol<'heap>,
) -> TypeCheckDiagnostic
where
    K: PrettyPrint<'heap>,
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

pub(crate) fn unconstrained_type_variable_floating(env: &Environment) -> TypeCheckDiagnostic {
    let mut diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::UnconstrainedTypeVariable,
        Severity::COMPILER_BUG,
    );

    // We don't have a specific span, so we have to report this as a general error
    diagnostic.labels.push(
        Label::new(
            env.source,
            "Found unconstrained type variable with no source location information",
        )
        .with_order(1),
    );

    diagnostic.help = Some(Help::new(
        "This is an internal compiler error, not a problem with your code. The type system \
         encountered a variable that has no constraints, but also lacks source location \
         information to properly report the error. Please report this issue to the HashQL team \
         with a minimal reproduction case.",
    ));

    diagnostic.note = Some(Note::new(
        "During type inference, the compiler manages variables that represent unknown types. \
         These variables should either be resolved to concrete types or be reported with specific \
         source locations when unconstrained. This error indicates a bug in the type inference \
         system where a variable was neither resolved nor properly tracked back to its source \
         location.",
    ));

    diagnostic
}

/// Creates a diagnostic for when a type variable has no constraints, making inference impossible
pub(crate) fn unconstrained_type_variable(variable: Variable) -> TypeCheckDiagnostic {
    let mut diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::UnconstrainedTypeVariable,
        Severity::ERROR,
    );

    // Point to the variable's location
    diagnostic.labels.push(
        Label::new(
            variable.span,
            "Cannot infer type for this variable - no usage constraints available",
        )
        .with_order(1),
    );

    diagnostic.help = Some(Help::new(
        "Add an explicit type annotation to provide the necessary context. For example:\n- Change \
         `let x = ...` to `let x: Type = ...`\n- Provide type parameters like `function<T: \
         SomeType>(...)`\n- Use the value in a way that constrains its type",
    ));

    diagnostic.note = Some(Note::new(
        "Type inference needs constraints that come from how variables are used. When a variable \
         lacks both usage context and explicit annotations, the type system cannot determine an \
         appropriate type. This commonly occurs with empty collections, unused variables, or \
         generic functions without type annotations.",
    ));

    diagnostic
}

/// Creates a diagnostic for when a lower bound is incompatible with an equality constraint
pub(crate) fn incompatible_lower_equal_constraint<'heap, K>(
    env: &Environment<'heap>,
    variable: Variable,
    lower_bound: Type<'heap, K>,
    equals: Type<'heap, K>,
) -> TypeCheckDiagnostic
where
    K: PrettyPrint<'heap>,
{
    let mut diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::IncompatibleLowerEqualConstraint,
        Severity::ERROR,
    );

    // Primary label - point to the variable's location
    diagnostic.labels.push(
        Label::new(
            variable.span,
            "Type variable has incompatible lower bound and equality constraints",
        )
        .with_order(1),
    );

    // Label for the equality constraint
    diagnostic.labels.push(
        Label::new(
            equals.span,
            format!(
                "Required to be exactly `{}`",
                equals.pretty_print(env, PrettyOptions::default())
            ),
        )
        .with_order(2),
    );

    // Label for the lower bound
    diagnostic.labels.push(
        Label::new(
            lower_bound.span,
            format!(
                "But this lower bound `{}` is not a subtype of the equality constraint",
                lower_bound.pretty_print(env, PrettyOptions::default())
            ),
        )
        .with_order(3),
    );

    // Provide actionable help message
    diagnostic.help = Some(Help::new(format!(
        "Resolve this type conflict by either:\n1. Changing the equality constraint to be \
         compatible with `{}`\n2. Modifying the lower bound type to be a subtype of `{}`\n3. \
         Ensuring both types are compatible in the type hierarchy",
        lower_bound.pretty_print(
            env,
            PrettyOptions {
                max_width: 60,
                ..PrettyOptions::default()
            }
        ),
        equals.pretty_print(
            env,
            PrettyOptions {
                max_width: 60,
                ..PrettyOptions::default()
            }
        )
    )));

    diagnostic.note = Some(Note::new(
        "When a type variable has both lower bound and equality constraints, the lower bound must \
         be a subtype of the equality type (lower <: equal). This ensures the variable can \
         satisfy both constraints simultaneously. Check for inconsistent type annotations or \
         contradictory usage patterns.",
    ));

    diagnostic
}

/// Creates a diagnostic for when an upper bound is incompatible with an equality constraint
pub(crate) fn incompatible_upper_equal_constraint<'heap, K>(
    env: &Environment<'heap>,
    variable: Variable,
    equal: Type<'heap, K>,
    upper: Type<'heap, K>,
) -> TypeCheckDiagnostic
where
    K: PrettyPrint<'heap>,
{
    let mut diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::IncompatibleUpperEqualConstraint,
        Severity::ERROR,
    );

    // Primary label - point to the variable's location
    diagnostic.labels.push(
        Label::new(
            variable.span,
            "Type variable has incompatible equality and upper bound constraints",
        )
        .with_order(1),
    );

    // Label for the equality constraint
    diagnostic.labels.push(
        Label::new(
            equal.span,
            format!(
                "Required to be exactly `{}`",
                equal.pretty_print(env, PrettyOptions::default())
            ),
        )
        .with_order(2),
    );

    // Label for the upper bound
    diagnostic.labels.push(
        Label::new(
            upper.span,
            format!(
                "But this upper bound `{}` is not a supertype of the equality constraint",
                upper.pretty_print(env, PrettyOptions::default())
            ),
        )
        .with_order(3),
    );

    // Provide actionable help message
    diagnostic.help = Some(Help::new(format!(
        "To fix this conflict, you can:\n1. Change the equality constraint `{}` to be a subtype \
         of the upper bound\n2. Adjust the upper bound `{}` to be a supertype of the equality \
         constraint\n3. Review your type annotations to ensure they're consistent",
        equal.pretty_print(
            env,
            PrettyOptions {
                max_width: 60,
                ..PrettyOptions::default()
            }
        ),
        upper.pretty_print(
            env,
            PrettyOptions {
                max_width: 60,
                ..PrettyOptions::default()
            }
        )
    )));

    diagnostic.note = Some(Note::new(
        "Type inference requires that when a variable has both an equality constraint and an \
         upper bound, the equality type must be a subtype of the upper bound (equal <: upper). \
         This error indicates your code has contradictory requirements for the same type variable.",
    ));

    diagnostic
}

/// Creates a diagnostic for when a lower bound is not a subtype of an upper bound in a constraint
pub(crate) fn bound_constraint_violation<'heap, K>(
    env: &Environment<'heap>,
    variable: Variable,
    lower_bound: Type<'heap, K>,
    upper_bound: Type<'heap, K>,
) -> TypeCheckDiagnostic
where
    K: PrettyPrint<'heap>,
{
    let mut diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::BoundConstraintViolation,
        Severity::ERROR,
    );

    // Primary label - point to the variable's location
    diagnostic.labels.push(
        Label::new(
            variable.span,
            "Type variable has incompatible upper and lower bounds",
        )
        .with_order(1),
    );

    // Label for the lower bound
    diagnostic.labels.push(
        Label::new(
            lower_bound.span,
            format!(
                "Lower bound `{}` must be a subtype of the upper bound",
                lower_bound.kind.pretty_print(env, PrettyOptions::default())
            ),
        )
        .with_order(2),
    );

    // Label for the upper bound
    diagnostic.labels.push(
        Label::new(
            upper_bound.span,
            format!(
                "Upper bound `{}` is not a supertype of the lower bound",
                upper_bound.kind.pretty_print(env, PrettyOptions::default())
            ),
        )
        .with_order(3),
    );

    // Provide actionable help
    diagnostic.help = Some(Help::new(format!(
        "These type bounds create an impossible constraint. To fix this:\n1. Modify `{}` to be a \
         proper subtype of `{}`\n2. Or adjust `{}` to be a supertype of `{}`\n3. Or check your \
         code for contradictory type assertions",
        lower_bound.kind.pretty_print(
            env,
            PrettyOptions {
                max_width: 60,
                ..PrettyOptions::default()
            }
        ),
        upper_bound.kind.pretty_print(
            env,
            PrettyOptions {
                max_width: 60,
                ..PrettyOptions::default()
            }
        ),
        upper_bound.kind.pretty_print(
            env,
            PrettyOptions {
                max_width: 60,
                ..PrettyOptions::default()
            }
        ),
        lower_bound.kind.pretty_print(
            env,
            PrettyOptions {
                max_width: 60,
                ..PrettyOptions::default()
            }
        )
    )));

    diagnostic.note = Some(Note::new(
        "During type inference, when a variable has both upper and lower bounds, the relationship \
         'lower <: upper' must hold. This ensures a valid solution exists in the type system. \
         When this relationship is violated, it means your code is requiring contradictory types \
         for the same variable.",
    ));

    diagnostic
}

/// Creates a diagnostic for when a type variable has incompatible equality constraints
pub(crate) fn conflicting_equality_constraints<'heap, K>(
    env: &Environment<'heap>,
    variable: Variable,
    existing: Type<'heap, K>,
    new_type: Type<'heap, K>,
) -> TypeCheckDiagnostic
where
    K: PrettyPrint<'heap>,
{
    let mut diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::ConflictingEqualityConstraints,
        Severity::ERROR,
    );

    // Primary label - point to the variable's location
    diagnostic.labels.push(
        Label::new(
            variable.span,
            "Type variable has conflicting equality constraints",
        )
        .with_order(1),
    );

    // Label for the first equality constraint
    diagnostic.labels.push(
        Label::new(
            existing.span,
            format!(
                "Previously constrained to be exactly `{}`",
                existing.kind.pretty_print(env, PrettyOptions::default())
            ),
        )
        .with_order(2),
    );

    // Label for the second equality constraint
    diagnostic.labels.push(
        Label::new(
            new_type.span,
            format!(
                "But here constrained to be exactly `{}`",
                new_type.kind.pretty_print(env, PrettyOptions::default())
            ),
        )
        .with_order(3),
    );

    // Provide actionable help message
    diagnostic.help = Some(Help::new(format!(
        "A type variable can only be equal to one concrete type at a time. This variable has \
         multiple conflicting equality constraints.\nTo fix this issue:\n1. Ensure consistent \
         type usage - either use `{}` everywhere\n2. Or use `{}` everywhere\n3. Add explicit type \
         conversions where needed\n4. Check type annotations for contradictory requirements",
        existing.kind.pretty_print(
            env,
            PrettyOptions {
                max_width: 60,
                ..PrettyOptions::default()
            }
        ),
        new_type.kind.pretty_print(
            env,
            PrettyOptions {
                max_width: 60,
                ..PrettyOptions::default()
            }
        )
    )));

    diagnostic.note = Some(Note::new(
        "During type inference, all constraints on a type variable must be satisfied \
         simultaneously. When equality constraints conflict (e.g., T = String and T = Number), no \
         valid solution exists. This typically occurs when you've specified different types for \
         the same variable in different parts of your code, either explicitly through annotations \
         or implicitly through usage.",
    ));

    diagnostic
}

/// Creates a diagnostic for when a type parameter cannot be found during instantiation
///
/// This is used when instantiating a parameterized type, but one of the required type
/// parameters is not available in the environment.
pub(crate) fn type_parameter_not_found<'heap, K>(
    env: &Environment<'heap>,
    param: Type<'heap, K>,
    argument: GenericArgumentId,
) -> TypeCheckDiagnostic
where
    K: PrettyPrint<'heap>,
{
    let mut diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::TypeParameterNotFound,
        // This is a compiler bug in the error reporting sequence
        Severity::COMPILER_BUG,
    );

    // Primary label indicating the invalid reference
    diagnostic.labels.push(
        Label::new(
            param.span,
            format!("Invalid reference to undefined type parameter ?{argument}",),
        )
        .with_order(1),
    );

    // Secondary label for context about error reporting
    diagnostic.labels.push(
        Label::new(
            env.source,
            "This invalid code should have been rejected earlier in the compilation process",
        )
        .with_order(2),
    );

    // Help message explaining the situation
    diagnostic.help = Some(Help::new(
        "This error indicates your code contains an invalid type parameter reference that should \
         have been caught by an earlier validation step. While the code is indeed incorrect, the \
         compiler should have reported this error in a more specific way at an earlier stage. \
         Please report this issue to the HashQL team with a minimal reproduction case.",
    ));

    // Technical explanation with more details
    diagnostic.note = Some(Note::new(format!(
        "Technical details: Parameter ?{argument} is referenced but not defined in the current \
         environment. This represents both an invalid program and a flaw in the error reporting \
         sequence. The compiler should validate all parameter references during an earlier \
         compilation phase and provide more specific error messages. Please report this as a \
         compiler issue so we can improve error reporting for similar cases.",
    )));

    diagnostic
}
