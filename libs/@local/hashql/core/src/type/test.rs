use core::assert_matches::assert_matches;

use super::{
    Type, TypeId, TypeKind,
    environment::{Environment, TypeAnalysisEnvironment},
};
use crate::{
    heap::Heap,
    span::SpanId,
    symbol::{Ident, IdentKind, Symbol},
    r#type::{
        environment::LatticeEnvironment,
        kind::{
            generic_argument::GenericArguments, intersection::IntersectionType,
            primitive::PrimitiveType, tuple::TupleType, union::UnionType,
        },
    },
};

pub(crate) macro setup_analysis($name:ident) {
    let heap = Heap::new();
    let environment = Environment::new(SpanId::SYNTHETIC, &heap);

    let mut $name = TypeAnalysisEnvironment::new(&environment);
    $name.with_diagnostics();
}

pub(crate) fn instantiate<'heap>(env: &Environment<'heap>, kind: TypeKind<'heap>) -> TypeId {
    let kind = env.intern_kind(kind);

    env.alloc(|id| Type {
        id,
        span: SpanId::SYNTHETIC,
        kind,
    })
}

#[test]
fn unify_never_types() {
    setup_analysis!(env);

    let never1 = instantiate(&env, TypeKind::Never);
    let never2 = instantiate(&env, TypeKind::Never);

    env.is_subtype_of(never1, never2);

    assert_matches!(env.types[never1].copied().kind, TypeKind::Never);
    assert_matches!(env.types[never2].copied().kind, TypeKind::Never);
}

#[test]
fn never_with_other_type() {
    setup_analysis!(env);

    let never = instantiate(&env, TypeKind::Never);
    let other = instantiate(&env, TypeKind::Unknown);

    env.is_subtype_of(never, other);

    assert!(
        env.take_diagnostics().is_empty(),
        "There should be an no error during unification"
    );

    assert_matches!(env.types[never].copied().kind, TypeKind::Never);
    assert_matches!(env.types[other].copied().kind, TypeKind::Unknown);
}

#[test]
fn unify_unknown_types() {
    setup_analysis!(env);

    let unknown1 = instantiate(&env, TypeKind::Unknown);
    let unknown2 = instantiate(&env, TypeKind::Unknown);

    env.is_subtype_of(unknown1, unknown2);

    assert_matches!(env.types[unknown1].copied().kind, TypeKind::Unknown);
    assert_matches!(env.types[unknown2].copied().kind, TypeKind::Unknown);
}

#[test]
fn unknown_with_other_type() {
    setup_analysis!(env);

    let unknown = instantiate(&env, TypeKind::Unknown);
    let never = instantiate(&env, TypeKind::Never);

    env.is_subtype_of(unknown, never);

    assert!(env.take_diagnostics().is_empty());

    assert_matches!(env.types[unknown].copied().kind, TypeKind::Unknown);
}

#[test]
fn direct_circular_reference() {
    setup_analysis!(env);

    let a = env.alloc(|tuple_id| Type {
        id: tuple_id,
        span: SpanId::SYNTHETIC,
        kind: env.intern_kind(TypeKind::Tuple(TupleType {
            fields: env.intern_type_ids(&[tuple_id]),
            arguments: GenericArguments::empty(),
        })),
    });

    let b = env.alloc(|id| Type {
        id,
        span: SpanId::SYNTHETIC,
        kind: env.intern_kind(TypeKind::Tuple(TupleType {
            fields: env.intern_type_ids(&[id]),
            arguments: GenericArguments::empty(),
        })),
    });

    // Test subtyping with the circular type
    assert!(env.is_subtype_of(a, b));
    assert!(env.is_subtype_of(b, a));

    // Ensure should be an error reported
    assert_eq!(env.fatal_diagnostics(), 0);

    // Verify the tuple structure is preserved
    if let TypeKind::Tuple(tuple) = env.types[a].copied().kind {
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
    let a = env.alloc(|a_id| Type {
        id: a_id,
        span: SpanId::SYNTHETIC,
        kind: env.intern_kind(TypeKind::Tuple(TupleType {
            fields: env.intern_type_ids(&[env.alloc(|b_id| {
                b = Some(b_id);

                Type {
                    id: b_id,
                    span: SpanId::SYNTHETIC,
                    kind: env.intern_kind(TypeKind::Tuple(TupleType {
                        fields: env.intern_type_ids(&[env.alloc(|c_id| {
                            c = Some(c_id);

                            Type {
                                id: c_id,
                                span: SpanId::SYNTHETIC,
                                kind: env.intern_kind(TypeKind::Tuple(TupleType {
                                    fields: env.intern_type_ids(&[a_id]),
                                    arguments: GenericArguments::empty(),
                                })),
                            }
                        })]),
                        arguments: GenericArguments::empty(),
                    })),
                }
            })]),
            arguments: GenericArguments::empty(),
        })),
    });
    let b = b.expect("b should be Some");
    let c = c.expect("c should be Some");

    // Test subtyping with circular references
    assert!(env.is_subtype_of(a, b));
    assert!(env.is_subtype_of(b, c));
    assert!(env.is_subtype_of(c, a));

    assert_eq!(env.fatal_diagnostics(), 0);

    // Verify the structure of the types
    if let TypeKind::Tuple(tuple) = env.types[a].copied().kind {
        assert_eq!(tuple.fields.len(), 1);
    } else {
        panic!("Expected a tuple type for A");
    }

    if let TypeKind::Tuple(tuple) = env.types[b].copied().kind {
        assert_eq!(tuple.fields.len(), 1);
    } else {
        panic!("Expected a tuple type for B");
    }

    if let TypeKind::Tuple(tuple) = env.types[c].copied().kind {
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
    let union_id = env.alloc(|union_id| Type {
        id: union_id,
        span: SpanId::SYNTHETIC,
        kind: env.intern_kind(TypeKind::Union(UnionType {
            variants: env.intern_type_ids(&[
                number,
                env.alloc(|intersection_id_inner| {
                    intersection_id = Some(intersection_id_inner);

                    Type {
                        id: intersection_id_inner,
                        span: SpanId::SYNTHETIC,
                        kind: env.intern_kind(TypeKind::Intersection(IntersectionType {
                            variants: env.intern_type_ids(&[string, boolean, union_id]),
                        })),
                    }
                }),
            ]),
        })),
    });
    let intersection_id = intersection_id.expect("intersection_id should be Some");

    // Test the cycle with subtyping - these should succeed with recursive handling
    assert!(env.is_subtype_of(union_id, union_id));
    assert!(env.is_subtype_of(intersection_id, intersection_id));

    // Ensure no errors occurred during subtyping
    assert_eq!(env.fatal_diagnostics(), 0);

    // Verify the structure of the types is preserved
    if let TypeKind::Union(union) = env.types[union_id].copied().kind {
        assert_eq!(union.variants.len(), 2);
    } else {
        panic!("Expected a union type");
    }

    if let TypeKind::Intersection(intersection) = env.types[intersection_id].copied().kind {
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
    let list1_id = env.alloc(|id| {
        Type {
            id,
            span: SpanId::SYNTHETIC,
            kind: env.intern_kind(TypeKind::Tuple(TupleType {
                arguments: GenericArguments::empty(),
                fields: env.intern_type_ids(&[number, id]), // [value, next]
            })),
        }
    });

    // Second recursive type - A structurally identical tuple
    let list2_id = env.alloc(|id| {
        Type {
            id,
            span: SpanId::SYNTHETIC,
            kind: env.intern_kind(TypeKind::Tuple(TupleType {
                arguments: GenericArguments::empty(),
                fields: env.intern_type_ids(&[number, id]), // [value, next]
            })),
        }
    });

    // Test that the two recursive types are structurally equivalent
    assert!(env.is_equivalent(list1_id, list2_id));

    // Ensure no errors occurred
    assert_eq!(env.fatal_diagnostics(), 0);

    // Verify that both types have the correct structure
    if let TypeKind::Tuple(tuple) = env.types[list1_id].copied().kind {
        assert_eq!(tuple.fields.len(), 2);
    } else {
        panic!("Expected a tuple type for list1");
    }

    if let TypeKind::Tuple(tuple) = env.types[list2_id].copied().kind {
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
    let type_a = env.alloc(|id| {
        Type {
            id,
            span: SpanId::SYNTHETIC,
            kind: env.intern_kind(TypeKind::Tuple(TupleType {
                arguments: GenericArguments::empty(),
                fields: env.intern_type_ids(&[integer, id]), // [Integer, self]
            })),
        }
    });

    // Create type B = (Number, B)
    let type_b = env.alloc(|id| {
        Type {
            id,
            span: SpanId::SYNTHETIC,
            kind: env.intern_kind(TypeKind::Tuple(TupleType {
                arguments: GenericArguments::empty(),
                fields: env.intern_type_ids(&[number, id]), // [Number, self]
            })),
        }
    });

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
    let type_a = env.alloc(|id| {
        Type {
            id,
            span: SpanId::SYNTHETIC,
            kind: env.intern_kind(TypeKind::Tuple(TupleType {
                arguments: GenericArguments::empty(),
                fields: env.intern_type_ids(&[integer, id]), // [Integer, self]
            })),
        }
    });

    // Create type B = (Number, B)
    let type_b = env.alloc(|id| {
        Type {
            id,
            span: SpanId::SYNTHETIC,
            kind: env.intern_kind(TypeKind::Tuple(TupleType {
                arguments: GenericArguments::empty(),
                fields: env.intern_type_ids(&[number, id]), // [Number, self]
            })),
        }
    });

    // First check subtyping relationships to confirm our premise
    assert!(
        env.is_subtype_of(type_a, type_b),
        "A should be a subtype of B"
    );

    let mut lattice_env = LatticeEnvironment::new(&env);

    // Since A <: B, join(A, B) should be B
    let joined = lattice_env.join(type_a, type_b);

    // Create a new analysis environment to check equivalence
    let mut analysis_env = TypeAnalysisEnvironment::new(&env);
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
    let type_a = env.alloc(|id| {
        Type {
            id,
            span: SpanId::SYNTHETIC,
            kind: env.intern_kind(TypeKind::Tuple(TupleType {
                arguments: GenericArguments::empty(),
                fields: env.intern_type_ids(&[integer, id]), // [Integer, self]
            })),
        }
    });

    // Create type B = (Number, B)
    let type_b = env.alloc(|id| {
        Type {
            id,
            span: SpanId::SYNTHETIC,
            kind: env.intern_kind(TypeKind::Tuple(TupleType {
                arguments: GenericArguments::empty(),
                fields: env.intern_type_ids(&[number, id]), // [Number, self]
            })),
        }
    });

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
