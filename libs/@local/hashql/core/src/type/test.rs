#![expect(clippy::min_ident_chars)]
use core::{assert_matches::assert_matches, fmt::Debug};

use super::{
    PartialType, TypeId, TypeKind,
    environment::{AnalysisEnvironment, Environment},
    kind::{Infer, Param, generic::GenericArgumentId, infer::HoleId},
};
use crate::{
    heap::Heap,
    span::SpanId,
    r#type::{
        environment::LatticeEnvironment,
        kind::{
            intersection::IntersectionType, primitive::PrimitiveType, tuple::TupleType,
            union::UnionType,
        },
    },
};

macro_rules! setup_analysis {
    ($name:ident) => {
        let heap = Heap::new();
        let environment = Environment::new(SpanId::SYNTHETIC, &heap);

        let mut $name = AnalysisEnvironment::new(&environment);
        $name.with_diagnostics();
    };
}

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

#[test]
fn unify_never_types() {
    setup_analysis!(env);

    let never1 = instantiate(&env, TypeKind::Never);
    let never2 = instantiate(&env, TypeKind::Never);

    env.is_subtype_of(never1, never2);

    assert_matches!(env.r#type(never1).kind, TypeKind::Never);
    assert_matches!(env.r#type(never2).kind, TypeKind::Never);
}

#[test]
fn never_with_other_type() {
    setup_analysis!(env);

    let never = instantiate(&env, TypeKind::Never);
    let other = instantiate(&env, TypeKind::Unknown);

    env.is_subtype_of(never, other);

    assert!(
        env.take_diagnostics()
            .expect("should have diagnostics enabled")
            .is_empty(),
        "There should be an no error during unification"
    );

    assert_matches!(env.r#type(never).kind, TypeKind::Never);
    assert_matches!(env.r#type(other).kind, TypeKind::Unknown);
}

#[test]
fn unify_unknown_types() {
    setup_analysis!(env);

    let unknown1 = instantiate(&env, TypeKind::Unknown);
    let unknown2 = instantiate(&env, TypeKind::Unknown);

    env.is_subtype_of(unknown1, unknown2);

    assert_matches!(env.r#type(unknown1).kind, TypeKind::Unknown);
    assert_matches!(env.r#type(unknown2).kind, TypeKind::Unknown);
}

#[test]
fn unknown_with_other_type() {
    setup_analysis!(env);

    let unknown = instantiate(&env, TypeKind::Unknown);
    let never = instantiate(&env, TypeKind::Never);

    env.is_subtype_of(unknown, never);

    assert!(
        env.take_diagnostics()
            .expect("should have diagnostics enabled")
            .is_empty()
    );

    assert_matches!(env.r#type(unknown).kind, TypeKind::Unknown);
}

#[test]
fn direct_circular_reference() {
    setup_analysis!(env);

    let a = env
        .types
        .intern(|tuple_id| PartialType {
            span: SpanId::SYNTHETIC,
            kind: env.intern_kind(TypeKind::Tuple(TupleType {
                fields: env.intern_type_ids(&[tuple_id.value()]),
            })),
        })
        .id;

    let b = env
        .types
        .intern(|id| PartialType {
            span: SpanId::SYNTHETIC,
            kind: env.intern_kind(TypeKind::Tuple(TupleType {
                fields: env.intern_type_ids(&[id.value()]),
            })),
        })
        .id;

    // Test subtyping with the circular type
    assert!(env.is_subtype_of(a, b));
    assert!(env.is_subtype_of(b, a));

    // Ensure should be an error reported
    assert_eq!(env.fatal_diagnostics(), 0);

    // Verify the tuple structure is preserved
    if let TypeKind::Tuple(tuple) = env.r#type(a).kind {
        assert_eq!(tuple.fields.len(), 1);
    } else {
        panic!("Expected a tuple type");
    }
}

#[test]
fn indirect_circular_reference() {
    setup_analysis!(env);

    // Create a cycle: A → B → C → A
    let mut c = None;
    let mut b = None;
    let a = env
        .types
        .intern(|a_id| PartialType {
            span: SpanId::SYNTHETIC,
            kind: env.intern_kind(TypeKind::Tuple(TupleType {
                fields: env.intern_type_ids(&[env
                    .types
                    .intern(|b_id| {
                        b = Some(b_id);

                        PartialType {
                            span: SpanId::SYNTHETIC,
                            kind: env.intern_kind(TypeKind::Tuple(TupleType {
                                fields: env.intern_type_ids(&[env
                                    .types
                                    .intern(|c_id| {
                                        c = Some(c_id);

                                        PartialType {
                                            span: SpanId::SYNTHETIC,
                                            kind: env.intern_kind(TypeKind::Tuple(TupleType {
                                                fields: env.intern_type_ids(&[a_id.value()]),
                                            })),
                                        }
                                    })
                                    .id]),
                            })),
                        }
                    })
                    .id]),
            })),
        })
        .id;
    let b = b.expect("b should be Some").value();
    let c = c.expect("c should be Some").value();

    // Test subtyping with circular references
    assert!(env.is_subtype_of(a, b));
    assert!(env.is_subtype_of(b, c));
    assert!(env.is_subtype_of(c, a));

    assert_eq!(env.fatal_diagnostics(), 0);

    // Verify the structure of the types
    if let TypeKind::Tuple(tuple) = env.r#type(a).kind {
        assert_eq!(tuple.fields.len(), 1);
    } else {
        panic!("Expected a tuple type for A");
    }

    if let TypeKind::Tuple(tuple) = env.r#type(b).kind {
        assert_eq!(tuple.fields.len(), 1);
    } else {
        panic!("Expected a tuple type for B");
    }

    if let TypeKind::Tuple(tuple) = env.r#type(c).kind {
        assert_eq!(tuple.fields.len(), 1);
    } else {
        panic!("Expected a tuple type for C");
    }
}

#[test]
fn alternating_direction_cycle() {
    setup_analysis!(env);

    // Create types that will form a cycle but with alternating directions
    // We'll use union and intersection types to create the alternating pattern

    // Create base types
    let number = instantiate(&env, TypeKind::Primitive(PrimitiveType::Number));
    let string = instantiate(&env, TypeKind::Primitive(PrimitiveType::String));
    let boolean = instantiate(&env, TypeKind::Primitive(PrimitiveType::Boolean));

    // Create a cycle with alternating directions:
    // Union (A) -> Intersection (B) -> Union (A)
    let mut intersection_id = None;
    let union_id = env
        .types
        .intern(|union_id| PartialType {
            span: SpanId::SYNTHETIC,
            kind: env.intern_kind(TypeKind::Union(UnionType {
                variants: env.intern_type_ids(&[
                    number,
                    env.types
                        .intern(|intersection_id_inner| {
                            intersection_id = Some(intersection_id_inner);

                            PartialType {
                                span: SpanId::SYNTHETIC,
                                kind: env.intern_kind(TypeKind::Intersection(IntersectionType {
                                    variants: env.intern_type_ids(&[
                                        string,
                                        boolean,
                                        union_id.value(),
                                    ]),
                                })),
                            }
                        })
                        .id,
                ]),
            })),
        })
        .id;
    let intersection_id = intersection_id
        .expect("intersection_id should be Some")
        .value();

    // Test the cycle with subtyping - these should succeed with recursive handling
    assert!(env.is_subtype_of(union_id, union_id));
    assert!(env.is_subtype_of(intersection_id, intersection_id));

    // Ensure no errors occurred during subtyping
    assert_eq!(env.fatal_diagnostics(), 0);

    // Verify the structure of the types is preserved
    if let TypeKind::Union(union) = env.r#type(union_id).kind {
        assert_eq!(union.variants.len(), 2);
    } else {
        panic!("Expected a union type");
    }

    if let TypeKind::Intersection(intersection) = env.r#type(intersection_id).kind {
        assert_eq!(intersection.variants.len(), 3);
    } else {
        panic!("Expected an intersection type");
    }
}

#[test]
fn recursive_type_equivalence() {
    setup_analysis!(env);

    // Create two structurally equivalent recursive types (linked list nodes)
    let number = instantiate(&env, TypeKind::Primitive(PrimitiveType::Number));

    // First recursive type - A tuple that contains a Number and a reference to itself
    let list1_id = env
        .types
        .intern(|id| {
            PartialType {
                span: SpanId::SYNTHETIC,
                kind: env.intern_kind(TypeKind::Tuple(TupleType {
                    fields: env.intern_type_ids(&[number, id.value()]), // [value, next]
                })),
            }
        })
        .id;

    // Second recursive type - A structurally identical tuple
    let list2_id = env
        .types
        .intern(|id| {
            PartialType {
                span: SpanId::SYNTHETIC,
                kind: env.intern_kind(TypeKind::Tuple(TupleType {
                    fields: env.intern_type_ids(&[number, id.value()]), // [value, next]
                })),
            }
        })
        .id;

    // Test that the two recursive types are structurally equivalent
    assert!(env.is_equivalent(list1_id, list2_id));

    // Ensure no errors occurred
    assert_eq!(env.fatal_diagnostics(), 0);

    // Verify that both types have the correct structure
    if let TypeKind::Tuple(tuple) = env.r#type(list1_id).kind {
        assert_eq!(tuple.fields.len(), 2);
    } else {
        panic!("Expected a tuple type for list1");
    }

    if let TypeKind::Tuple(tuple) = env.r#type(list2_id).kind {
        assert_eq!(tuple.fields.len(), 2);
    } else {
        panic!("Expected a tuple type for list2");
    }
}

#[test]
fn recursive_subtyping() {
    setup_analysis!(env);

    // Example:
    // type A = (Integer, A)
    // type B = (Number, B)
    // A <: B should be true according to coinductive subtyping

    // Create the primitive types
    let integer = instantiate(&env, TypeKind::Primitive(PrimitiveType::Integer));
    let number = instantiate(&env, TypeKind::Primitive(PrimitiveType::Number));

    // Create type A = (Integer, A)
    let type_a = env
        .types
        .intern(|id| {
            PartialType {
                span: SpanId::SYNTHETIC,
                kind: env.intern_kind(TypeKind::Tuple(TupleType {
                    fields: env.intern_type_ids(&[integer, id.value()]), // [Integer, self]
                })),
            }
        })
        .id;

    // Create type B = (Number, B)
    let type_b = env
        .types
        .intern(|id| {
            PartialType {
                span: SpanId::SYNTHETIC,
                kind: env.intern_kind(TypeKind::Tuple(TupleType {
                    fields: env.intern_type_ids(&[number, id.value()]), // [Number, self]
                })),
            }
        })
        .id;

    // Test subtyping relationship A <: B
    // Since Integer <: Number, and we use coinductive reasoning for the recursive part,
    // A <: B should be true
    assert!(
        env.is_subtype_of(type_a, type_b),
        "A should be a subtype of B"
    );

    // The reverse should not be true: B </: A
    // Since Number </: Integer
    assert!(
        !env.is_subtype_of(type_b, type_a),
        "B should not be a subtype of A"
    );

    assert_eq!(env.fatal_diagnostics(), 1);
}

#[test]
fn recursive_join_operation() {
    setup_analysis!(env);

    // Test the join (least upper bound) operation with recursive types
    // Create the primitive types
    let integer = instantiate(&env, TypeKind::Primitive(PrimitiveType::Integer));
    let number = instantiate(&env, TypeKind::Primitive(PrimitiveType::Number));

    // Create type A = (Integer, A)
    let type_a = env
        .types
        .intern(|id| {
            PartialType {
                span: SpanId::SYNTHETIC,
                kind: env.intern_kind(TypeKind::Tuple(TupleType {
                    fields: env.intern_type_ids(&[integer, id.value()]), // [Integer, self]
                })),
            }
        })
        .id;

    // Create type B = (Number, B)
    let type_b = env
        .types
        .intern(|id| {
            PartialType {
                span: SpanId::SYNTHETIC,
                kind: env.intern_kind(TypeKind::Tuple(TupleType {
                    fields: env.intern_type_ids(&[number, id.value()]), // [Number, self]
                })),
            }
        })
        .id;

    // First check subtyping relationships to confirm our premise
    assert!(
        env.is_subtype_of(type_a, type_b),
        "A should be a subtype of B"
    );

    let mut lattice_env = LatticeEnvironment::new(&env);

    // Since A <: B, join(A, B) should be B
    let joined = lattice_env.join(type_a, type_b);

    // Create a new analysis environment to check equivalence
    let mut analysis_env = AnalysisEnvironment::new(&env);
    analysis_env.with_diagnostics();

    // The join should produce something that acts like B (in this case, it should be a supertype of
    // A)
    assert!(
        analysis_env.is_subtype_of(type_a, joined),
        "type_a should be a subtype of join result"
    );

    // Ensure the join implementation didn't produce errors
    assert_eq!(lattice_env.diagnostics.fatal(), 0);
}

#[test]
fn recursive_meet_operation() {
    setup_analysis!(env);

    // Test the meet (greatest lower bound) operation with recursive types
    // Create the primitive types
    let integer = instantiate(&env, TypeKind::Primitive(PrimitiveType::Integer));
    let number = instantiate(&env, TypeKind::Primitive(PrimitiveType::Number));

    // Create type A = (Integer, A)
    let type_a = env
        .types
        .intern(|id| {
            PartialType {
                span: SpanId::SYNTHETIC,
                kind: env.intern_kind(TypeKind::Tuple(TupleType {
                    fields: env.intern_type_ids(&[integer, id.value()]), // [Integer, self]
                })),
            }
        })
        .id;

    // Create type B = (Number, B)
    let type_b = env
        .types
        .intern(|id| {
            PartialType {
                span: SpanId::SYNTHETIC,
                kind: env.intern_kind(TypeKind::Tuple(TupleType {
                    fields: env.intern_type_ids(&[number, id.value()]), // [Number, self]
                })),
            }
        })
        .id;

    // Create a lattice environment to perform meet operation
    let mut lattice_env = LatticeEnvironment::new(&env);

    // Since A <: B, meet(A, B) should be A
    let met = lattice_env.meet(type_a, type_b);

    // Ensure the meet implementation didn't produce errors
    assert_eq!(lattice_env.diagnostics.fatal(), 0);

    // The meet should produce something equivalent to A
    assert!(
        env.is_equivalent(met, type_a),
        "meet(A, B) should be equivalent to A"
    );
}
