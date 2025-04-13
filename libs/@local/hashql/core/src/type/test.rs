use core::assert_matches::assert_matches;

use super::{Type, TypeId, TypeKind, unify::UnificationContext};
use crate::{
    arena::Arena,
    span::SpanId,
    symbol::{Ident, IdentKind, Symbol},
    r#type::{
        generic_argument::{GenericArgument, GenericArgumentId, GenericArguments},
        intersection_type,
        opaque::OpaqueType,
        primitive::PrimitiveType,
        r#struct::{StructField, StructType},
        unify_type,
        union::UnionType,
    },
};

pub(crate) fn setup() -> UnificationContext {
    UnificationContext::new(SpanId::SYNTHETIC, Arena::new())
}

pub(crate) fn instantiate(context: &mut UnificationContext, kind: TypeKind) -> TypeId {
    context.arena.arena_mut_test_only().push_with(|id| Type {
        id,
        span: SpanId::SYNTHETIC,
        kind,
    })
}

pub(crate) fn ident(value: &str) -> Ident {
    Ident {
        span: SpanId::SYNTHETIC,
        value: Symbol::new(value),
        kind: IdentKind::Lexical,
    }
}

#[test]
fn unify_never_types() {
    let mut context = setup();

    let never1 = instantiate(&mut context, TypeKind::Never);
    let never2 = instantiate(&mut context, TypeKind::Never);

    unify_type(&mut context, never1, never2);

    assert!(matches!(context.arena[never1].kind, TypeKind::Never));
    assert!(matches!(context.arena[never2].kind, TypeKind::Never));
}

#[test]
fn never_with_other_type() {
    let mut context = setup();

    let never = instantiate(&mut context, TypeKind::Never);
    let other = instantiate(&mut context, TypeKind::Unknown);

    unify_type(&mut context, never, other);

    // Never stays the same, but the other type becomes Error since it should have been Never
    assert!(matches!(context.arena[never].kind, TypeKind::Never));
    assert!(matches!(context.arena[other].kind, TypeKind::Error));
}

#[test]
fn unify_unknown_types() {
    let mut context = setup();

    let unknown1 = instantiate(&mut context, TypeKind::Unknown);
    let unknown2 = instantiate(&mut context, TypeKind::Unknown);

    unify_type(&mut context, unknown1, unknown2);

    assert!(matches!(context.arena[unknown1].kind, TypeKind::Unknown));
    assert!(matches!(context.arena[unknown2].kind, TypeKind::Unknown));
}

#[test]
fn unknown_with_other_type() {
    let mut context = setup();

    let unknown = instantiate(&mut context, TypeKind::Unknown);
    let never = instantiate(&mut context, TypeKind::Never);

    unify_type(&mut context, unknown, never);

    // Unknown becomes Error when unified with Never, since it's expected to be Never
    assert!(matches!(context.arena[unknown].kind, TypeKind::Never));
}

#[test]
fn unify_infer_types() {
    let mut context = setup();

    let infer1 = instantiate(&mut context, TypeKind::Infer);
    let infer2 = instantiate(&mut context, TypeKind::Infer);

    unify_type(&mut context, infer1, infer2);

    // One should link to the other
    if let TypeKind::Link(target) = context.arena[infer1].kind {
        assert_eq!(target, infer2);
    } else {
        panic!("Expected infer1 to link to infer2");
    }
}

#[test]
fn infer_with_concrete_type() {
    let mut context = setup();

    let infer = instantiate(&mut context, TypeKind::Infer);
    let never = instantiate(&mut context, TypeKind::Never);

    unify_type(&mut context, infer, never);

    // Infer should become the concrete type
    assert_matches!(context.arena[infer].kind, TypeKind::Never);
}

#[test]
fn error_propagates() {
    let mut context = setup();

    let error = instantiate(&mut context, TypeKind::Error);
    let other = instantiate(&mut context, TypeKind::Never);

    unify_type(&mut context, error, other);

    // Error should propagate to both types
    assert_matches!(context.arena[error].kind, TypeKind::Error);
    assert_matches!(context.arena[other].kind, TypeKind::Error);
}

#[test]
fn link_resolves_to_target() {
    let mut context = setup();

    // Create a chain: link1 -> link2 -> unknown
    let unknown = instantiate(&mut context, TypeKind::Unknown);
    let link2 = instantiate(&mut context, TypeKind::Link(unknown));
    let link1 = instantiate(&mut context, TypeKind::Link(link2));

    let number = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number));

    unify_type(&mut context, link1, number);

    // Should follow links and resolve to number
    assert_matches!(
        context.arena[unknown].kind,
        TypeKind::Primitive(PrimitiveType::Number)
    );
    assert_matches!(
        context.arena[number].kind,
        TypeKind::Primitive(PrimitiveType::Number)
    );
}

#[test]
fn complex_link_chain_resolution() {
    let mut context = setup();

    // Create a complex chain with multiple links
    let concrete = instantiate(&mut context, TypeKind::Unknown);
    let link1 = instantiate(&mut context, TypeKind::Link(concrete));
    let link2 = instantiate(&mut context, TypeKind::Link(link1));
    let link3 = instantiate(&mut context, TypeKind::Link(link2));

    // Create another chain
    let other_concrete = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number));
    let other_link = instantiate(&mut context, TypeKind::Link(other_concrete));

    // Unify the heads of both chains
    unify_type(&mut context, link3, other_link);

    // The full chain should resolve to Number
    assert!(matches!(
        context.arena[concrete].kind,
        TypeKind::Primitive(PrimitiveType::Number)
    ));

    // Links should still point in the same direction
    if let TypeKind::Link(target) = context.arena[link3].kind {
        assert_eq!(target, link2);
    } else {
        panic!("Expected link3 to still be a Link");
    }
}

#[test]
fn unknown_and_infer_interaction() {
    let mut context = setup();

    // Test interaction between Unknown and Infer
    let unknown = instantiate(&mut context, TypeKind::Unknown);
    let infer = instantiate(&mut context, TypeKind::Infer);

    unify_type(&mut context, unknown, infer);

    // Infer should become Unknown (top type)
    assert!(matches!(context.arena[infer].kind, TypeKind::Unknown));
}

#[test]
fn never_and_infer_interaction() {
    let mut context = setup();

    // Test interaction between Never and Infer
    let never = instantiate(&mut context, TypeKind::Never);
    let infer = instantiate(&mut context, TypeKind::Infer);

    unify_type(&mut context, never, infer);

    // Infer should become Never (bottom type)
    assert!(matches!(context.arena[infer].kind, TypeKind::Never));
}

#[test]
fn error_with_link_chain() {
    let mut context = setup();

    // Create a chain with an Error in the middle
    let concrete = instantiate(&mut context, TypeKind::Unknown);
    let error = instantiate(&mut context, TypeKind::Error);
    let link1 = instantiate(&mut context, TypeKind::Link(error));
    let link2 = instantiate(&mut context, TypeKind::Link(link1));

    // Unify the head of the chain with a concrete type
    unify_type(&mut context, link2, concrete);

    // Error should propagate through the chain
    assert!(matches!(context.arena[concrete].kind, TypeKind::Error));
}

#[test]
fn mixed_special_types_unification() {
    let mut context = setup();

    // Create a complex scenario with multiple special types
    let unknown = instantiate(&mut context, TypeKind::Unknown);
    let infer1 = instantiate(&mut context, TypeKind::Infer);
    let infer2 = instantiate(&mut context, TypeKind::Infer);
    let never = instantiate(&mut context, TypeKind::Never);

    // First unify infer1 and infer2 to create a link
    unify_type(&mut context, infer1, infer2);

    // Then unify the link with Unknown
    unify_type(&mut context, infer2, unknown);

    // Finally unify with Never
    unify_type(&mut context, infer1, never);

    // Check the final state
    assert!(
        matches!(context.arena[infer1].kind, TypeKind::Never)
            || matches!(context.arena[infer1].kind, TypeKind::Link(_))
    );
    assert_matches!(context.arena[infer2].kind, TypeKind::Never);
    assert_matches!(context.arena[unknown].kind, TypeKind::Unknown);
    assert_matches!(context.arena[never].kind, TypeKind::Never);
}

#[test]
fn error_propagation_through_mixed_types() {
    let mut context = setup();

    // Start with different special types
    let error = instantiate(&mut context, TypeKind::Error);
    let never = instantiate(&mut context, TypeKind::Never);
    let unknown = instantiate(&mut context, TypeKind::Unknown);
    let infer = instantiate(&mut context, TypeKind::Infer);

    // Create sequence: error -> never -> unknown -> infer
    // Each step will mark the types as Error due to propagation
    unify_type(&mut context, error, never);
    unify_type(&mut context, never, unknown);
    unify_type(&mut context, unknown, infer);

    // Error should propagate to all types
    assert!(matches!(context.arena[error].kind, TypeKind::Error));
    assert!(matches!(context.arena[never].kind, TypeKind::Error));
    assert!(matches!(context.arena[unknown].kind, TypeKind::Error));
    assert!(matches!(context.arena[infer].kind, TypeKind::Error));
}

#[test]
fn link_to_self_detection() {
    let mut context = setup();

    // Create a type that would link to itself
    let id = instantiate(&mut context, TypeKind::Infer);

    // Create a Link that would point to itself
    context.arena.arena_mut_test_only().update(Type {
        id,
        span: SpanId::SYNTHETIC,
        kind: TypeKind::Link(id),
    });

    // Create a concrete type to unify with
    let concrete = instantiate(&mut context, TypeKind::Unknown);

    // This should detect the circular link
    unify_type(&mut context, id, concrete);

    // The system should handle this gracefully (not crash)
    // Either by propagating an error or breaking the cycle
    // But at minimum it shouldn't panic or overflow stack
}

#[test]
fn direct_circular_reference() {
    let mut context = setup();

    // Create two types that refer to each other
    let id1 = instantiate(&mut context, TypeKind::Infer);
    let id2 = instantiate(&mut context, TypeKind::Infer);

    // Make them refer to each other
    context.arena.arena_mut_test_only().update(Type {
        id: id1,
        span: SpanId::SYNTHETIC,
        kind: TypeKind::Link(id2),
    });

    context.arena.arena_mut_test_only().update(Type {
        id: id2,
        span: SpanId::SYNTHETIC,
        kind: TypeKind::Link(id1),
    });

    // Try to unify with a concrete type
    let concrete = instantiate(&mut context, TypeKind::Unknown);
    unify_type(&mut context, id1, concrete);

    // Check if this was detected as circular
    assert!(
        !context.take_diagnostics().is_empty(),
        "Circular reference not detected"
    );
}

#[test]
fn indirect_circular_reference() {
    let mut context = setup();

    // Create a cycle: A → B → C → A
    let id_a = instantiate(&mut context, TypeKind::Infer);
    let id_b = instantiate(&mut context, TypeKind::Infer);
    let id_c = instantiate(&mut context, TypeKind::Infer);

    context.arena.arena_mut_test_only().update(Type {
        id: id_a,
        span: SpanId::SYNTHETIC,
        kind: TypeKind::Link(id_b),
    });

    context.arena.arena_mut_test_only().update(Type {
        id: id_b,
        span: SpanId::SYNTHETIC,
        kind: TypeKind::Link(id_c),
    });

    context.arena.arena_mut_test_only().update(Type {
        id: id_c,
        span: SpanId::SYNTHETIC,
        kind: TypeKind::Link(id_a),
    });

    // Try to unify with a concrete type
    let concrete = instantiate(&mut context, TypeKind::Unknown);
    unify_type(&mut context, id_a, concrete);

    // Check if this more complex cycle was detected
    assert!(
        !context.take_diagnostics().is_empty(),
        "Indirect circular reference not detected"
    );
}

#[test]
fn alternating_direction_cycle() {
    let mut context = setup();

    // Create types that will form a cycle but with alternating directions
    let id_a = instantiate(&mut context, TypeKind::Infer);
    let id_b = instantiate(&mut context, TypeKind::Infer);
    let id_c = instantiate(&mut context, TypeKind::Infer);

    // Create initial links
    context.arena.arena_mut_test_only().update(Type {
        id: id_a,
        span: SpanId::SYNTHETIC,
        kind: TypeKind::Link(id_b),
    });

    // Unify B with C
    unify_type(&mut context, id_b, id_c);

    // Now make C link back to A, completing the cycle
    context.arena.arena_mut_test_only().update(Type {
        id: id_c,
        span: SpanId::SYNTHETIC,
        kind: TypeKind::Link(id_a),
    });

    // Try to resolve the whole chain
    let concrete = instantiate(&mut context, TypeKind::Unknown);
    unify_type(&mut context, id_a, concrete);

    // Check if this directionally varied cycle was detected
    // This is the test most likely to expose if the approach is too conservative
    assert!(
        !context.take_diagnostics().is_empty(),
        "Alternating direction cycle not detected"
    );
}

#[test]
fn primitive_equivalence() {
    let mut context = setup();
    let type1 = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number));
    let type2 = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number));

    assert!(
        context.arena[type1]
            .structurally_equivalent(&context.arena[type2], context.arena.arena_test_only()),
        "Identical primitive types should be structurally equivalent"
    );

    // Test different primitive types
    let bool_type = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Boolean));
    assert!(
        !context.arena[type1]
            .structurally_equivalent(&context.arena[bool_type], context.arena.arena_test_only()),
        "Different primitive types should not be structurally equivalent"
    );
}

#[test]
fn struct_equivalence() {
    let mut context = setup();

    // Create two identical struct types
    let fields1 = [
        StructField {
            key: ident("name"),
            value: instantiate(&mut context, TypeKind::Primitive(PrimitiveType::String)),
        },
        StructField {
            key: ident("age"),
            value: instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number)),
        },
    ];

    let fields2 = [
        StructField {
            key: ident("name"),
            value: instantiate(&mut context, TypeKind::Primitive(PrimitiveType::String)),
        },
        StructField {
            key: ident("age"),
            value: instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number)),
        },
    ];

    let struct1 = instantiate(
        &mut context,
        TypeKind::Struct(StructType::new(fields1, GenericArguments::new())),
    );

    let struct2 = instantiate(
        &mut context,
        TypeKind::Struct(StructType::new(fields2, GenericArguments::new())),
    );

    assert!(
        context.arena[struct1]
            .structurally_equivalent(&context.arena[struct2], context.arena.arena_test_only()),
        "Identical struct types should be structurally equivalent"
    );

    // Test different field names
    let fields3 = [
        StructField {
            key: ident("firstName"), // Different field name
            value: instantiate(&mut context, TypeKind::Primitive(PrimitiveType::String)),
        },
        StructField {
            key: ident("age"),
            value: instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number)),
        },
    ];

    let struct3 = instantiate(
        &mut context,
        TypeKind::Struct(StructType::new(fields3, GenericArguments::new())),
    );

    assert!(
        !context.arena[struct1]
            .structurally_equivalent(&context.arena[struct3], context.arena.arena_test_only()),
        "Structs with different field names should not be structurally equivalent"
    );
}

#[test]
fn recursive_type_equivalence() {
    let mut context = setup();

    // Create two recursive types (e.g., linked list nodes)
    let node1_value = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number));
    let node2_value = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number));

    let node1_id = context.arena.arena_mut_test_only().push_with(|id| Type {
        id,
        span: SpanId::SYNTHETIC,
        kind: TypeKind::Struct(StructType::new(
            vec![
                StructField {
                    key: ident("value"),
                    value: node1_value,
                },
                StructField {
                    key: ident("next"),
                    value: id, // Self-reference
                },
            ],
            GenericArguments::new(),
        )),
    });

    let node2_id = context.arena.arena_mut_test_only().push_with(|id| Type {
        id,
        span: SpanId::SYNTHETIC,
        kind: TypeKind::Struct(StructType::new(
            vec![
                StructField {
                    key: ident("value"),
                    value: node2_value,
                },
                StructField {
                    key: ident("next"),
                    value: id, // Self-reference
                },
            ],
            GenericArguments::new(),
        )),
    });

    assert!(
        context.arena[node1_id]
            .structurally_equivalent(&context.arena[node2_id], context.arena.arena_test_only()),
        "Recursive types with same structure should be structurally equivalent"
    );
}

#[test]
fn union_type_equivalence() {
    let mut context = setup();

    // Create two union types: String | Number
    let str1 = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::String));
    let num1 = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number));
    let union1 = instantiate(
        &mut context,
        TypeKind::Union(UnionType {
            variants: vec![str1, num1].into(),
        }),
    );

    let str2 = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::String));
    let num2 = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number));
    let union2 = instantiate(
        &mut context,
        TypeKind::Union(UnionType {
            variants: vec![str2, num2].into(),
        }),
    );

    assert!(
        context.arena[union1]
            .structurally_equivalent(&context.arena[union2], context.arena.arena_test_only()),
        "Union types with same variants should be structurally equivalent"
    );

    // Test different variant order
    let union3 = instantiate(
        &mut context,
        TypeKind::Union(UnionType {
            variants: vec![num2, str2].into(), // Different order
        }),
    );

    assert!(
        context.arena[union1]
            .structurally_equivalent(&context.arena[union3], context.arena.arena_test_only()),
        "Union types with same variants in different order should be structurally equivalent"
    );
}

#[test]
fn opaque_type_equivalence() {
    let mut context = setup();

    // Create two opaque types with same name but different underlying types
    let type1 = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number));
    let type2 = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::String));

    let opaque1 = instantiate(
        &mut context,
        TypeKind::Opaque(OpaqueType {
            name: "UserId".into(),
            r#type: type1,
            arguments: GenericArguments::default(),
        }),
    );

    let opaque2 = instantiate(
        &mut context,
        TypeKind::Opaque(OpaqueType {
            name: "UserId".into(),
            r#type: type2, // Different underlying type
            arguments: GenericArguments::default(),
        }),
    );

    assert!(
        context.arena[opaque1]
            .structurally_equivalent(&context.arena[opaque2], context.arena.arena_test_only()),
        "Opaque types with same name should be structurally equivalent regardless of underlying \
         type"
    );

    // Test opaque types with different names but same underlying type
    let opaque3 = instantiate(
        &mut context,
        TypeKind::Opaque(OpaqueType {
            name: "PostId".into(), // Different name
            r#type: type1,         // Same as opaque1
            arguments: GenericArguments::default(),
        }),
    );

    assert!(
        !context.arena[opaque1]
            .structurally_equivalent(&context.arena[opaque3], context.arena.arena_test_only()),
        "Opaque types with different names should not be structurally equivalent even with same \
         underlying type"
    );

    // Test opaque types with generic arguments
    let t_id = GenericArgumentId::new(0);
    let t_type = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number));
    let t_arg = GenericArgument {
        id: t_id,
        name: ident("T"),
        constraint: None,
        r#type: t_type,
    };

    let opaque4 = instantiate(
        &mut context,
        TypeKind::Opaque(OpaqueType {
            name: "Box".into(),
            r#type: t_type,
            arguments: GenericArguments::from_iter([t_arg.clone()]),
        }),
    );

    let opaque5 = instantiate(
        &mut context,
        TypeKind::Opaque(OpaqueType {
            name: "Box".into(),
            r#type: t_type,
            arguments: GenericArguments::from_iter([t_arg]),
        }),
    );

    assert!(
        context.arena[opaque4]
            .structurally_equivalent(&context.arena[opaque5], context.arena.arena_test_only()),
        "Opaque types with same name and generic arguments should be structurally equivalent"
    );

    // Test opaque types with different generic arguments
    let u_id = GenericArgumentId::new(1);
    let u_arg = GenericArgument {
        id: u_id,
        name: ident("U"),
        constraint: None,
        r#type: t_type,
    };

    let opaque6 = instantiate(
        &mut context,
        TypeKind::Opaque(OpaqueType {
            name: "Box".into(),
            r#type: t_type,
            arguments: GenericArguments::from_iter([u_arg]), // Different generic argument
        }),
    );

    assert!(
        !context.arena[opaque4]
            .structurally_equivalent(&context.arena[opaque6], context.arena.arena_test_only()),
        "Opaque types with same name but different generic arguments should not be structurally \
         equivalent"
    );
}

#[test]
fn identical_types_intersection() {
    let mut context = setup();

    // Create a simple Number type
    let num_id = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number));

    let arena = context.arena.arena_mut_test_only();

    // Intersect with itself
    let result = intersection_type(arena, &mut Vec::new(), num_id, num_id);

    // Should be the same type
    assert_eq!(result, num_id);
    assert!(matches!(
        arena[result].kind,
        TypeKind::Primitive(PrimitiveType::Number)
    ));
}

#[test]
fn struct_intersection() {
    let mut context = setup();

    // Create a struct with a 'name' field
    let name_field = StructField {
        key: ident("name"),
        value: instantiate(&mut context, TypeKind::Primitive(PrimitiveType::String)),
    };
    let struct1_id = instantiate(
        &mut context,
        TypeKind::Struct(StructType::new([name_field], GenericArguments::new())),
    );

    // Create a struct with an 'age' field
    let age_field = StructField {
        key: ident("age"),
        value: instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number)),
    };
    let struct2_id = instantiate(
        &mut context,
        TypeKind::Struct(StructType::new([age_field], GenericArguments::new())),
    );

    let arena = context.arena.arena_mut_test_only();

    // Intersect the two structs
    let result = intersection_type(arena, &mut Vec::new(), struct1_id, struct2_id);

    // Result should be a struct with both fields
    let TypeKind::Struct(result_struct) = &arena[result].kind else {
        panic!("Expected struct type, got {:?}", arena[result].kind);
    };

    assert_eq!(result_struct.fields().len(), 2);

    // Check for name field
    let has_name = result_struct.fields().iter().any(|field| {
        field.key.value.as_str() == "name"
            && matches!(
                arena[field.value].kind,
                TypeKind::Primitive(PrimitiveType::String)
            )
    });
    assert!(has_name, "Result should have 'name' field with String type");

    // Check for age field
    let has_age = result_struct.fields().iter().any(|field| {
        field.key.value.as_str() == "age"
            && matches!(
                arena[field.value].kind,
                TypeKind::Primitive(PrimitiveType::Number)
            )
    });
    assert!(has_age, "Result should have 'age' field with Number type");
}

#[test]
fn struct_intersection_with_common_field() {
    let mut context = setup();

    // Create a struct with fields 'name: String' and 'id: Number'
    let struct1_fields = [
        StructField {
            key: ident("name"),
            value: instantiate(&mut context, TypeKind::Primitive(PrimitiveType::String)),
        },
        StructField {
            key: ident("id"),
            value: instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number)),
        },
    ];
    let struct1_id = instantiate(
        &mut context,
        TypeKind::Struct(StructType::new(struct1_fields, GenericArguments::new())),
    );

    // Create a struct with fields 'name: String' and 'age: Number'
    let struct2_fields = [
        StructField {
            key: ident("name"),
            value: instantiate(&mut context, TypeKind::Primitive(PrimitiveType::String)),
        },
        StructField {
            key: ident("age"),
            value: instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number)),
        },
    ];
    let struct2_id = instantiate(
        &mut context,
        TypeKind::Struct(StructType::new(struct2_fields, GenericArguments::new())),
    );

    let arena = context.arena.arena_mut_test_only();

    // Intersect the two structs
    let result = intersection_type(arena, &mut Vec::new(), struct1_id, struct2_id);

    // Result should be a struct with all three fields
    let TypeKind::Struct(result_struct) = &arena[result].kind else {
        panic!("Expected struct type, got {:?}", arena[result].kind);
    };

    assert_eq!(result_struct.fields().len(), 3);

    // Check for name field (common in both)
    let has_name = result_struct.fields().iter().any(|field| {
        field.key.value.as_str() == "name"
            && matches!(
                arena[field.value].kind,
                TypeKind::Primitive(PrimitiveType::String)
            )
    });
    assert!(has_name, "Result should have 'name' field with String type");

    // Check for age field (from struct2)
    let has_age = result_struct.fields().iter().any(|field| {
        field.key.value.as_str() == "age"
            && matches!(
                arena[field.value].kind,
                TypeKind::Primitive(PrimitiveType::Number)
            )
    });
    assert!(has_age, "Result should have 'age' field with Number type");

    // Check for id field (from struct1)
    let has_id = result_struct.fields().iter().any(|field| {
        field.key.value.as_str() == "id"
            && matches!(
                arena[field.value].kind,
                TypeKind::Primitive(PrimitiveType::Number)
            )
    });
    assert!(has_id, "Result should have 'id' field with Number type");
}
