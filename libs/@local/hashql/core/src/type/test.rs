use core::assert_matches::assert_matches;

use super::{
    Type, TypeId, TypeKind,
    environment::{Environment, UnificationEnvironment},
};
use crate::{
    arena::transaction::TransactionalArena,
    span::SpanId,
    symbol::{Ident, IdentKind, Symbol},
    r#type::{
        intersection_type,
        kind::{
            generic_argument::{GenericArgument, GenericArgumentId, GenericArguments},
            opaque::OpaqueType,
            primitive::PrimitiveType,
            r#struct::{StructField, StructType},
            union::UnionType,
        },
    },
};

pub(crate) macro setup_unify($name:ident) {
    let mut environment = Environment::new(SpanId::SYNTHETIC, TransactionalArena::new());

    let mut $name = UnificationEnvironment::new(&mut environment);
}

pub(crate) fn instantiate(env: &mut Environment, kind: TypeKind) -> TypeId {
    env.arena.push_with(|id| Type {
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
    setup_unify!(env);

    let never1 = instantiate(&mut env, TypeKind::Never);
    let never2 = instantiate(&mut env, TypeKind::Never);

    env.unify_type(never1, never2);

    assert!(matches!(env.arena[never1].kind, TypeKind::Never));
    assert!(matches!(env.arena[never2].kind, TypeKind::Never));
}

#[test]
fn never_with_other_type() {
    setup_unify!(env);

    let never = instantiate(&mut env, TypeKind::Never);
    let other = instantiate(&mut env, TypeKind::Unknown);

    env.unify_type(never, other);

    assert!(
        !env.take_diagnostics().is_empty(),
        "There should be an error during unification"
    );

    assert!(matches!(env.arena[never].kind, TypeKind::Never));
    assert!(matches!(env.arena[other].kind, TypeKind::Unknown));
}

#[test]
fn unify_unknown_types() {
    setup_unify!(env);

    let unknown1 = instantiate(&mut env, TypeKind::Unknown);
    let unknown2 = instantiate(&mut env, TypeKind::Unknown);

    env.unify_type(unknown1, unknown2);

    assert!(matches!(env.arena[unknown1].kind, TypeKind::Unknown));
    assert!(matches!(env.arena[unknown2].kind, TypeKind::Unknown));
}

#[test]
fn unknown_with_other_type() {
    setup_unify!(env);

    let unknown = instantiate(&mut env, TypeKind::Unknown);
    let never = instantiate(&mut env, TypeKind::Never);

    env.unify_type(unknown, never);

    assert!(env.take_diagnostics().is_empty());

    assert!(matches!(env.arena[unknown].kind, TypeKind::Unknown));
}

#[test]
fn unify_infer_types() {
    setup_unify!(env);

    let infer1 = instantiate(&mut env, TypeKind::Infer);
    let infer2 = instantiate(&mut env, TypeKind::Infer);

    env.unify_type(infer1, infer2);

    // One should link to the other
    if let TypeKind::Link(target) = env.arena[infer1].kind {
        assert_eq!(target, infer2);
    } else {
        panic!("Expected infer1 to link to infer2");
    }
}

#[test]
fn infer_with_concrete_type() {
    setup_unify!(env);

    let infer = instantiate(&mut env, TypeKind::Infer);
    let never = instantiate(&mut env, TypeKind::Never);

    env.unify_type(infer, never);

    // Infer should become the concrete type
    assert_matches!(env.arena[infer].kind, TypeKind::Never);
}

#[test]
fn link_resolves_to_target() {
    setup_unify!(env);

    // Create a chain: link1 -> link2 -> unknown
    let unknown = instantiate(&mut env, TypeKind::Unknown);
    let link2 = instantiate(&mut env, TypeKind::Link(unknown));
    let link1 = instantiate(&mut env, TypeKind::Link(link2));

    let number = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));

    env.unify_type(link1, number);

    assert!(env.take_diagnostics().is_empty());

    // Unknown should not narrow it's type
    assert_matches!(env.arena[unknown].kind, TypeKind::Unknown);
    assert_matches!(
        env.arena[number].kind,
        TypeKind::Primitive(PrimitiveType::Number)
    );
}

#[test]
fn complex_link_chain_resolution() {
    setup_unify!(env);

    // Create a complex chain with multiple links
    let concrete = instantiate(&mut env, TypeKind::Unknown);
    let link1 = instantiate(&mut env, TypeKind::Link(concrete));
    let link2 = instantiate(&mut env, TypeKind::Link(link1));
    let link3 = instantiate(&mut env, TypeKind::Link(link2));

    // Create another chain
    let other_concrete = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));
    let other_link = instantiate(&mut env, TypeKind::Link(other_concrete));

    // Unify the heads of both chains
    env.unify_type(link3, other_link);

    assert!(env.take_diagnostics().is_empty());

    // The full chain should still resolve to Unknown
    assert!(matches!(env.arena[concrete].kind, TypeKind::Unknown));

    // Links should still point in the same direction
    if let TypeKind::Link(target) = env.arena[link3].kind {
        assert_eq!(target, link2);
    } else {
        panic!("Expected link3 to still be a Link");
    }
}

#[test]
fn unknown_and_infer_interaction() {
    setup_unify!(env);

    // Test interaction between Unknown and Infer
    let unknown = instantiate(&mut env, TypeKind::Unknown);
    let infer = instantiate(&mut env, TypeKind::Infer);

    env.unify_type(unknown, infer);

    // Infer should become Unknown (top type)
    assert!(matches!(env.arena[infer].kind, TypeKind::Unknown));
}

#[test]
fn never_and_infer_interaction() {
    setup_unify!(env);

    // Test interaction between Never and Infer
    let never = instantiate(&mut env, TypeKind::Never);
    let infer = instantiate(&mut env, TypeKind::Infer);

    env.unify_type(never, infer);

    // Infer should become Never (bottom type)
    assert!(matches!(env.arena[infer].kind, TypeKind::Never));
}

#[test]
fn mixed_special_types_unification() {
    setup_unify!(env);

    // Create a complex scenario with multiple special types
    let unknown = instantiate(&mut env, TypeKind::Unknown);
    let infer1 = instantiate(&mut env, TypeKind::Infer);
    let infer2 = instantiate(&mut env, TypeKind::Infer);
    let never = instantiate(&mut env, TypeKind::Never);

    // First unify infer1 and infer2 to create a link
    env.unify_type(infer1, infer2);

    // Then unify the link with Unknown
    env.unify_type(infer2, unknown);

    // Finally unify with Never
    env.unify_type(infer1, never);

    // Check the final state
    assert!(
        matches!(env.arena[infer1].kind, TypeKind::Unknown)
            || matches!(env.arena[infer1].kind, TypeKind::Link(_))
    );
    assert_matches!(env.arena[infer2].kind, TypeKind::Unknown);
    assert_matches!(env.arena[unknown].kind, TypeKind::Unknown);
    assert_matches!(env.arena[never].kind, TypeKind::Never);
}

#[test]
fn link_to_self_detection() {
    setup_unify!(env);

    // Create a type that would link to itself
    let id = instantiate(&mut env, TypeKind::Infer);

    // Create a Link that would point to itself
    env.arena.update(Type {
        id,
        span: SpanId::SYNTHETIC,
        kind: TypeKind::Link(id),
    });

    // Create a concrete type to unify with
    let concrete = instantiate(&mut env, TypeKind::Unknown);

    // This should detect the circular link
    env.unify_type(id, concrete);

    // The system should handle this gracefully (not crash)
    // Either by propagating an error or breaking the cycle
    // But at minimum it shouldn't panic or overflow stack
}

#[test]
fn direct_circular_reference() {
    setup_unify!(env);

    // Create two types that refer to each other
    let id1 = instantiate(&mut env, TypeKind::Infer);
    let id2 = instantiate(&mut env, TypeKind::Infer);

    // Make them refer to each other
    env.arena.update(Type {
        id: id1,
        span: SpanId::SYNTHETIC,
        kind: TypeKind::Link(id2),
    });

    env.arena.update(Type {
        id: id2,
        span: SpanId::SYNTHETIC,
        kind: TypeKind::Link(id1),
    });

    // Try to unify with a concrete type
    let concrete = instantiate(&mut env, TypeKind::Unknown);
    env.unify_type(id1, concrete);

    // Check if this was detected as circular
    assert!(
        !env.take_diagnostics().is_empty(),
        "Circular reference not detected"
    );
}

#[test]
fn indirect_circular_reference() {
    setup_unify!(env);

    // Create a cycle: A → B → C → A
    let id_a = instantiate(&mut env, TypeKind::Infer);
    let id_b = instantiate(&mut env, TypeKind::Infer);
    let id_c = instantiate(&mut env, TypeKind::Infer);

    env.arena.update(Type {
        id: id_a,
        span: SpanId::SYNTHETIC,
        kind: TypeKind::Link(id_b),
    });

    env.arena.update(Type {
        id: id_b,
        span: SpanId::SYNTHETIC,
        kind: TypeKind::Link(id_c),
    });

    env.arena.update(Type {
        id: id_c,
        span: SpanId::SYNTHETIC,
        kind: TypeKind::Link(id_a),
    });

    // Try to unify with a concrete type
    let concrete = instantiate(&mut env, TypeKind::Unknown);
    env.unify_type(id_a, concrete);

    // Check if this more complex cycle was detected
    assert!(
        !env.take_diagnostics().is_empty(),
        "Indirect circular reference not detected"
    );
}

#[test]
fn alternating_direction_cycle() {
    setup_unify!(env);

    // Create types that will form a cycle but with alternating directions
    let id_a = instantiate(&mut env, TypeKind::Infer);
    let id_b = instantiate(&mut env, TypeKind::Infer);
    let id_c = instantiate(&mut env, TypeKind::Infer);

    // Create initial links
    env.arena.update(Type {
        id: id_a,
        span: SpanId::SYNTHETIC,
        kind: TypeKind::Link(id_b),
    });

    // Unify B with C
    env.unify_type(id_b, id_c);

    // Now make C link back to A, completing the cycle
    env.arena.update(Type {
        id: id_c,
        span: SpanId::SYNTHETIC,
        kind: TypeKind::Link(id_a),
    });

    // Try to resolve the whole chain
    let concrete = instantiate(&mut env, TypeKind::Unknown);
    env.unify_type(id_a, concrete);

    // Check if this directionally varied cycle was detected
    // This is the test most likely to expose if the approach is too conservative
    assert!(
        !env.take_diagnostics().is_empty(),
        "Alternating direction cycle not detected"
    );
}

#[test]
fn primitive_equivalence() {
    setup_unify!(env);
    let type1 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));
    let type2 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));

    assert!(
        env.structurally_equivalent(type1, type2),
        "Identical primitive types should be structurally equivalent"
    );

    // Test different primitive types
    let bool_type = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Boolean));
    assert!(
        !env.structurally_equivalent(type1, bool_type),
        "Different primitive types should not be structurally equivalent"
    );
}

#[test]
fn struct_equivalence() {
    setup_unify!(env);

    // Create two identical struct types
    let fields1 = [
        StructField {
            key: ident("name"),
            value: instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String)),
        },
        StructField {
            key: ident("age"),
            value: instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number)),
        },
    ];

    let fields2 = [
        StructField {
            key: ident("name"),
            value: instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String)),
        },
        StructField {
            key: ident("age"),
            value: instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number)),
        },
    ];

    let struct1 = instantiate(
        &mut env,
        TypeKind::Struct(StructType::new(fields1, GenericArguments::new())),
    );

    let struct2 = instantiate(
        &mut env,
        TypeKind::Struct(StructType::new(fields2, GenericArguments::new())),
    );

    assert!(
        env.structurally_equivalent(struct1, struct2),
        "Identical struct types should be structurally equivalent"
    );

    // Test different field names
    let fields3 = [
        StructField {
            key: ident("firstName"), // Different field name
            value: instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String)),
        },
        StructField {
            key: ident("age"),
            value: instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number)),
        },
    ];

    let struct3 = instantiate(
        &mut env,
        TypeKind::Struct(StructType::new(fields3, GenericArguments::new())),
    );

    assert!(
        !env.structurally_equivalent(struct1, struct3),
        "Structs with different field names should not be structurally equivalent"
    );
}

#[test]
fn recursive_type_equivalence() {
    setup_unify!(env);

    // Create two recursive types (e.g., linked list nodes)
    let node1_value = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));
    let node2_value = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));

    let node1_id = env.arena.push_with(|id| Type {
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

    let node2_id = env.arena.push_with(|id| Type {
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
        env.structurally_equivalent(node1_id, node2_id),
        "Recursive types with same structure should be structurally equivalent"
    );
}

#[test]
fn union_type_equivalence() {
    setup_unify!(env);

    // Create two union types: String | Number
    let str1 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String));
    let num1 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));
    let union1 = instantiate(
        &mut env,
        TypeKind::Union(UnionType {
            variants: vec![str1, num1].into(),
        }),
    );

    let str2 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String));
    let num2 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));
    let union2 = instantiate(
        &mut env,
        TypeKind::Union(UnionType {
            variants: vec![str2, num2].into(),
        }),
    );

    assert!(
        env.structurally_equivalent(union1, union2),
        "Union types with same variants should be structurally equivalent"
    );

    // Test different variant order
    let union3 = instantiate(
        &mut env,
        TypeKind::Union(UnionType {
            variants: vec![num2, str2].into(), // Different order
        }),
    );

    assert!(
        env.structurally_equivalent(union1, union3),
        "Union types with same variants in different order should be structurally equivalent"
    );
}

#[test]
fn opaque_type_equivalence() {
    setup_unify!(env);

    // Create two opaque types with same name but different underlying types
    let type1 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));
    let type2 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String));

    let opaque1 = instantiate(
        &mut env,
        TypeKind::Opaque(OpaqueType {
            name: "UserId".into(),
            r#type: type1,
            arguments: GenericArguments::default(),
        }),
    );

    let opaque2 = instantiate(
        &mut env,
        TypeKind::Opaque(OpaqueType {
            name: "UserId".into(),
            r#type: type2, // Different underlying type
            arguments: GenericArguments::default(),
        }),
    );

    assert!(
        env.structurally_equivalent(opaque1, opaque2),
        "Opaque types with same name should be structurally equivalent regardless of underlying \
         type"
    );

    // Test opaque types with different names but same underlying type
    let opaque3 = instantiate(
        &mut env,
        TypeKind::Opaque(OpaqueType {
            name: "PostId".into(), // Different name
            r#type: type1,         // Same as opaque1
            arguments: GenericArguments::default(),
        }),
    );

    assert!(
        !env.structurally_equivalent(opaque1, opaque3),
        "Opaque types with different names should not be structurally equivalent even with same \
         underlying type"
    );

    // Test opaque types with generic arguments
    let t_id = GenericArgumentId::new(0);
    let t_type = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));
    let t_arg = GenericArgument {
        id: t_id,
        name: ident("T"),
        constraint: None,
        r#type: t_type,
    };

    let opaque4 = instantiate(
        &mut env,
        TypeKind::Opaque(OpaqueType {
            name: "Box".into(),
            r#type: t_type,
            arguments: GenericArguments::from_iter([t_arg.clone()]),
        }),
    );

    let opaque5 = instantiate(
        &mut env,
        TypeKind::Opaque(OpaqueType {
            name: "Box".into(),
            r#type: t_type,
            arguments: GenericArguments::from_iter([t_arg]),
        }),
    );

    assert!(
        env.structurally_equivalent(opaque4, opaque5),
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
        &mut env,
        TypeKind::Opaque(OpaqueType {
            name: "Box".into(),
            r#type: t_type,
            arguments: GenericArguments::from_iter([u_arg]), // Different generic argument
        }),
    );

    assert!(
        !env.structurally_equivalent(opaque4, opaque6),
        "Opaque types with same name but different generic arguments should not be structurally \
         equivalent"
    );
}

#[test]
fn identical_types_intersection() {
    setup_unify!(env);

    // Create a simple Number type
    let num_id = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));

    // Intersect with itself
    let result = intersection_type(&mut env, num_id, num_id);

    // Should be the same type
    assert_eq!(result, num_id);
    assert_matches!(
        env.arena[result].kind,
        TypeKind::Primitive(PrimitiveType::Number)
    );
}

#[test]
fn struct_intersection() {
    setup_unify!(env);

    // Create a struct with a 'name' field
    let name_field = StructField {
        key: ident("name"),
        value: instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String)),
    };
    let struct1_id = instantiate(
        &mut env,
        TypeKind::Struct(StructType::new([name_field], GenericArguments::new())),
    );

    // Create a struct with an 'age' field
    let age_field = StructField {
        key: ident("age"),
        value: instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number)),
    };
    let struct2_id = instantiate(
        &mut env,
        TypeKind::Struct(StructType::new([age_field], GenericArguments::new())),
    );

    // Intersect the two structs
    let result = intersection_type(&mut env, struct1_id, struct2_id);

    // Result should be a struct with both fields
    let TypeKind::Struct(result_struct) = &env.arena[result].kind else {
        panic!("Expected struct type, got {:?}", env.arena[result].kind);
    };

    assert_eq!(result_struct.fields().len(), 2);

    // Check for name field
    let has_name = result_struct.fields().iter().any(|field| {
        field.key.value.as_str() == "name"
            && matches!(
                env.arena[field.value].kind,
                TypeKind::Primitive(PrimitiveType::String)
            )
    });
    assert!(has_name, "Result should have 'name' field with String type");

    // Check for age field
    let has_age = result_struct.fields().iter().any(|field| {
        field.key.value.as_str() == "age"
            && matches!(
                env.arena[field.value].kind,
                TypeKind::Primitive(PrimitiveType::Number)
            )
    });
    assert!(has_age, "Result should have 'age' field with Number type");
}

#[test]
fn struct_intersection_with_common_field() {
    setup_unify!(env);

    // Create a struct with fields 'name: String' and 'id: Number'
    let struct1_fields = [
        StructField {
            key: ident("name"),
            value: instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String)),
        },
        StructField {
            key: ident("id"),
            value: instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number)),
        },
    ];
    let struct1_id = instantiate(
        &mut env,
        TypeKind::Struct(StructType::new(struct1_fields, GenericArguments::new())),
    );

    // Create a struct with fields 'name: String' and 'age: Number'
    let struct2_fields = [
        StructField {
            key: ident("name"),
            value: instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String)),
        },
        StructField {
            key: ident("age"),
            value: instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number)),
        },
    ];
    let struct2_id = instantiate(
        &mut env,
        TypeKind::Struct(StructType::new(struct2_fields, GenericArguments::new())),
    );

    // Intersect the two structs
    let result = intersection_type(&mut env, struct1_id, struct2_id);

    // Result should be a struct with all three fields
    let TypeKind::Struct(result_struct) = &env.arena[result].kind else {
        panic!("Expected struct type, got {:?}", env.arena[result].kind);
    };

    assert_eq!(result_struct.fields().len(), 3);

    // Check for name field (common in both)
    let has_name = result_struct.fields().iter().any(|field| {
        field.key.value.as_str() == "name"
            && matches!(
                env.arena[field.value].kind,
                TypeKind::Primitive(PrimitiveType::String)
            )
    });
    assert!(has_name, "Result should have 'name' field with String type");

    // Check for age field (from struct2)
    let has_age = result_struct.fields().iter().any(|field| {
        field.key.value.as_str() == "age"
            && matches!(
                env.arena[field.value].kind,
                TypeKind::Primitive(PrimitiveType::Number)
            )
    });
    assert!(has_age, "Result should have 'age' field with Number type");

    // Check for id field (from struct1)
    let has_id = result_struct.fields().iter().any(|field| {
        field.key.value.as_str() == "id"
            && matches!(
                env.arena[field.value].kind,
                TypeKind::Primitive(PrimitiveType::Number)
            )
    });
    assert!(has_id, "Result should have 'id' field with Number type");
}
