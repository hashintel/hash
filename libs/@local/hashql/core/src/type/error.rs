use alloc::borrow::Cow;
use core::{cmp::Ordering, fmt::Write as _};

use hashql_diagnostics::{
    Diagnostic, DiagnosticIssues, Label, Status,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
    diagnostic::Message,
    severity::Severity,
};

use super::{
    Type, TypeId,
    environment::Environment,
    inference::{SelectionConstraint, Variable},
    kind::{StructType, generic::GenericArgumentId, intrinsic::DictType},
    pretty::{FormatType, TypeFormatter},
};
use crate::{
    algorithms::did_you_mean,
    pretty::{Formatter, RenderOptions},
    span::SpanId,
    symbol::{Ident, Symbol},
    r#type::pretty::TypeFormatterOptions,
};

pub type TypeCheckDiagnostic<K = Severity> = Diagnostic<TypeCheckDiagnosticCategory, SpanId, K>;
pub type TypeCheckDiagnosticIssues<K = Severity> =
    DiagnosticIssues<TypeCheckDiagnosticCategory, SpanId, K>;
pub type TypeCheckStatus<T> = Status<T, TypeCheckDiagnosticCategory, SpanId>;

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

const FIELD_NOT_FOUND: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "field-not-found",
    name: "Field not found in type",
};

const INVALID_TUPLE_INDEX: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-tuple-index",
    name: "Invalid tuple index",
};

const TUPLE_INDEX_OUT_OF_BOUNDS: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "tuple-index-out-of-bounds",
    name: "Tuple index out of bounds",
};

const UNSUPPORTED_PROJECTION: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "unsupported-projection",
    name: "Projection not supported on this type",
};

const UNSUPPORTED_SUBSCRIPT: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "unsupported-subscript",
    name: "Subscript not supported on this type",
};

const RECURSIVE_TYPE_PROJECTION: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "recursive-type-projection",
    name: "Cannot project field on recursive type",
};

const RECURSIVE_TYPE_SUBSCRIPT: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "recursive-type-subscript",
    name: "Cannot subscript recursive type",
};

const UNRESOLVED_SELECTION_CONSTRAINT: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "unresolved-selection-constraint",
    name: "Unresolved selection constraint",
};

const LIST_INDEX_TYPE_MISMATCH: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "list-index-type-mismatch",
    name: "List index type mismatch",
};

const DICT_KEY_TYPE_MISMATCH: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "dict-key-type-mismatch",
    name: "Dictionary key type mismatch",
};

const UNSATISFIABLE_UPPER_CONSTRAINT: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "unsatisfiable-upper-constraint",
    name: "Unsatisfiable upper constraint",
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
    FieldNotFound,
    InvalidTupleIndex,
    TupleIndexOutOfBounds,
    UnsupportedProjection,
    UnsupportedSubscript,
    RecursiveTypeProjection,
    RecursiveTypeSubscript,
    UnresolvedSelectionConstraint,
    ListIndexTypeMismatch,
    DictKeyTypeMismatch,
    UnsatisfiableUpperConstraint,
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
            Self::FunctionParameterCountMismatch => Some(&FUNCTION_PARAMETER_COUNT_MISMATCH),
            Self::UnionVariantMismatch => Some(&UNION_VARIANT_MISMATCH),
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
            Self::FieldNotFound => Some(&FIELD_NOT_FOUND),
            Self::InvalidTupleIndex => Some(&INVALID_TUPLE_INDEX),
            Self::TupleIndexOutOfBounds => Some(&TUPLE_INDEX_OUT_OF_BOUNDS),
            Self::UnsupportedProjection => Some(&UNSUPPORTED_PROJECTION),
            Self::UnsupportedSubscript => Some(&UNSUPPORTED_SUBSCRIPT),
            Self::RecursiveTypeProjection => Some(&RECURSIVE_TYPE_PROJECTION),
            Self::RecursiveTypeSubscript => Some(&RECURSIVE_TYPE_SUBSCRIPT),
            Self::UnresolvedSelectionConstraint => Some(&UNRESOLVED_SELECTION_CONSTRAINT),
            Self::ListIndexTypeMismatch => Some(&LIST_INDEX_TYPE_MISMATCH),
            Self::DictKeyTypeMismatch => Some(&DICT_KEY_TYPE_MISMATCH),
            Self::UnsatisfiableUpperConstraint => Some(&UNSATISFIABLE_UPPER_CONSTRAINT),
        }
    }
}

/// Creates a type mismatch diagnostic with specific labels for the left and right types
pub(crate) fn type_mismatch<'env, 'heap, T, U>(
    env: &'env Environment<'heap>,

    lhs: Type<'heap, T>,
    rhs: Type<'heap, U>,

    help: Option<&str>,
) -> TypeCheckDiagnostic
where
    for<'fmt> TypeFormatter<'fmt, 'env, 'heap>: FormatType<'fmt, T> + FormatType<'fmt, U>,
    T: Copy,
    U: Copy,
{
    let formatter = Formatter::new(env.heap);
    let mut formatter = TypeFormatter::new(&formatter, env, TypeFormatterOptions::default());

    let mut diagnostic =
        Diagnostic::new(TypeCheckDiagnosticCategory::TypeMismatch, Severity::Error).primary(
            Label::new(
                lhs.span,
                format!(
                    "This is of type `{}`",
                    formatter.render_type(*lhs.kind, RenderOptions::default())
                ),
            ),
        );

    diagnostic.labels.push(Label::new(
        rhs.span,
        format!(
            "... and this is of type `{}`",
            formatter.render_type(*rhs.kind, RenderOptions::default())
        ),
    ));

    if let Some(text) = help {
        diagnostic.add_message(Message::help(text.to_owned()));
    }

    diagnostic.add_message(Message::note(
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
pub(crate) fn no_type_inference<K>(infer_type: Type<'_, K>) -> TypeCheckDiagnostic {
    let mut diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::NoTypeInference,
        // This is a compiler bug, as we should've encountered the `Infer` at an earlier stage
        Severity::Bug,
    )
    .primary(Label::new(
        infer_type.span,
        "cannot infer the type of this expression; it is unconstrained",
    ));

    diagnostic.add_message(Message::help(
        "This error occurs when the type system cannot determine a specific type for an \
         expression. Add explicit type annotations to help the compiler understand your intent.",
    ));

    diagnostic.add_message(Message::note(
        "Type inference requires sufficient context to determine types. When a type variable has \
         no constraints from usage, the compiler cannot choose an appropriate type. Consider \
         adding an explicit type annotation or using the expression in a context that provides \
         more type information.",
    ));

    diagnostic.add_message(Message::note(
        "The variable was missed in an earlier compilation stage and has had no constraints \
         generated for it.",
    ));

    diagnostic
}

/// Creates a circular type reference diagnostic
pub(crate) fn circular_type_reference<'heap, K>(
    lhs: Type<'heap, K>,
    rhs: Type<'heap, K>,
) -> TypeCheckDiagnostic {
    let mut diagnostic =
        Diagnostic::new(TypeCheckDiagnosticCategory::CircularType, Severity::Warning)
            .primary(Label::new(lhs.span, "circular type reference detected"));

    diagnostic
        .labels
        .push(Label::new(rhs.span, "cycle continues through this type"));

    diagnostic.add_message(Message::note(
        "circular types can cause infinite expansion during serialization or code generation",
    ));

    diagnostic
}

/// Creates a diagnostic for when tuple types have a different number of fields
pub(crate) fn tuple_length_mismatch<'heap, K>(
    lhs: Type<'heap, K>,
    rhs: Type<'heap, K>,

    lhs_len: usize,
    rhs_len: usize,
) -> TypeCheckDiagnostic {
    let mut diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::TupleLengthMismatch,
        Severity::Error,
    )
    .primary(Label::new(
        lhs.span,
        format!(
            "expected tuple with {} element{}, found {}",
            lhs_len,
            if lhs_len == 1 { "" } else { "s" },
            rhs_len
        ),
    ));

    diagnostic.labels.push(Label::new(
        rhs.span,
        format!(
            "this tuple has {} element{}",
            rhs_len,
            if rhs_len == 1 { "" } else { "s" }
        ),
    ));

    diagnostic
}

/// Creates a diagnostic for when opaque types have different names
pub(crate) fn opaque_type_name_mismatch<'heap, K>(
    lhs: Type<'heap, K>,
    rhs: Type<'heap, K>,

    lhs_name: Symbol<'heap>,
    rhs_name: Symbol<'heap>,
) -> TypeCheckDiagnostic {
    let mut diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::OpaqueTypeNameMismatch,
        Severity::Error,
    )
    .primary(Label::new(
        lhs.span,
        format!("expected `{lhs_name}`, found `{rhs_name}`"),
    ));

    diagnostic
        .labels
        .push(Label::new(rhs.span, format!("this has type `{rhs_name}`")));

    diagnostic.add_message(Message::note(
        "named types with different names are distinct, even if they have the same structure",
    ));

    diagnostic
}

/// Creates a diagnostic for when a union type variant doesn't match any variant in the expected
/// union type
pub(crate) fn union_variant_mismatch<'env, 'heap, K1, K2>(
    env: &'env Environment<'heap>,
    bad_variant: Type<'heap, K1>,
    expected_union: Type<'heap, K2>,
) -> TypeCheckDiagnostic
where
    for<'fmt> TypeFormatter<'fmt, 'env, 'heap>: FormatType<'fmt, K1> + FormatType<'fmt, K2>,
    K1: Copy,
    K2: Copy,
{
    let formatter = Formatter::new(env.heap);
    let mut formatter = TypeFormatter::new(&formatter, env, TypeFormatterOptions::default());

    let mut diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::UnionVariantMismatch,
        Severity::Error,
    )
    .primary(Label::new(
        bad_variant.span,
        format!(
            "variant `{}` must be a subtype of at least one variant in the expected union",
            formatter.render_type(*bad_variant.kind, RenderOptions::default())
        ),
    ));

    // Secondary: point at the union we tried to match against
    diagnostic.labels.push(Label::new(
        expected_union.span,
        format!(
            "expected union containing at least one supertype variant for `{}`",
            formatter.render_type(*bad_variant.kind, RenderOptions::default())
        ),
    ));

    diagnostic.add_message(Message::help(
        "For a type `A | B` to be a subtype of `C | D`, every variant (A, B) must be a subtype of \
         at least one variant in the expected union (C, D).\nIn other words: (A <: C \u{2228} A \
         <: D) \u{2227} (B <: C \u{2228} B <: D)",
    ));

    diagnostic.add_message(Message::note(format!(
        "expected union: `{}`\nfound variant: `{}` which is not a subtype of any expected variants",
        formatter.render_type(*expected_union.kind, RenderOptions::default()),
        formatter.render_type(*bad_variant.kind, RenderOptions::default())
    )));

    diagnostic
}

/// Creates a diagnostic for when a function has the wrong number of parameters.
///
/// This is used when a function type has a different number of parameters than expected,
/// which is an invariant property of function types.
pub(crate) fn function_parameter_count_mismatch<'heap, K>(
    lhs: Type<'heap, K>,
    rhs: Type<'heap, K>,

    lhs_param_count: usize,
    rhs_param_count: usize,
) -> TypeCheckDiagnostic {
    let mut diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::FunctionParameterCountMismatch,
        Severity::Error,
    )
    .primary(Label::new(
        lhs.span,
        format!(
            "expected function with {} parameter{}, found {}",
            lhs_param_count,
            if lhs_param_count == 1 { "" } else { "s" },
            rhs_param_count
        ),
    ));

    diagnostic.labels.push(Label::new(
        rhs.span,
        format!(
            "this function has {} parameter{}",
            rhs_param_count,
            if rhs_param_count == 1 { "" } else { "s" }
        ),
    ));

    diagnostic
}

pub(crate) fn cannot_be_subtype_of_never<'env, 'heap, K, L>(
    env: &'env Environment<'heap>,
    subtype: Type<'heap, K>,
    supertype: Type<'heap, L>,
) -> TypeCheckDiagnostic
where
    for<'fmt> TypeFormatter<'fmt, 'env, 'heap>: FormatType<'fmt, K>,
    K: Copy,
{
    let formatter = Formatter::new(env.heap);
    let mut formatter = TypeFormatter::new(&formatter, env, TypeFormatterOptions::default());

    let mut diagnostic =
        Diagnostic::new(TypeCheckDiagnosticCategory::TypeMismatch, Severity::Error).primary(
            Label::new(
                subtype.span,
                format!(
                    "`{}` cannot be a subtype of `!`",
                    formatter.render_type(*subtype.kind, RenderOptions::default())
                ),
            ),
        );

    diagnostic
        .labels
        .push(Label::new(supertype.span, "this is of type `!`"));

    diagnostic.add_message(Message::help(
        "Only the `!` (Never) type itself can be a subtype of `!`. Any type with values cannot be \
         a subtype of `!`, which by definition has no values.",
    ));

    diagnostic.add_message(Message::note(
        "In type theory, the `!` type (also called 'bottom type' or 'Never') is a type with no \
         values. It can be a subtype of any type, but only `!` can be a subtype of `!`.",
    ));

    diagnostic
}

pub(crate) fn cannot_be_supertype_of_unknown<'env, 'heap, K, L>(
    env: &'env Environment<'heap>,
    subtype: Type<'heap, K>,
    supertype: Type<'heap, L>,
) -> TypeCheckDiagnostic
where
    for<'fmt> TypeFormatter<'fmt, 'env, 'heap>: FormatType<'fmt, L>,
    L: Copy,
{
    let formatter = Formatter::new(env.heap);
    let mut formatter = TypeFormatter::new(&formatter, env, TypeFormatterOptions::default());

    let mut diagnostic =
        Diagnostic::new(TypeCheckDiagnosticCategory::TypeMismatch, Severity::Error).primary(
            Label::new(
                supertype.span,
                format!(
                    "`{}` type cannot be a supertype of `?`",
                    formatter.render_type(*supertype.kind, RenderOptions::default())
                ),
            ),
        );

    diagnostic
        .labels
        .push(Label::new(subtype.span, "this is of type `?`"));

    diagnostic.add_message(Message::help(
        "Only the `?` (Unknown) type itself can be a supertype of `?`.",
    ));

    diagnostic.add_message(Message::note(
        "In type theory, the `?` type (also called 'top type' or 'Unknown') is a type that \
         encompasses all values. It can be a supertype of any type, but only `?` can be a \
         supertype of `?`.",
    ));

    diagnostic
}

pub(crate) fn intersection_variant_mismatch<'env, 'heap, K1, K2>(
    env: &'env Environment<'heap>,
    variant: Type<'heap, K1>,
    expected_intersection: Type<'heap, K2>,
) -> TypeCheckDiagnostic
where
    for<'fmt> TypeFormatter<'fmt, 'env, 'heap>: FormatType<'fmt, K1> + FormatType<'fmt, K2>,
    K1: Copy,
    K2: Copy,
{
    let formatter = Formatter::new(env.heap);
    let mut formatter = TypeFormatter::new(&formatter, env, TypeFormatterOptions::default());

    let mut diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::IntersectionVariantMismatch,
        Severity::Error,
    )
    .primary(Label::new(
        variant.span,
        format!(
            "variant `{}` must be a subtype of all variants in the expected intersection",
            formatter.render_type(*variant.kind, RenderOptions::default())
        ),
    ));

    // Secondary: point at the intersection we tried to match against
    diagnostic.labels.push(Label::new(
        expected_intersection.span,
        format!(
            "expected intersection containing incompatible variants for `{}`",
            formatter.render_type(*expected_intersection.kind, RenderOptions::default())
        ),
    ));

    diagnostic.add_message(Message::help(
        "For a type `A & B` to be a subtype of `C & D`, every variant (A, B) must be a subtype of \
         every variant in the expected intersection (C, D).\nIn other words: (A <: C) \u{2227} (A \
         <: D) \u{2227} (B <: C) \u{2227} (B <: D)",
    ));

    diagnostic.add_message(Message::note(format!(
        "expected intersection: `{}`\nfound variant: `{}` which is not a subtype of all expected \
         variants",
        formatter.render_type(*expected_intersection.kind, RenderOptions::default()),
        formatter.render_type(*variant.kind, RenderOptions::default()),
    )));

    diagnostic
}

/// Creates a diagnostic for when structs have different field names or keys
///
/// This is used when two structs being compared have different fields,
/// which violates structural equivalence requirements.
pub(crate) fn struct_field_mismatch<'heap>(
    lhs: Type<'heap, StructType<'heap>>,
    rhs: Type<'heap, StructType<'heap>>,
) -> TypeCheckDiagnostic {
    let mut missing_in_rhs = Vec::new();
    let mut missing_in_lhs = Vec::new();

    let mut lhs_iter = lhs.kind.fields.iter().peekable();
    let mut rhs_iter = rhs.kind.fields.iter().peekable();

    while let (Some(&lhs_field), Some(&rhs_field)) = (lhs_iter.peek(), rhs_iter.peek()) {
        match lhs_field.name.cmp(&rhs_field.name) {
            Ordering::Less => {
                missing_in_rhs.push(lhs_field.name);
                lhs_iter.next();
            }
            Ordering::Greater => {
                missing_in_lhs.push(rhs_field.name);
                rhs_iter.next();
            }
            Ordering::Equal => {
                lhs_iter.next();
                rhs_iter.next();
            }
        }
    }

    missing_in_rhs.extend(lhs_iter.map(|field| field.name));
    missing_in_lhs.extend(rhs_iter.map(|field| field.name));

    let mut diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::StructFieldMismatch,
        Severity::Error,
    )
    .primary(Label::new(lhs.span, "structs have different fields"));

    diagnostic
        .labels
        .push(Label::new(rhs.span, "this struct has different fields"));

    if !missing_in_rhs.is_empty() {
        diagnostic.add_message(Message::note(format!(
            "field{} {} missing in second struct",
            if missing_in_rhs.len() == 1 { "" } else { "s" },
            missing_in_rhs
                .iter()
                .flat_map(|name| ["`", name.as_str(), "`"])
                .intersperse(", ")
                .collect::<String>()
        )));
    }

    if !missing_in_lhs.is_empty() {
        diagnostic.add_message(Message::note(format!(
            "field{} {} missing in first struct",
            if missing_in_lhs.len() == 1 { "" } else { "s" },
            missing_in_lhs
                .iter()
                .flat_map(|name| ["`", name.as_str(), "`"])
                .intersperse(", ")
                .collect::<String>()
        )));
    }

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
) -> TypeCheckDiagnostic {
    let mut diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::DuplicateStructField,
        Severity::Error,
    )
    .primary(Label::new(
        span,
        format!("Duplicate field name '{field_name}' in struct"),
    ));

    diagnostic.labels.push(Label::new(
        struct_type.span,
        "Field appears multiple times in this struct type",
    ));

    diagnostic.add_message(Message::help(
        "Each field in a struct must have a unique name. Remove or rename duplicate fields.",
    ));

    diagnostic.add_message(Message::note(
        "Structs cannot have multiple fields with the same name, as this would make field access \
         ambiguous. Each field name must be unique within a struct.",
    ));

    diagnostic
}

/// Creates a diagnostic for when a struct is missing a required field for subtyping
///
/// This is used when a struct being checked for subtyping relationship is missing
/// a field that is present in the supertype, violating the subtyping requirements.
pub(crate) fn missing_struct_field<'heap>(
    subtype: Type<'heap, StructType<'heap>>,
    supertype: Type<'heap, StructType<'heap>>,
    field_name: Symbol<'heap>,
) -> TypeCheckDiagnostic {
    let mut diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::MissingStructField,
        Severity::Error,
    )
    .primary(Label::new(
        subtype.span,
        format!("missing field `{field_name}`"),
    ));

    diagnostic.labels.push(Label::new(
        supertype.span,
        format!("field `{field_name}` required by this type"),
    ));

    diagnostic.add_message(Message::help(format!(
        "add field `{field_name}` to the struct"
    )));

    diagnostic
}

pub(crate) fn unconstrained_type_variable_floating() -> TypeCheckDiagnostic {
    let mut diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::UnconstrainedTypeVariable,
        Severity::Bug,
    )
    .primary(Label::new(
        SpanId::SYNTHETIC,
        "unconstrained type variable has no source location",
    ));

    diagnostic.add_message(Message::note(
        "this is a compiler bug: type variable was neither resolved nor tracked to its origin",
    ));

    diagnostic
}

/// Creates a diagnostic for when a type variable has no constraints, making inference impossible
pub(crate) fn unconstrained_type_variable(variable: Variable) -> TypeCheckDiagnostic {
    let mut diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::UnconstrainedTypeVariable,
        Severity::Error,
    )
    .primary(Label::new(
        variable.span,
        "Cannot infer type for this variable - no usage constraints available",
    ));

    diagnostic.add_message(Message::help(
        "Add an explicit type annotation to provide the necessary context. For example:\n- Change \
         `let x = ...` to `let x: Type = ...`\n- Provide type parameters like `function<T: \
         SomeType>(...)`\n- Use the value in a way that constrains its type",
    ));

    diagnostic.add_message(Message::note(
        "Type inference needs constraints that come from how variables are used. When a variable \
         lacks both usage context and explicit annotations, the type system cannot determine an \
         appropriate type. This commonly occurs with empty collections, unused variables, or \
         generic functions without type annotations.",
    ));

    diagnostic
}

/// Creates a diagnostic for when a lower bound is incompatible with an equality constraint
pub(crate) fn incompatible_lower_equal_constraint<'heap>(
    env: &Environment<'heap>,
    variable: Variable,
    lower_bound: Type<'heap>,
    equals: Type<'heap>,
) -> TypeCheckDiagnostic {
    let formatter = Formatter::new(env.heap);
    let mut formatter = TypeFormatter::new(&formatter, env, TypeFormatterOptions::default());

    let mut diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::IncompatibleLowerEqualConstraint,
        Severity::Error,
    )
    .primary(Label::new(
        variable.span,
        "Type variable has incompatible lower bound and equality constraints",
    ));

    // Label for the equality constraint
    diagnostic.labels.push(Label::new(
        equals.span,
        format!(
            "Required to be exactly `{}`",
            formatter.render_type(equals, RenderOptions::default())
        ),
    ));

    // Label for the lower bound
    diagnostic.labels.push(Label::new(
        lower_bound.span,
        format!(
            "But this lower bound `{}` is not a subtype of the equality constraint",
            formatter.render_type(lower_bound, RenderOptions::default())
        ),
    ));

    // Provide actionable help message
    diagnostic.add_message(Message::help(format!(
        "Resolve this type conflict by either:\n1. Changing the equality constraint to be \
         compatible with `{}`\n2. Modifying the lower bound type to be a subtype of `{}`\n3. \
         Ensuring both types are compatible in the type hierarchy",
        formatter.render_type(lower_bound, RenderOptions::default().with_max_width(60)),
        formatter.render_type(equals, RenderOptions::default().with_max_width(60))
    )));

    diagnostic.add_message(Message::note(
        "When a type variable has both lower bound and equality constraints, the lower bound must \
         be a subtype of the equality type (lower <: equal). This ensures the variable can \
         satisfy both constraints simultaneously. Check for inconsistent type annotations or \
         contradictory usage patterns.",
    ));

    diagnostic
}

/// Creates a diagnostic for when an upper bound is incompatible with an equality constraint
pub(crate) fn incompatible_upper_equal_constraint<'heap>(
    env: &Environment<'heap>,
    variable: Variable,
    equal: Type<'heap>,
    upper: Type<'heap>,
) -> TypeCheckDiagnostic {
    let formatter = Formatter::new(env.heap);
    let mut formatter = TypeFormatter::new(&formatter, env, TypeFormatterOptions::default());

    let mut diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::IncompatibleUpperEqualConstraint,
        Severity::Error,
    )
    .primary(Label::new(
        variable.span,
        "Type variable has incompatible equality and upper bound constraints",
    ));

    // Label for the equality constraint
    diagnostic.labels.push(Label::new(
        equal.span,
        format!(
            "Required to be exactly `{}`",
            formatter.render_type(equal, RenderOptions::default())
        ),
    ));

    // Label for the upper bound
    diagnostic.labels.push(Label::new(
        upper.span,
        format!(
            "But this upper bound `{}` is not a supertype of the equality constraint",
            formatter.render_type(upper, RenderOptions::default())
        ),
    ));

    // Provide actionable help message
    diagnostic.add_message(Message::help(format!(
        "To fix this conflict, you can:\n1. Change the equality constraint `{}` to be a subtype \
         of the upper bound\n2. Adjust the upper bound `{}` to be a supertype of the equality \
         constraint\n3. Review your type annotations to ensure they're consistent",
        formatter.render_type(equal, RenderOptions::default().with_max_width(60)),
        formatter.render_type(upper, RenderOptions::default().with_max_width(60))
    )));

    diagnostic.add_message(Message::note(
        "Type inference requires that when a variable has both an equality constraint and an \
         upper bound, the equality type must be a subtype of the upper bound (equal <: upper). \
         This error indicates your code has contradictory requirements for the same type variable.",
    ));

    diagnostic
}

/// Creates a diagnostic for when a lower bound is not a subtype of an upper bound in a constraint
pub(crate) fn bound_constraint_violation<'heap>(
    env: &Environment<'heap>,
    variable: Variable,
    lower_bound: Type<'heap>,
    upper_bound: Type<'heap>,
) -> TypeCheckDiagnostic {
    let formatter = Formatter::new(env.heap);
    let mut formatter = TypeFormatter::new(&formatter, env, TypeFormatterOptions::default());

    let mut diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::BoundConstraintViolation,
        Severity::Error,
    )
    .primary(Label::new(
        variable.span,
        "Type variable has incompatible upper and lower bounds",
    ));

    // Label for the lower bound
    diagnostic.labels.push(Label::new(
        lower_bound.span,
        format!(
            "Lower bound `{}` must be a subtype of the upper bound",
            formatter.render_type(*lower_bound.kind, RenderOptions::default())
        ),
    ));

    // Label for the upper bound
    diagnostic.labels.push(Label::new(
        upper_bound.span,
        format!(
            "Upper bound `{}` is not a supertype of the lower bound",
            formatter.render_type(*upper_bound.kind, RenderOptions::default())
        ),
    ));

    // Provide actionable help
    diagnostic.add_message(Message::help(format!(
        "These type bounds create an impossible constraint. To fix this:\n1. Modify `{}` to be a \
         proper subtype of `{}`\n2. Or adjust `{}` to be a supertype of `{}`\n3. Or check your \
         code for contradictory type assertions",
        formatter.render_type(
            *lower_bound.kind,
            RenderOptions::default().with_max_width(60)
        ),
        formatter.render_type(
            *upper_bound.kind,
            RenderOptions::default().with_max_width(60)
        ),
        formatter.render_type(
            *upper_bound.kind,
            RenderOptions::default().with_max_width(60)
        ),
        formatter.render_type(
            *lower_bound.kind,
            RenderOptions::default().with_max_width(60)
        )
    )));

    diagnostic.add_message(Message::note(
        "During type inference, when a variable has both upper and lower bounds, the relationship \
         'lower <: upper' must hold. This ensures a valid solution exists in the type system. \
         When this relationship is violated, it means your code is requiring contradictory types \
         for the same variable.",
    ));

    diagnostic
}

/// Creates a diagnostic for when a type variable has incompatible equality constraints
pub(crate) fn conflicting_equality_constraints<'heap>(
    env: &Environment<'heap>,
    variable: Variable,
    existing: Type<'heap>,
    new_type: Type<'heap>,
) -> TypeCheckDiagnostic {
    let formatter = Formatter::new(env.heap);
    let mut formatter = TypeFormatter::new(&formatter, env, TypeFormatterOptions::default());

    let mut diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::ConflictingEqualityConstraints,
        Severity::Error,
    )
    .primary(Label::new(
        variable.span,
        "Type variable has conflicting equality constraints",
    ));

    // Label for the first equality constraint
    diagnostic.labels.push(Label::new(
        existing.span,
        format!(
            "Previously constrained to be exactly `{}`",
            formatter.render_type(*existing.kind, RenderOptions::default())
        ),
    ));

    // Label for the second equality constraint
    diagnostic.labels.push(Label::new(
        new_type.span,
        format!(
            "But here constrained to be exactly `{}`",
            formatter.render_type(*new_type.kind, RenderOptions::default())
        ),
    ));

    // Provide actionable help message
    diagnostic.add_message(Message::help(format!(
        "A type variable can only be equal to one concrete type at a time. This variable has \
         multiple conflicting equality constraints.\nTo fix this issue:\n1. Ensure consistent \
         type usage - either use `{}` everywhere\n2. Or use `{}` everywhere\n3. Add explicit type \
         conversions where needed\n4. Check type annotations for contradictory requirements",
        formatter.render_type(*existing.kind, RenderOptions::default().with_max_width(60)),
        formatter.render_type(*new_type.kind, RenderOptions::default().with_max_width(60))
    )));

    diagnostic.add_message(Message::note(
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
pub(crate) fn type_parameter_not_found<K>(
    param: Type<'_, K>,
    argument: GenericArgumentId,
) -> TypeCheckDiagnostic {
    let mut diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::TypeParameterNotFound,
        Severity::Bug,
    )
    .primary(Label::new(
        param.span,
        format!("Invalid reference to undefined type parameter ?{argument}",),
    ));

    diagnostic.add_message(Message::help(
        "This error indicates your code contains an invalid type parameter reference that should \
         have been caught by an earlier validation step. While the code is indeed incorrect, the \
         compiler should have reported this error in a more specific way at an earlier stage.",
    ));

    diagnostic.add_message(Message::note(
        "This invalid code should have been rejected earlier in the compilation process",
    ));

    diagnostic.add_message(Message::note(format!(
        "Technical details: Parameter ?{argument} is referenced but not defined in the current \
         environment. This represents both an invalid program and a flaw in the error reporting \
         sequence. The compiler should validate all parameter references during an earlier \
         compilation phase and provide more specific error messages.",
    )));

    diagnostic
}

pub(crate) fn struct_field_not_found<'env, 'heap, K>(
    r#type: Type<'heap, K>,
    field: Ident<'heap>,

    available_fields: impl ExactSizeIterator<Item = Symbol<'heap>> + Clone,

    env: &'env Environment<'heap>,
) -> TypeCheckDiagnostic
where
    for<'fmt> TypeFormatter<'fmt, 'env, 'heap>: FormatType<'fmt, K>,
    K: Copy,
{
    let formatter = Formatter::new(env.heap);
    let mut formatter = TypeFormatter::new(&formatter, env, TypeFormatterOptions::default());

    let mut diagnostic =
        Diagnostic::new(TypeCheckDiagnosticCategory::FieldNotFound, Severity::Error).primary(
            Label::new(field.span, format!("Field '{field}' does not exist")),
        );

    diagnostic
        .labels
        .push(Label::new(r#type.span, "... on this type"));

    let suggestions = did_you_mean(field.value, available_fields.clone(), Some(5), None);

    let mut help_message = format!(
        "The field '{field}' cannot be accessed on type '{}'.",
        formatter.render_type(*r#type.kind, RenderOptions::default())
    );

    if !suggestions.is_empty() {
        write!(help_message, "\n\nDid you mean one of these?").expect("infallible");

        for suggestion in &suggestions {
            write!(help_message, "\n  - {suggestion}").expect("infallible");
        }

        let remaining = available_fields.len().saturating_sub(suggestions.len());
        if remaining > 0 {
            write!(help_message, "\n  ({remaining} more fields available)").expect("infallible");
        }
    } else if available_fields.len() <= 10 {
        write!(
            help_message,
            "\n\nChoose one of these available fields instead:"
        )
        .expect("infallible");

        for field in available_fields {
            write!(help_message, "\n  - {field}").expect("infallible");
        }
    } else {
        write!(
            help_message,
            "\n\nReplace '{field}' with one of the {} available fields. Use autocomplete or check \
             the type definition for the complete list.",
            available_fields.len()
        )
        .expect("infallible");
    }

    diagnostic.add_message(Message::help(help_message));

    diagnostic.add_message(Message::note(
        "Field access in HashQL requires exact name matching - fields are case-sensitive and must \
         be defined in the type's structure. Typos in field names are a common source of this \
         error.",
    ));

    diagnostic
}

pub(crate) fn invalid_tuple_index<'env, 'heap, K>(
    r#type: Type<'heap, K>,
    field: Ident<'heap>,
    env: &'env Environment<'heap>,
) -> TypeCheckDiagnostic
where
    for<'fmt> TypeFormatter<'fmt, 'env, 'heap>: FormatType<'fmt, K>,
    K: Copy,
{
    let formatter = Formatter::new(env.heap);
    let mut formatter = TypeFormatter::new(&formatter, env, TypeFormatterOptions::default());

    let mut diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::InvalidTupleIndex,
        Severity::Error,
    )
    .primary(Label::new(
        field.span,
        format!("'{field}' is not a valid tuple index"),
    ));

    diagnostic
        .labels
        .push(Label::new(r#type.span, "... on this tuple type"));

    let type_str = formatter.render_type(*r#type.kind, RenderOptions::default());
    let help_message = format!(
        "Tuple elements can only be accessed using numeric indices (0, 1, 2, etc.), but '{field}' \
         is not a valid number on type '{type_str}'. Replace '{field}' with a numeric index like \
         `tuple.0`, `tuple.1`, `tuple.2`, etc."
    );

    diagnostic.add_message(Message::help(help_message));

    diagnostic.add_message(Message::note(
        "Tuples are ordered collections where elements are accessed by their position. Use a \
         numeric index like `tuple.0` or `tuple.1` to access specific elements. Unlike structs, \
         tuples don't have named fields.",
    ));

    diagnostic
}

pub(crate) fn tuple_index_out_of_bounds<'env, 'heap, K>(
    r#type: Type<'heap, K>,
    field: Ident<'heap>,
    tuple_length: usize,
    env: &'env Environment<'heap>,
) -> TypeCheckDiagnostic
where
    for<'fmt> TypeFormatter<'fmt, 'env, 'heap>: FormatType<'fmt, K>,
    K: Copy,
{
    let formatter = Formatter::new(env.heap);
    let mut formatter = TypeFormatter::new(&formatter, env, TypeFormatterOptions::default());

    let mut diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::TupleIndexOutOfBounds,
        Severity::Error,
    )
    .primary(Label::new(
        field.span,
        format!("Index '{field}' is out of bounds"),
    ));

    diagnostic
        .labels
        .push(Label::new(r#type.span, "... on this tuple"));

    let mut help_message = format!(
        "The index '{field}' is out of bounds for type '{}'.",
        formatter.render_type(*r#type.kind, RenderOptions::default())
    );

    if tuple_length == 0 {
        write!(
            help_message,
            "This tuple is empty - remove the field access or check if you meant to use a \
             different variable."
        )
        .expect("infallible");
    } else if tuple_length == 1 {
        write!(
            help_message,
            "Replace the index with 0 to access the single element in this tuple."
        )
        .expect("infallible");
    } else {
        write!(
            help_message,
            "Replace with a valid index from 0 to {}. This tuple has {tuple_length} elements \
             available.",
            tuple_length.saturating_sub(1)
        )
        .expect("infallible");
    }

    diagnostic.add_message(Message::help(help_message));

    diagnostic.add_message(Message::note(
        "Tuple indices are zero-based, meaning the first element is at index 0, the second at \
         index 1, and so on. The highest valid index is always one less than the tuple's length.",
    ));

    diagnostic
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) enum UnsupportedProjectionCategory {
    Closure,
    List,
    Dict,
    Primitive,
    Never,
    Unknown,
}

impl UnsupportedProjectionCategory {
    const fn plural_capitalized(self) -> &'static str {
        match self {
            Self::Closure => "Closures",
            Self::List => "Lists",
            Self::Dict => "Dictionaries",
            Self::Primitive => "Primitive types",
            Self::Never => "Never",
            Self::Unknown => "Unknown",
        }
    }
}

pub(crate) fn unsupported_projection<'env, 'heap, K>(
    r#type: Type<'heap, K>,
    field: Ident<'heap>,
    category: UnsupportedProjectionCategory,
    env: &'env Environment<'heap>,
) -> TypeCheckDiagnostic
where
    for<'fmt> TypeFormatter<'fmt, 'env, 'heap>: FormatType<'fmt, K>,
    K: Copy,
{
    let formatter = Formatter::new(env.heap);
    let mut formatter = TypeFormatter::new(&formatter, env, TypeFormatterOptions::default());

    let mut diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::UnsupportedProjection,
        Severity::Error,
    )
    .primary(Label::new(
        field.span,
        format!("Cannot access field '{field}'"),
    ));

    diagnostic
        .labels
        .push(Label::new(r#type.span, "... on this type"));

    let mut help_message = format!(
        "Cannot access field '{field}' on type '{}'.\n\n",
        formatter.render_type(*r#type.kind, RenderOptions::default())
    );

    match category {
        UnsupportedProjectionCategory::Closure => {
            write!(
                help_message,
                "Closures are functions that capture their environment and are meant to be \
                 called, not accessed as objects. To use this closure, call it with arguments \
                 like `closure(arg1, arg2)` instead of trying to access properties on it."
            )
            .expect("infallible");
        }
        UnsupportedProjectionCategory::List => {
            write!(
                help_message,
                "Lists are ordered collections accessed by numeric position, not by field names. \
                 Use square bracket notation with an index: `list[0]` for the first element, \
                 `list[index]` for a dynamic position."
            )
            .expect("infallible");
        }
        UnsupportedProjectionCategory::Dict => {
            write!(
                help_message,
                ". Dictionaries are key-value mappings where keys can be any type, not just field \
                 names. Access values using square bracket notation: `dict[\"key\"]` for string \
                 keys, `dict[key]` for variable keys."
            )
            .expect("infallible");
        }
        UnsupportedProjectionCategory::Primitive => {
            write!(
                help_message,
                "Primitive types (numbers, strings, booleans, null) are atomic values without \
                 internal structure. They don't have user-accessible fields. Use the value \
                 directly."
            )
            .expect("infallible");
        }
        UnsupportedProjectionCategory::Never => {
            write!(
                help_message,
                "The 'never' type represents values that cannot exist - typically indicating \
                 unreachable code paths or overly restrictive type constraints. Since no actual \
                 value of this type can ever be created, field access is impossible. Review your \
                 type constraints, union intersections, or conditional logic to ensure this code \
                 path is reachable."
            )
            .expect("infallible");
        }
        UnsupportedProjectionCategory::Unknown => {
            write!(
                help_message,
                "The 'unknown' type represents values whose structure hasn't been determined yet. \
                 Before accessing fields, narrow the type using type guards (`typeof`, \
                 `instanceof`), pattern matching, explicit type assertions, or provide more \
                 specific type annotations in your function signatures or variable declarations."
            )
            .expect("infallible");
        }
    }

    diagnostic.add_message(Message::help(help_message));

    diagnostic.add_message(Message::note(format!(
        "Field access with the dot operator (`.`) is reserved for structured data types that have \
         named components. {} are accessed through different mechanisms - use the appropriate \
         access method for the data type you're working with.",
        category.plural_capitalized()
    )));

    diagnostic
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) enum UnsupportedSubscriptCategory {
    Closure,
    Struct,
    Tuple,
    Primitive,
    Never,
    Unknown,
}

impl UnsupportedSubscriptCategory {
    const fn plural_capitalized(self) -> &'static str {
        match self {
            Self::Closure => "Closures",
            Self::Struct => "Structs",
            Self::Tuple => "Tuples",
            Self::Primitive => "Primitive types",
            Self::Never => "Never",
            Self::Unknown => "Unknown",
        }
    }
}

pub(crate) fn unsupported_subscript<'env, 'heap, K>(
    r#type: Type<'heap, K>,
    index: TypeId,
    category: UnsupportedSubscriptCategory,
    env: &'env Environment<'heap>,
) -> TypeCheckDiagnostic
where
    for<'fmt> TypeFormatter<'fmt, 'env, 'heap>: FormatType<'fmt, K> + FormatType<'fmt, Type<'heap>>,
    K: Copy,
{
    let formatter = Formatter::new(env.heap);
    let mut formatter = TypeFormatter::new(&formatter, env, TypeFormatterOptions::default());

    let index = env.r#type(index);

    let mut diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::UnsupportedSubscript,
        Severity::Error,
    )
    .primary(Label::new(index.span, "Cannot use this as an index"));

    diagnostic
        .labels
        .push(Label::new(r#type.span, "... to subscript this type"));

    let mut help_message = format!(
        "Cannot subscript type '{}' with index '{}'.\n\n",
        formatter.render_type(*r#type.kind, RenderOptions::default()),
        formatter.render_type(index, RenderOptions::default())
    );

    match category {
        UnsupportedSubscriptCategory::Closure => {
            write!(
                help_message,
                "Closures are functions that capture their environment and are meant to be \
                 called, not indexed. To use this closure, call it with arguments like \
                 `closure(arg1, arg2)` instead of trying to access elements with square brackets."
            )
            .expect("infallible");
        }
        UnsupportedSubscriptCategory::Primitive => {
            write!(
                help_message,
                "Primitive types (numbers, strings, booleans, null) are atomic values without \
                 indexable structure. They don't support subscript operations. Use the value \
                 directly instead of trying to access internal elements."
            )
            .expect("infallible");
        }
        UnsupportedSubscriptCategory::Never => {
            write!(
                help_message,
                "The 'never' type represents values that cannot exist - typically indicating \
                 unreachable code paths or overly restrictive type constraints. Since no actual \
                 value of this type can ever be created, subscript access is impossible. Review \
                 your type constraints, union intersections, or conditional logic to ensure this \
                 code path is reachable."
            )
            .expect("infallible");
        }
        UnsupportedSubscriptCategory::Struct => {
            write!(
                help_message,
                "Structs are accessed by their named fields, not by numeric indices. Use dot \
                 notation to access struct fields: `struct.fieldName` instead of square bracket \
                 notation. Square bracket notation is not supported for struct access."
            )
            .expect("infallible");
        }
        UnsupportedSubscriptCategory::Tuple => {
            write!(
                help_message,
                "Tuples should be accessed by their positional fields using dot notation with \
                 numeric indices: `tuple.0` for the first element, `tuple.1` for the second, etc. \
                 Square bracket notation is not supported for tuple access."
            )
            .expect("infallible");
        }
        UnsupportedSubscriptCategory::Unknown => {
            write!(
                help_message,
                "The 'unknown' type represents values whose structure hasn't been determined yet. \
                 Before using subscript operations, narrow the type using type guards (`typeof`, \
                 `instanceof`), pattern matching, explicit type assertions, or provide more \
                 specific type annotations in your function signatures or variable declarations."
            )
            .expect("infallible");
        }
    }

    diagnostic.add_message(Message::help(help_message));

    diagnostic.add_message(Message::note(format!(
        "Subscript operations with square brackets (`[]`) are reserved for indexable data types \
         like lists and dictionaries. {} do not support indexing operations - use the appropriate \
         access method for the data type you're working with.",
        category.plural_capitalized()
    )));

    diagnostic
}

pub(crate) fn recursive_type_projection<'env, 'heap, K>(
    r#type: Type<'heap, K>,
    field: Ident<'heap>,
    env: &'env Environment<'heap>,
) -> TypeCheckDiagnostic
where
    for<'fmt> TypeFormatter<'fmt, 'env, 'heap>: FormatType<'fmt, K>,
    K: Copy,
{
    let formatter = Formatter::new(env.heap);
    let mut formatter = TypeFormatter::new(&formatter, env, TypeFormatterOptions::default());

    let mut diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::RecursiveTypeProjection,
        Severity::Error,
    )
    .primary(Label::new(
        field.span,
        format!("Cannot access field '{field}'"),
    ));

    diagnostic
        .labels
        .push(Label::new(r#type.span, "... on this recursive type"));

    let help_message = format!(
        "Field projection is impossible on recursive type '{}' because it would require infinite \
         type expansion.\n\nRecursive types like `A = A & T` where `T = (a: Number)` create \
         definitions that reference themselves. Attempting to project a field like `A.a` would \
         mean expanding A -> (A & T) -> ((A & T) & T) -> ... infinitely, which cannot be \
         resolved.\n\nThis is mathematically impossible - there is no logical way to project \
         fields on a type that infinitely expands.",
        formatter.render_type(*r#type.kind, RenderOptions::default())
    );

    diagnostic.add_message(Message::help(help_message));

    diagnostic.add_message(Message::note(
        "Recursive type definitions create mathematical impossibilities for field access. It is \
         logically impossible to resolve field projection on types that expand infinitely - no \
         computational system can handle infinite expansions.",
    ));

    diagnostic
}

pub(crate) fn recursive_type_subscript<'env, 'heap, K>(
    r#type: Type<'heap, K>,
    index: TypeId,
    env: &'env Environment<'heap>,
) -> TypeCheckDiagnostic
where
    for<'fmt> TypeFormatter<'fmt, 'env, 'heap>: FormatType<'fmt, K>,
    K: Copy,
{
    let formatter = Formatter::new(env.heap);
    let mut formatter = TypeFormatter::new(&formatter, env, TypeFormatterOptions::default());

    let index = env.r#type(index);

    let mut diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::RecursiveTypeSubscript,
        Severity::Error,
    )
    .primary(Label::new(index.span, "Cannot use this index"));

    diagnostic.labels.push(Label::new(
        r#type.span,
        "... to subscript this recursive type",
    ));

    let help_message = format!(
        "Subscript operation is impossible on recursive type '{}' because it would require \
         infinite type expansion.\n\nDirectly recursive types like `A = A & T` where `T` has \
         indexable structure create definitions that reference themselves without a container. \
         Attempting to subscript such a type would mean expanding A -> (A & T) -> ((A & T) & T) \
         -> ... infinitely, which cannot be resolved.\n\nThis is mathematically impossible - \
         there is no logical way to perform subscript operations on types that expand infinitely.",
        formatter.render_type(*r#type.kind, RenderOptions::default())
    );

    diagnostic.add_message(Message::help(help_message));

    diagnostic.add_message(Message::note(
        "Recursive type definitions create mathematical impossibilities for subscript access. It \
         is logically impossible to resolve subscript operations on types that expand infinitely \
         - no computational system can handle infinite expansions.",
    ));

    diagnostic
}

pub(crate) fn unresolved_selection_constraint<'heap>(
    constraint: SelectionConstraint<'heap>,
    env: &Environment<'heap>,
) -> TypeCheckDiagnostic {
    let diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::UnresolvedSelectionConstraint,
        Severity::Error,
    );

    match constraint {
        SelectionConstraint::Projection {
            subject,
            field,
            output,
        } => {
            let mut diagnostic = diagnostic.primary(Label::new(
                field.span,
                format!("Cannot resolve field access '{field}'"),
            ));

            diagnostic.labels.push(Label::new(
                output.span,
                "... when projecting this unconstrained type",
            ));

            let subject_type = subject.r#type(env);
            diagnostic
                .labels
                .push(Label::new(subject_type.span, "... using this field access"));

            let help_message = format!(
                "The type checker could not resolve field access '{field}' because the subject \
                 type contains unconstrained type variables that remain unsolved after processing \
                 all other constraints. This occurs when the subject type couldn't be determined \
                 due to insufficient type information.\n\nTry adding explicit type annotations to \
                 constrain the subject type."
            );

            diagnostic.add_message(Message::help(help_message));

            diagnostic.add_message(Message::note(
                "Selection constraints are resolved after all other type constraints have been \
                 processed. If any type variables involved in the field access remain \
                 unconstrained at this point, the selection operation cannot be validated.",
            ));

            diagnostic
        }

        SelectionConstraint::Subscript {
            subject,
            index,
            output,
        } => {
            let mut diagnostic = diagnostic.primary(Label::new(
                output.span,
                "Subscript operation cannot be resolved",
            ));

            let subject_type = subject.r#type(env);
            diagnostic.labels.push(Label::new(
                subject_type.span,
                "... when indexing into this type",
            ));

            let index_type = index.r#type(env);
            diagnostic
                .labels
                .push(Label::new(index_type.span, "... using this index type"));

            diagnostic.add_message(Message::help(
                "The type checker could not resolve the subscript operation because the subject \
                 or index types contain unconstrained type variables that remain unsolved after \
                 processing all other constraints. This occurs when either the subject type or \
                 index type couldn't be determined due to insufficient type information.\n\nTry \
                 adding explicit type annotations to constrain the subject and index types.",
            ));

            diagnostic.add_message(Message::note(
                "Subscript operations are resolved after all other type constraints have been \
                 processed. If any type variables involved in the indexing operation remain \
                 unconstrained at this point, the subscript operation cannot be validated.",
            ));

            diagnostic
        }
    }
}

pub(crate) fn list_subscript_mismatch<'env, 'heap, K>(
    list: Type<'heap, K>,
    index: TypeId,
    env: &'env Environment<'heap>,
) -> TypeCheckDiagnostic
where
    for<'fmt> TypeFormatter<'fmt, 'env, 'heap>: FormatType<'fmt, K> + FormatType<'fmt, Type<'heap>>,
    K: Copy,
{
    let formatter = Formatter::new(env.heap);
    let mut formatter = TypeFormatter::new(&formatter, env, TypeFormatterOptions::default());

    let index = env.r#type(index);

    let mut diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::ListIndexTypeMismatch,
        Severity::Error,
    )
    .primary(Label::new(index.span, "Invalid index type for list access"));

    diagnostic
        .labels
        .push(Label::new(list.span, "... when indexing into this list"));

    let help_message = format!(
        "Cannot index into list '{}' with type '{}'. Lists require integer indices to access \
         their elements by position.\n\nUse an integer value or expression that evaluates to an \
         integer: `list[0]` for the first element, `list[index]` where `index` is an integer \
         variable, or `list[expression]` where `expression` produces an integer result.",
        formatter.render_type(*list.kind, RenderOptions::default().with_max_width(60)),
        formatter.render_type(index, RenderOptions::default().with_max_width(60))
    );

    diagnostic.add_message(Message::help(help_message));

    diagnostic.add_message(Message::note(
        "Lists are zero-indexed ordered collections where each element is accessed by its numeric \
         position. Only integer types are valid for list indexing operations. Lists are covariant \
         with respect to their key type.",
    ));

    diagnostic
}

pub(crate) fn dict_subscript_mismatch<'heap>(
    dict: Type<'heap, DictType>,
    index: TypeId,
    env: &Environment<'heap>,
) -> TypeCheckDiagnostic {
    let formatter = Formatter::new(env.heap);
    let mut formatter = TypeFormatter::new(&formatter, env, TypeFormatterOptions::default());

    let index = env.r#type(index);
    let expected = env.r#type(dict.kind.key);

    let mut diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::DictKeyTypeMismatch,
        Severity::Error,
    )
    .primary(Label::new(
        index.span,
        "Key type doesn't match dictionary's key type",
    ));

    diagnostic
        .labels
        .push(Label::new(dict.span, "... when accessing this dictionary"));

    let help_message = format!(
        "Cannot access dictionary with key of type '{}'. This dictionary expects keys of type \
         '{}'.\n\nDictionary keys must match exactly - there is no implicit conversion between \
         key types. Use a key of the correct type or ensure your key expression evaluates to the \
         expected type: `dict[key]` where `key` has type '{}'.",
        formatter.render_type(*index.kind, RenderOptions::default().with_max_width(60)),
        formatter.render_type(*expected.kind, RenderOptions::default().with_max_width(60)),
        formatter.render_type(*expected.kind, RenderOptions::default().with_max_width(60))
    );

    diagnostic.add_message(Message::help(help_message));

    diagnostic.add_message(Message::note(
        "Dictionary keys are invariant - the key type used for access must be exactly equivalent \
         to the dictionary's declared key type. Unlike some languages, there is no implicit type \
         coercion for dictionary key access.",
    ));

    diagnostic
}

/// Creates a diagnostic for when an upper constraint cannot be satisfied
///
/// This occurs when the type system determines that no valid type can satisfy
/// the upper bound constraint for an inference variable, typically indicating
/// contradictory type requirements or unreachable code paths.
pub(crate) fn unsatisfiable_upper_constraint(
    env: &Environment<'_>,
    upper_constraint: TypeId,
    variable: Variable,
) -> TypeCheckDiagnostic {
    let formatter = Formatter::new(env.heap);
    let mut formatter = TypeFormatter::new(&formatter, env, TypeFormatterOptions::default());

    let upper_type = env.r#type(upper_constraint);
    let variable_type = variable.into_type(env);

    let mut diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::UnsatisfiableUpperConstraint,
        Severity::Error,
    )
    .primary(Label::new(
        upper_type.span,
        "Upper constraint cannot be satisfied",
    ));

    diagnostic.labels.push(Label::new(
        variable_type.span,
        "This variable has conflicting type requirements",
    ));

    diagnostic.add_message(Message::help(format!(
        "The inference variable `{}` has an upper bound constraint of type `{}` that cannot be \
         satisfied. This typically means there are contradictory type requirements that make it \
         impossible for any valid value to exist. Review the constraints placed on this variable.",
        formatter.render_type(
            *variable_type.kind,
            RenderOptions::default().with_max_width(40)
        ),
        formatter.render_type(
            *upper_type.kind,
            RenderOptions::default().with_max_width(40)
        )
    )));

    diagnostic.add_message(Message::note(
        "Upper bound constraints specify the most general type that a variable can be. When an \
         upper constraint is unsatisfiable, it means the type system has determined that no type \
         can meet all the requirements, often due to conflicting constraints from different parts \
         of the code.",
    ));

    diagnostic
}
