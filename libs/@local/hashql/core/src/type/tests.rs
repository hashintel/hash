#![expect(clippy::min_ident_chars, clippy::unwrap_used)]
use core::{assert_matches::assert_matches, fmt::Debug, iter};

use super::{
    PartialType, TypeId, TypeKind,
    environment::{AnalysisEnvironment, Environment, SimplifyEnvironment},
    error::TypeCheckDiagnosticIssues,
    inference::{Substitution, VariableKind, VariableLookup},
    kind::{Infer, Param, generic::GenericArgumentId, infer::HoleId, test::assert_equiv},
};
use crate::{
    span::SpanId,
    symbol::Ident,
    r#type::{
        builder::lazy,
        environment::Variance,
        error::TypeCheckDiagnosticCategory,
        lattice::{Projection, Subscript},
    },
};

pub(crate) fn instantiate<'heap>(env: &Environment<'heap>, kind: TypeKind<'heap>) -> TypeId {
    let kind = env.intern_kind(kind);

    env.intern_type(PartialType {
        span: SpanId::SYNTHETIC,
        kind,
    })
}

pub(crate) fn instantiate_param(
    env: &Environment<'_>,
    argument: impl TryInto<GenericArgumentId, Error: Debug>,
) -> TypeId {
    let kind = TypeKind::Param(Param {
        argument: argument.try_into().expect("Should be valid argument"),
    });

    instantiate(env, kind)
}

pub(crate) fn instantiate_infer(
    env: &Environment<'_>,
    hole: impl TryInto<HoleId, Error: Debug>,
) -> TypeId {
    let kind = TypeKind::Infer(Infer {
        hole: hole.try_into().expect("Should be valid argument"),
    });

    instantiate(env, kind)
}

/// A testing utility macro that sets up the necessary infrastructure for type system tests.
///
/// This macro creates a heap, environment, and type builder, with optional specialized
/// environments for different type system operations.
///
/// # Basic Usage
///
/// ```rust
/// scaffold!(heap, env, builder);
/// let my_type = builder.string();
/// ```
///
/// # Additional Environments
///
/// The macro supports several optional environments:
///
/// - `analysis: <name>` - Creates an `AnalysisEnvironment` for subtyping and equivalence checks
/// - `lattice: <name>` - Creates a `LatticeEnvironment` for join/meet operations and projections
/// - `simplify: <name>` - Creates a `SimplifyEnvironment` for type simplification
/// - `inference: <name>` - Creates an `InferenceEnvironment` for type inference operations
macro_rules! scaffold {
    ($heap:ident, $env:ident, $builder:ident $(,[$($extra:tt)*])?) => {
        let $heap = crate::heap::Heap::new();
        #[expect(clippy::allow_attributes)]
        #[allow(unused_mut)]
        let mut $env = crate::r#type::environment::Environment::new(&$heap);
        #[expect(clippy::allow_attributes)]
        #[allow(unused_mut)]
        let mut $builder = crate::r#type::TypeBuilder::synthetic(&$env);

        scaffold!(@extra $env; $($($extra)*)?);
    };

    (@extra $env:ident;) => {};

    (@extra $env:ident; analysis: $analysis:ident $(, $($extra:tt)*)?) => {
        let mut $analysis = crate::r#type::environment::AnalysisEnvironment::new(&$env);
        $analysis.with_diagnostics();

        scaffold!(@extra $env; $($($extra)*)?);
    };

    (@extra $env:ident; lattice: $lattice:ident $(, $($extra:tt)*)?) => {
        let mut $lattice = crate::r#type::environment::LatticeEnvironment::new(&$env);

        scaffold!(@extra $env; $($($extra)*)?);
    };

    (@extra $env:ident; lattice(!simplify): $lattice:ident $(, $($extra:tt)*)?) => {
        let mut $lattice = crate::r#type::environment::LatticeEnvironment::new(&$env);
        $lattice.without_simplify();

        scaffold!(@extra $env; $($($extra)*)?);
    };

    (@extra $env:ident; simplify: $simplify:ident $(, $($extra:tt)*)?) => {
        let mut $simplify = crate::r#type::environment::SimplifyEnvironment::new(&$env);

        scaffold!(@extra $env; $($($extra)*)?);
    };

    (@extra $env:ident; inference: $inference:ident $(, $($extra:tt)*)?) => {
        let mut $inference = crate::r#type::environment::InferenceEnvironment::new(&$env);

        scaffold!(@extra $env; $($($extra)*)?);
    };
}

pub(crate) use scaffold;

#[track_caller]
pub(crate) fn assert_diagnostics(
    diagnostics: TypeCheckDiagnosticIssues,
    categories: impl IntoIterator<Item = TypeCheckDiagnosticCategory, IntoIter: ExactSizeIterator>,
) {
    let categories = categories.into_iter();

    assert_eq!(diagnostics.len(), categories.len());

    for (diagnostic, category) in diagnostics.into_iter().zip(categories) {
        assert_eq!(diagnostic.category, category);
    }
}

#[test]
fn unify_never_types() {
    scaffold!(heap, env, builder, [analysis: analysis]);

    let never1 = builder.never();
    let never2 = builder.never();

    analysis.is_subtype_of(Variance::Covariant, never1, never2);

    assert_matches!(env.r#type(never1).kind, TypeKind::Never);
    assert_matches!(env.r#type(never2).kind, TypeKind::Never);
}

#[test]
fn never_with_other_type() {
    scaffold!(heap, env, builder, [analysis: analysis]);

    let never = builder.never();
    let other = builder.unknown();

    analysis.is_subtype_of(Variance::Covariant, never, other);

    assert!(
        analysis
            .take_diagnostics()
            .expect("should have diagnostics enabled")
            .is_empty(),
        "There should be an no error during unification"
    );

    assert_matches!(env.r#type(never).kind, TypeKind::Never);
    assert_matches!(env.r#type(other).kind, TypeKind::Unknown);
}

#[test]
fn unify_unknown_types() {
    scaffold!(heap, env, builder, [analysis: analysis]);

    let unknown1 = builder.unknown();
    let unknown2 = builder.unknown();

    analysis.is_subtype_of(Variance::Covariant, unknown1, unknown2);

    assert_matches!(env.r#type(unknown1).kind, TypeKind::Unknown);
    assert_matches!(env.r#type(unknown2).kind, TypeKind::Unknown);
}

#[test]
fn unknown_with_other_type() {
    scaffold!(heap, env, builder, [analysis: analysis]);

    let unknown = builder.unknown();
    let never = builder.never();

    analysis.is_subtype_of(Variance::Covariant, unknown, never);

    assert!(
        analysis
            .take_diagnostics()
            .expect("should have diagnostics enabled")
            .is_empty()
    );

    assert_matches!(env.r#type(unknown).kind, TypeKind::Unknown);
}

#[test]
fn direct_circular_reference() {
    scaffold!(heap, env, builder, [analysis: analysis]);

    let a = builder.tuple(lazy(|id, _| [id.value()]));
    let b = builder.tuple(lazy(|id, _| [id.value()]));

    // Test subtyping with the circular type
    assert!(analysis.is_subtype_of(Variance::Covariant, a, b));
    assert!(analysis.is_subtype_of(Variance::Covariant, b, a));

    // Ensure should be an error reported
    assert_eq!(analysis.fatal_diagnostics(), 0);

    // Verify the tuple structure is preserved
    if let TypeKind::Tuple(tuple) = env.r#type(a).kind {
        assert_eq!(tuple.fields.len(), 1);
    } else {
        panic!("Expected a tuple type");
    }
}

#[test]
fn indirect_circular_reference() {
    scaffold!(heap, env, builder, [analysis: analysis]);

    // Create a cycle: A → B → C → A
    let mut c = None;
    let mut b = None;
    let a = builder.tuple(lazy(|a_id, _| {
        [builder.tuple(lazy(|b_id, _| {
            b = Some(b_id);
            [builder.tuple(lazy(|c_id, _| {
                c = Some(c_id);
                [a_id.value()]
            }))]
        }))]
    }));

    let b = b.expect("b should be Some").value();
    let c = c.expect("c should be Some").value();

    // Test subtyping with circular references
    assert!(analysis.is_subtype_of(Variance::Covariant, a, b));
    assert!(analysis.is_subtype_of(Variance::Covariant, b, c));
    assert!(analysis.is_subtype_of(Variance::Covariant, c, a));

    assert_eq!(analysis.fatal_diagnostics(), 0);

    // Verify the structure of the types
    assert_eq!(env.r#type(a).kind.tuple().unwrap().fields.len(), 1);
    assert_eq!(env.r#type(b).kind.tuple().unwrap().fields.len(), 1);
    assert_eq!(env.r#type(c).kind.tuple().unwrap().fields.len(), 1);
}

#[test]
fn alternating_direction_cycle() {
    scaffold!(heap, env, builder, [analysis: analysis]);

    // Create types that will form a cycle but with alternating directions
    // We'll use union and intersection types to create the alternating pattern

    // Create base types
    let number = builder.number();
    let string = builder.string();
    let boolean = builder.boolean();

    // Create a cycle with alternating directions:
    // Union (A) -> Intersection (B) -> Union (A)
    let mut intersection_id = None;
    let union_id = builder.union(lazy(|union_id, _| {
        [
            number,
            builder.intersection(lazy(|intersection_id_provisioned, _| {
                intersection_id = Some(intersection_id_provisioned);
                [string, boolean, union_id.value()]
            })),
        ]
    }));

    let intersection_id = intersection_id
        .expect("intersection_id should be Some")
        .value();

    // Test the cycle with subtyping - these should succeed with recursive handling
    assert!(analysis.is_subtype_of(Variance::Covariant, union_id, union_id));
    assert!(analysis.is_subtype_of(Variance::Covariant, intersection_id, intersection_id));

    // Ensure no errors occurred during subtyping
    assert_eq!(analysis.fatal_diagnostics(), 0);

    // Verify the structure of the types is preserved
    assert_eq!(env.r#type(union_id).kind.union().unwrap().variants.len(), 2);
    assert_eq!(
        env.r#type(intersection_id)
            .kind
            .intersection()
            .unwrap()
            .variants
            .len(),
        3
    );
}

#[test]
fn recursive_type_equivalence() {
    scaffold!(heap, env, builder, [analysis: analysis]);

    // Create two structurally equivalent recursive types (linked list nodes)
    let number = builder.number();

    // First recursive type - A tuple that contains a Number and a reference to itself
    let list1_id = builder.tuple(
        lazy(|id, _| [number, id.value()]), // [value, next]
    );

    // Second recursive type - A structurally identical tuple
    let list2_id = builder.tuple(
        lazy(|id, _| [number, id.value()]), // [value, next]
    );

    // Test that the two recursive types are structurally equivalent
    assert!(analysis.is_equivalent(list1_id, list2_id));

    // Ensure no errors occurred
    assert_eq!(analysis.fatal_diagnostics(), 0);

    // Verify that both types have the correct structure
    assert_eq!(env.r#type(list1_id).kind.tuple().unwrap().fields.len(), 2);
    assert_eq!(env.r#type(list2_id).kind.tuple().unwrap().fields.len(), 2);
}

#[test]
fn recursive_subtyping() {
    scaffold!(heap, env, builder, [analysis: analysis]);

    // Example:
    // type A = (Integer, A)
    // type B = (Number, B)
    // A <: B should be true according to coinductive subtyping

    // Create the primitive types
    let integer = builder.integer();
    let number = builder.number();

    // Create type A = (Integer, A)
    let type_a = builder.tuple(lazy(|id, _| [integer, id.value()])); // [Integer, self]

    // Create type B = (Number, B)
    let type_b = builder.tuple(lazy(|id, _| [number, id.value()])); // [Number, self]

    // Test subtyping relationship A <: B
    // Since Integer <: Number, and we use coinductive reasoning for the recursive part,
    // A <: B should be true
    assert!(
        analysis.is_subtype_of(Variance::Covariant, type_a, type_b),
        "A should be a subtype of B"
    );

    // The reverse should not be true: B </: A
    // Since Number </: Integer
    assert!(
        !analysis.is_subtype_of(Variance::Covariant, type_b, type_a),
        "B should not be a subtype of A"
    );

    assert_eq!(analysis.fatal_diagnostics(), 1);
}

#[test]
fn recursive_join_operation() {
    scaffold!(heap, env, builder, [analysis: analysis, lattice: lattice]);

    // Test the join (least upper bound) operation with recursive types
    // Create the primitive types
    let integer = builder.integer();
    let number = builder.number();

    // Create type A = (Integer, A)
    let type_a = builder.tuple(
        lazy(|id, _| [integer, id.value()]), // [Integer, self]
    );

    // Create type B = (Number, B)
    let type_b = builder.tuple(
        lazy(|id, _| [number, id.value()]), // [Number, self]
    );

    // First check subtyping relationships to confirm our premise
    assert!(
        analysis.is_subtype_of(Variance::Covariant, type_a, type_b),
        "A should be a subtype of B"
    );

    // Since A <: B, join(A, B) should be B
    let joined = lattice.join(type_a, type_b);

    // The join should produce something that acts like B (in this case, it should be a supertype of
    // A)
    assert!(
        analysis.is_subtype_of(Variance::Covariant, type_a, joined),
        "type_a should be a subtype of join result"
    );

    // Ensure the join implementation didn't produce errors
    assert_eq!(lattice.diagnostics.critical(), 0);
}

#[test]
fn recursive_meet_operation() {
    scaffold!(heap, env, builder, [analysis: analysis,lattice: lattice]);

    // Test the meet (greatest lower bound) operation with recursive types
    // Create the primitive types
    let integer = builder.integer();
    let number = builder.number();

    // Create type A = (Integer, A)
    let type_a = builder.tuple(lazy(|id, _| [integer, id.value()]));

    // Create type B = (Number, B)
    let type_b = builder.tuple(lazy(|id, _| [number, id.value()]));

    // Since A <: B, meet(A, B) should be A
    let met = lattice.meet(type_a, type_b);

    // Ensure the meet implementation didn't produce errors
    assert_eq!(lattice.diagnostics.critical(), 0);

    // The meet should produce something equivalent to A
    assert!(
        analysis.is_equivalent(met, type_a),
        "meet(A, B) should be equivalent to A"
    );
}

#[test]
fn recursive_simplify() {
    scaffold!(heap, env, builder);

    // If we have a type that's referencing itself in the substitution during simplification, we
    // should not error out but veil ourselves in a thin generic.

    let hole = builder.fresh_hole();
    let infer = builder.infer(hole);

    let substitution = Substitution::new(
        VariableLookup::new(
            iter::once((VariableKind::Hole(hole), VariableKind::Hole(hole))).collect(),
        ),
        iter::once((VariableKind::Hole(hole), builder.tuple([infer]))).collect(),
    );

    env.substitution = substitution;

    let mut simplify = SimplifyEnvironment::new(&env);
    let result_id = simplify.simplify(infer);

    // The result should be a generic type
    let result = env.r#type(result_id);
    let generic = result.kind.generic().expect("should be a generic");
    assert!(generic.arguments.is_empty());

    let base = env.r#type(generic.base);
    let tuple = base.kind.tuple().expect("should be a tuple");

    assert_eq!(*tuple.fields, [result_id]);
}

#[test]
fn never_projection() {
    scaffold!(heap, env, builder, [lattice: lattice]);

    let result = lattice.projection(builder.never(), Ident::synthetic(heap.intern_symbol("foo")));
    assert_eq!(result, Projection::Error);

    let diagnostics = lattice.take_diagnostics();
    assert_diagnostics(
        diagnostics,
        [TypeCheckDiagnosticCategory::UnsupportedProjection],
    );
}

#[test]
fn never_subscript() {
    scaffold!(heap, env, builder, [lattice: lattice, inference: inference]);

    let result = lattice.subscript(builder.never(), builder.string(), &mut inference);
    assert_eq!(result, Subscript::Error);

    let diagnostics = lattice.take_diagnostics();
    assert_diagnostics(
        diagnostics,
        [TypeCheckDiagnosticCategory::UnsupportedSubscript],
    );
}

#[test]
fn unknown_projection() {
    scaffold!(heap, env, builder, [lattice: lattice]);

    let result = lattice.projection(
        builder.unknown(),
        Ident::synthetic(heap.intern_symbol("foo")),
    );
    assert_eq!(result, Projection::Error);

    let diagnostics = lattice.take_diagnostics();
    assert_diagnostics(
        diagnostics,
        [TypeCheckDiagnosticCategory::UnsupportedProjection],
    );
}

#[test]
fn unknown_subscript() {
    scaffold!(heap, env, builder, [lattice: lattice, inference: inference]);

    let result = lattice.subscript(builder.unknown(), builder.string(), &mut inference);
    assert_eq!(result, Subscript::Error);

    assert_diagnostics(
        lattice.take_diagnostics(),
        [TypeCheckDiagnosticCategory::UnsupportedSubscript],
    );
}

#[test]
fn simplify_nested_union_intersection() {
    scaffold!(heap, env, builder, [simplify: simplify]);

    let value = builder.intersection([
        builder.union([builder.integer(), builder.string()]),
        builder.string(),
    ]);

    let simplified = simplify.simplify(value);
    assert_equiv!(env, [simplified], [builder.string()]);
}
