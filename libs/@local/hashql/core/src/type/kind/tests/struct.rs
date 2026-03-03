use core::assert_matches;

use crate::{
    heap::Heap,
    pretty::{Formatter, RenderOptions},
    span::SpanId,
    symbol::Ident,
    r#type::{
        PartialType,
        environment::{
            AnalysisEnvironment, Environment, InferenceEnvironment, LatticeEnvironment,
            SimplifyEnvironment, Variance, instantiate::InstantiateEnvironment,
        },
        error::TypeCheckDiagnosticCategory,
        inference::{Constraint, Inference as _, Variable, VariableKind},
        kind::{
            Generic, GenericArgument, StructType, TypeKind,
            generic::GenericArgumentId,
            infer::HoleId,
            intersection::IntersectionType,
            primitive::PrimitiveType,
            r#struct::StructField,
            test::{assert_equiv, generic, intersection, primitive, r#struct, struct_field, union},
            union::UnionType,
        },
        lattice::{Lattice as _, Projection, Subscript, test::assert_lattice_laws},
        pretty::TypeFormatter,
        tests::{instantiate, instantiate_infer, instantiate_param},
    },
};

#[test]
fn join_identical_structs() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    r#struct!(
        env,
        a,
        [
            struct_field!(env, "name", primitive!(env, PrimitiveType::String)),
            struct_field!(env, "age", primitive!(env, PrimitiveType::Number))
        ]
    );

    r#struct!(
        env,
        b,
        [
            struct_field!(env, "name", primitive!(env, PrimitiveType::String)),
            struct_field!(env, "age", primitive!(env, PrimitiveType::Number))
        ]
    );

    let mut lattice_env = LatticeEnvironment::new(&env);

    // Join identical structs should result in the same struct
    assert_equiv!(
        env,
        a.join(b, &mut lattice_env),
        [r#struct!(
            env,
            [
                struct_field!(env, "name", primitive!(env, PrimitiveType::String)),
                struct_field!(env, "age", primitive!(env, PrimitiveType::Number))
            ]
        )]
    );
}

#[test]
fn join_structs_with_different_fields() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    r#struct!(
        env,
        a,
        [
            struct_field!(env, "name", primitive!(env, PrimitiveType::String)),
            struct_field!(env, "age", primitive!(env, PrimitiveType::Number))
        ]
    );

    r#struct!(
        env,
        b,
        [
            struct_field!(env, "name", primitive!(env, PrimitiveType::String)),
            struct_field!(env, "active", primitive!(env, PrimitiveType::Boolean))
        ]
    );

    let mut lattice_env = LatticeEnvironment::new(&env);

    // Join structs with different fields should include all fields
    assert_equiv!(
        env,
        a.join(b, &mut lattice_env),
        [r#struct!(
            env,
            [
                struct_field!(env, "active", primitive!(env, PrimitiveType::Boolean)),
                struct_field!(env, "age", primitive!(env, PrimitiveType::Number)),
                struct_field!(env, "name", primitive!(env, PrimitiveType::String))
            ]
        )]
    );
}

#[test]
fn join_structs_with_overlapping_fields() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    r#struct!(
        env,
        a,
        [
            struct_field!(env, "name", primitive!(env, PrimitiveType::String)),
            struct_field!(env, "value", primitive!(env, PrimitiveType::Integer))
        ]
    );

    r#struct!(
        env,
        b,
        [
            struct_field!(env, "name", primitive!(env, PrimitiveType::String)),
            struct_field!(env, "value", primitive!(env, PrimitiveType::Number))
        ]
    );

    let mut lattice_env = LatticeEnvironment::new(&env);

    // Join structs with overlapping fields should join those fields
    assert_equiv!(
        env,
        a.join(b, &mut lattice_env),
        [r#struct!(
            env,
            [
                struct_field!(env, "name", primitive!(env, PrimitiveType::String)),
                struct_field!(env, "value", primitive!(env, PrimitiveType::Number))
            ]
        )]
    );
}

#[test]
fn meet_identical_structs() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    r#struct!(
        env,
        a,
        [
            struct_field!(env, "name", primitive!(env, PrimitiveType::String)),
            struct_field!(env, "age", primitive!(env, PrimitiveType::Number))
        ]
    );

    r#struct!(
        env,
        b,
        [
            struct_field!(env, "name", primitive!(env, PrimitiveType::String)),
            struct_field!(env, "age", primitive!(env, PrimitiveType::Number))
        ]
    );

    let mut lattice_env = LatticeEnvironment::new(&env);

    // Meet identical structs should result in the same struct
    assert_equiv!(
        env,
        a.meet(b, &mut lattice_env),
        [r#struct!(
            env,
            [
                struct_field!(env, "name", primitive!(env, PrimitiveType::String)),
                struct_field!(env, "age", primitive!(env, PrimitiveType::Number))
            ]
        )]
    );
}

#[test]
fn meet_structs_with_different_fields() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    r#struct!(
        env,
        a,
        [
            struct_field!(env, "name", primitive!(env, PrimitiveType::String)),
            struct_field!(env, "age", primitive!(env, PrimitiveType::Number))
        ]
    );

    r#struct!(
        env,
        b,
        [
            struct_field!(env, "name", primitive!(env, PrimitiveType::String)),
            struct_field!(env, "active", primitive!(env, PrimitiveType::Boolean))
        ]
    );

    let mut lattice_env = LatticeEnvironment::new(&env);

    // Meet structs with different fields should include only common fields
    assert_equiv!(
        env,
        a.meet(b, &mut lattice_env),
        [r#struct!(
            env,
            [struct_field!(
                env,
                "name",
                primitive!(env, PrimitiveType::String)
            )]
        )]
    );
}

#[test]
fn meet_structs_with_overlapping_fields() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    r#struct!(
        env,
        a,
        [
            struct_field!(env, "name", primitive!(env, PrimitiveType::String)),
            struct_field!(env, "value", primitive!(env, PrimitiveType::Number))
        ]
    );

    r#struct!(
        env,
        b,
        [
            struct_field!(env, "name", primitive!(env, PrimitiveType::String)),
            struct_field!(env, "value", primitive!(env, PrimitiveType::Integer))
        ]
    );

    let mut lattice_env = LatticeEnvironment::new(&env);

    // Meet structs with overlapping fields should meet those fields
    assert_equiv!(
        env,
        a.meet(b, &mut lattice_env),
        [r#struct!(
            env,
            [
                struct_field!(env, "name", primitive!(env, PrimitiveType::String)),
                struct_field!(env, "value", primitive!(env, PrimitiveType::Integer))
            ]
        )]
    );
}

#[test]
fn uninhabited_structs() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create a normal struct with inhabited types
    r#struct!(
        env,
        normal_struct,
        [
            struct_field!(env, "name", primitive!(env, PrimitiveType::String)),
            struct_field!(env, "age", primitive!(env, PrimitiveType::Number))
        ]
    );

    // Create an empty struct (which is considered inhabited)
    r#struct!(env, empty_struct, []);

    // Create a struct with an uninhabited field
    r#struct!(
        env,
        never_struct,
        [
            struct_field!(env, "name", primitive!(env, PrimitiveType::String)),
            struct_field!(env, "error", instantiate(&env, TypeKind::Never))
        ]
    );

    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Empty struct should be inhabited (not uninhabited)
    assert!(!empty_struct.is_bottom(&mut analysis_env));

    // Normal struct should be inhabited (not uninhabited)
    assert!(!normal_struct.is_bottom(&mut analysis_env));

    // Struct with a never field should be uninhabited
    assert!(never_struct.is_bottom(&mut analysis_env));
}

#[test]
fn subtype_relationship() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create struct types for testing
    let number = primitive!(env, PrimitiveType::Number);
    let integer = primitive!(env, PrimitiveType::Integer);
    let string = primitive!(env, PrimitiveType::String);

    // Basic structs with same fields
    r#struct!(
        env,
        struct_a,
        [
            struct_field!(env, "name", string),
            struct_field!(env, "value", number)
        ]
    );

    r#struct!(
        env,
        struct_b,
        [
            struct_field!(env, "name", string),
            struct_field!(env, "value", integer)
        ]
    );

    // Struct with more fields
    r#struct!(
        env,
        struct_c,
        [
            struct_field!(env, "name", string),
            struct_field!(env, "value", integer),
            struct_field!(env, "active", primitive!(env, PrimitiveType::Boolean))
        ]
    );

    // Struct with fewer fields
    r#struct!(env, struct_d, [struct_field!(env, "name", string)]);

    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Reflexivity: Every struct is a subtype of itself
    assert!(struct_a.is_subtype_of(struct_a, &mut analysis_env));
    assert!(struct_b.is_subtype_of(struct_b, &mut analysis_env));

    // Structs with the same fields but different field types
    // Since Integer <: Number, (name: String, value: Integer) <: (name: String, value: Number)
    assert!(struct_b.is_subtype_of(struct_a, &mut analysis_env));

    // But (name: String, value: Number) is not a subtype of (name: String, value: Integer)
    assert!(!struct_a.is_subtype_of(struct_b, &mut analysis_env));

    // Width subtyping: a struct with more fields is a subtype of a struct with fewer fields
    // (name, value, active) <: (name, value)
    assert!(struct_c.is_subtype_of(struct_b, &mut analysis_env));

    // (name) is not a subtype of (name, value)
    assert!(!struct_d.is_subtype_of(struct_a, &mut analysis_env));

    // (name, value) is a subtype of (name)
    assert!(struct_a.is_subtype_of(struct_d, &mut analysis_env));
}

#[test]
fn equivalence_relationship() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create structs with same structure but different TypeIds
    r#struct!(
        env,
        a,
        [
            struct_field!(env, "name", primitive!(env, PrimitiveType::String)),
            struct_field!(env, "value", primitive!(env, PrimitiveType::Number))
        ]
    );

    r#struct!(
        env,
        b,
        [
            struct_field!(env, "name", primitive!(env, PrimitiveType::String)),
            struct_field!(env, "value", primitive!(env, PrimitiveType::Number))
        ]
    );

    // Create a struct with different field types
    r#struct!(
        env,
        c,
        [
            struct_field!(env, "name", primitive!(env, PrimitiveType::String)),
            struct_field!(env, "value", primitive!(env, PrimitiveType::Boolean))
        ]
    );

    // Create a struct with different fields
    r#struct!(
        env,
        d,
        [
            struct_field!(env, "name", primitive!(env, PrimitiveType::String)),
            struct_field!(env, "age", primitive!(env, PrimitiveType::Number))
        ]
    );

    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Structs with semantically equivalent fields should be equivalent
    assert!(a.is_equivalent(b, &mut analysis_env));

    // Structs with different field types should not be equivalent
    assert!(!a.is_equivalent(c, &mut analysis_env));

    // Structs with different field names should not be equivalent
    assert!(!a.is_equivalent(d, &mut analysis_env));
}

#[test]
fn equivalence_different_length_structs() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create structs with different numbers of fields
    r#struct!(
        env,
        a,
        [
            struct_field!(env, "name", primitive!(env, PrimitiveType::String)),
            struct_field!(env, "value", primitive!(env, PrimitiveType::Number))
        ]
    );

    r#struct!(
        env,
        b,
        [
            struct_field!(env, "name", primitive!(env, PrimitiveType::String)),
            struct_field!(env, "value", primitive!(env, PrimitiveType::Number)),
            struct_field!(env, "active", primitive!(env, PrimitiveType::Boolean))
        ]
    );

    // Both structs have all fields that are semantically equivalent, but different counts
    // Struct a has 2 fields, struct b has 3 fields

    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Structs with different numbers of fields should not be equivalent
    // Even though the overlapping fields have the same types
    assert!(!a.is_equivalent(b, &mut analysis_env));
    assert!(!b.is_equivalent(a, &mut analysis_env));

    // Verify subtyping relationship to understand why:

    // The struct with more fields (b) should be a subtype of the struct with fewer fields (a)
    assert!(b.is_subtype_of(a, &mut analysis_env));

    // But the struct with fewer fields (a) is not a subtype of the struct with more fields (b)
    assert!(!a.is_subtype_of(b, &mut analysis_env));

    // For equivalence, both would need to be subtypes of each other
    // This demonstrates why width subtyping prevents equivalence for different-length structs
}

#[test]
fn simplify_struct() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create a struct with fields
    r#struct!(
        env,
        normal_struct,
        [
            struct_field!(env, "name", primitive!(env, PrimitiveType::String)),
            struct_field!(env, "age", primitive!(env, PrimitiveType::Number))
        ]
    );

    // Create a struct with an uninhabited field
    r#struct!(
        env,
        never_struct,
        [
            struct_field!(env, "name", primitive!(env, PrimitiveType::String)),
            struct_field!(env, "error", instantiate(&env, TypeKind::Never))
        ]
    );

    let mut simplify_env = SimplifyEnvironment::new(&env);

    // Simplifying a struct with already simplified fields should return the same struct
    let result = normal_struct.simplify(&mut simplify_env);
    assert_eq!(
        result, normal_struct.id,
        "Simplifying a struct with already simple fields should return the same struct"
    );

    // Simplifying a struct with a Never field should result in Never
    let result = never_struct.simplify(&mut simplify_env);
    let result_type = env.r#type(result);
    assert!(
        matches!(result_type.kind, TypeKind::Never),
        "Expected Never, got {:?}",
        result_type.kind
    );
}

#[test]
fn lattice_laws() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create three distinct structs for testing lattice laws
    // We need these to have different field structures for proper lattice testing
    let a = r#struct!(
        env,
        [
            struct_field!(env, "name", primitive!(env, PrimitiveType::String)),
            struct_field!(env, "value", primitive!(env, PrimitiveType::Number))
        ]
    );

    let b = r#struct!(
        env,
        [
            struct_field!(env, "name", primitive!(env, PrimitiveType::String)),
            struct_field!(env, "age", primitive!(env, PrimitiveType::Integer))
        ]
    );

    let c = r#struct!(
        env,
        [
            struct_field!(env, "id", primitive!(env, PrimitiveType::String)),
            struct_field!(env, "active", primitive!(env, PrimitiveType::Boolean))
        ]
    );

    // Test that struct types satisfy lattice laws (associativity, commutativity, absorption)
    assert_lattice_laws(&env, a, b, c);
}

#[test]
fn is_concrete() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Concrete struct (with all concrete fields)
    let number = primitive!(env, PrimitiveType::Number);
    let string = primitive!(env, PrimitiveType::String);

    r#struct!(
        env,
        concrete_struct,
        [
            struct_field!(env, "name", string),
            struct_field!(env, "value", number)
        ]
    );
    assert!(concrete_struct.is_concrete(&mut analysis_env));

    // Non-concrete struct (with at least one non-concrete field)
    let hole = HoleId::new(0);
    let infer_var = instantiate_infer(&env, hole);

    r#struct!(
        env,
        non_concrete_struct,
        [
            struct_field!(env, "name", string),
            struct_field!(env, "value", infer_var)
        ]
    );
    assert!(!non_concrete_struct.is_concrete(&mut analysis_env));

    // Empty struct should be concrete
    r#struct!(env, empty_struct, []);
    assert!(empty_struct.is_concrete(&mut analysis_env));
}

#[test]
fn distribute_union() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Create primitive types
    let string = primitive!(env, PrimitiveType::String);
    let boolean = primitive!(env, PrimitiveType::Boolean);

    // Create a union type
    let union_type = union!(env, [string, boolean]);

    // Create a struct with a union field
    r#struct!(
        env,
        struct_with_union,
        [
            struct_field!(env, "name", string),
            struct_field!(env, "value", union_type)
        ]
    );

    // Distribute the union across the struct
    let result = struct_with_union.distribute_union(&mut analysis_env);

    // Should result in two structs: one with string value, one with boolean value
    assert_equiv!(
        env,
        result,
        [
            r#struct!(
                env,
                [
                    struct_field!(env, "name", string),
                    struct_field!(env, "value", string)
                ]
            ),
            r#struct!(
                env,
                [
                    struct_field!(env, "name", string),
                    struct_field!(env, "value", boolean)
                ]
            )
        ]
    );
}

#[test]
fn distribute_union_multiple_fields() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Create primitive types
    let number = primitive!(env, PrimitiveType::Number);
    let integer = primitive!(env, PrimitiveType::Integer);
    let string = primitive!(env, PrimitiveType::String);
    let boolean = primitive!(env, PrimitiveType::Boolean);

    // Create union types
    let union_type1 = union!(env, [number, integer]);
    let union_type2 = union!(env, [string, boolean]);

    // Create a struct with multiple union fields
    r#struct!(
        env,
        struct_with_unions,
        [
            struct_field!(env, "type", union_type1),
            struct_field!(env, "value", union_type2)
        ]
    );

    // Distribute the unions across the struct
    let result = struct_with_unions.distribute_union(&mut analysis_env);

    // Should result in four structs: all combinations of the union fields
    assert_equiv!(
        env,
        result,
        [
            r#struct!(
                env,
                [
                    struct_field!(env, "type", number),
                    struct_field!(env, "value", string)
                ]
            ),
            r#struct!(
                env,
                [
                    struct_field!(env, "type", integer),
                    struct_field!(env, "value", string)
                ]
            ),
            r#struct!(
                env,
                [
                    struct_field!(env, "type", number),
                    struct_field!(env, "value", boolean)
                ]
            ),
            r#struct!(
                env,
                [
                    struct_field!(env, "type", integer),
                    struct_field!(env, "value", boolean)
                ]
            )
        ]
    );
}

#[test]
fn distribute_intersection() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Create primitive types
    let number = primitive!(env, PrimitiveType::Number);
    let string = primitive!(env, PrimitiveType::String);

    // Create a struct with an intersection field
    let intersect_type = intersection!(env, [number, string]);

    r#struct!(
        env,
        struct_with_intersection,
        [struct_field!(env, "value", intersect_type)]
    );

    let result = struct_with_intersection.distribute_intersection(&mut analysis_env);

    assert_equiv!(
        env,
        result,
        [
            r#struct!(env, [struct_field!(env, "value", number)]),
            r#struct!(env, [struct_field!(env, "value", string)])
        ]
    );
}

#[test]
fn nested_structs() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create inner structs
    r#struct!(
        env,
        inner1,
        [struct_field!(
            env,
            "value",
            primitive!(env, PrimitiveType::Number)
        )]
    );

    r#struct!(
        env,
        inner2,
        [struct_field!(
            env,
            "value",
            primitive!(env, PrimitiveType::Integer)
        )]
    );

    // Create outer structs using inner structs as field types
    r#struct!(
        env,
        outer1,
        [
            struct_field!(env, "nested", inner1.id),
            struct_field!(env, "name", primitive!(env, PrimitiveType::String))
        ]
    );

    r#struct!(
        env,
        outer2,
        [
            struct_field!(env, "nested", inner2.id),
            struct_field!(env, "name", primitive!(env, PrimitiveType::String))
        ]
    );

    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Test subtyping with nested structs
    // Since inner2 (with Integer) is a subtype of inner1 (with Number),
    // outer2 should be a subtype of outer1
    assert!(inner2.is_subtype_of(inner1, &mut analysis_env));
    assert!(outer2.is_subtype_of(outer1, &mut analysis_env));
}

#[test]
fn disjoint_fields() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create structs with completely different fields
    r#struct!(
        env,
        a,
        [
            struct_field!(env, "name", primitive!(env, PrimitiveType::String)),
            struct_field!(env, "age", primitive!(env, PrimitiveType::Number))
        ]
    );

    r#struct!(
        env,
        b,
        [
            struct_field!(env, "id", primitive!(env, PrimitiveType::String)),
            struct_field!(env, "active", primitive!(env, PrimitiveType::Boolean))
        ]
    );

    let mut lattice_env = LatticeEnvironment::new(&env);
    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Join of disjoint structs should have all fields from both
    assert_equiv!(
        env,
        a.join(b, &mut lattice_env),
        [r#struct!(
            env,
            [
                struct_field!(env, "active", primitive!(env, PrimitiveType::Boolean)),
                struct_field!(env, "age", primitive!(env, PrimitiveType::Number)),
                struct_field!(env, "id", primitive!(env, PrimitiveType::String)),
                struct_field!(env, "name", primitive!(env, PrimitiveType::String))
            ]
        )]
    );

    // Meet of disjoint structs should have no fields
    let meet_result = a.meet(b, &mut lattice_env);
    assert_equiv!(env, meet_result, [r#struct!(env, [])]);

    // Test the is_disjoint_by_keys method indirectly through is_equivalent
    // Disjoint structs should not be equivalent
    assert!(!a.is_equivalent(b, &mut analysis_env));
}

#[test]
fn collect_constraints_lower_bound() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create a struct type with a field containing an inference variable
    let number = primitive!(env, PrimitiveType::Number);
    r#struct!(
        env,
        subtype,
        [
            struct_field!(env, "name", primitive!(env, PrimitiveType::String)),
            struct_field!(env, "value", number)
        ]
    );

    // Create a supertype struct with concrete types
    let hole = HoleId::new(0);
    let infer_var = instantiate_infer(&env, hole);
    r#struct!(
        env,
        supertype,
        [
            struct_field!(env, "name", primitive!(env, PrimitiveType::String)),
            struct_field!(env, "value", infer_var)
        ]
    );

    // Create an inference environment to collect constraints
    let mut inference_env = InferenceEnvironment::new(&env);

    // Collect constraints between the two struct types
    subtype.collect_constraints(supertype, &mut inference_env);

    let constraints = inference_env.take_constraints();
    assert_eq!(
        constraints,
        [Constraint::LowerBound {
            variable: Variable::synthetic(VariableKind::Hole(hole)),
            bound: number
        }]
    );
}

#[test]
fn collect_constraints_width_covariance() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create a subtype struct with more fields
    let hole = HoleId::new(0);
    let infer_var = instantiate_infer(&env, hole);
    r#struct!(
        env,
        subtype,
        [
            struct_field!(env, "name", primitive!(env, PrimitiveType::String)),
            struct_field!(env, "value", infer_var),
            struct_field!(env, "extra", primitive!(env, PrimitiveType::Boolean))
        ]
    );

    let number = primitive!(env, PrimitiveType::Number);

    // Create a supertype struct with fewer fields
    r#struct!(
        env,
        supertype,
        [
            struct_field!(env, "name", primitive!(env, PrimitiveType::String)),
            struct_field!(env, "value", number)
        ]
    );

    // Create an inference environment to collect constraints
    let mut inference_env = InferenceEnvironment::new(&env);

    // Collect constraints between the two struct types
    subtype.collect_constraints(supertype, &mut inference_env);

    // Should only have constraints for the common fields
    // We expect one constraint: infer_var <: Number
    let constraints = inference_env.take_constraints();
    assert_eq!(
        constraints,
        [Constraint::UpperBound {
            variable: Variable::synthetic(VariableKind::Hole(hole)),
            bound: number
        }]
    );

    // No constraints should be generated for the "extra" field
}

#[test]
fn collect_constraints_missing_field() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create a subtype struct with fewer fields
    r#struct!(
        env,
        subtype,
        [struct_field!(
            env,
            "name",
            primitive!(env, PrimitiveType::String)
        )]
    );

    // Create a supertype struct with more fields
    let hole = HoleId::new(0);
    let infer_var = instantiate_infer(&env, hole);
    r#struct!(
        env,
        supertype,
        [
            struct_field!(env, "name", primitive!(env, PrimitiveType::String)),
            struct_field!(env, "value", infer_var)
        ]
    );

    let mut inference_env = InferenceEnvironment::new(&env);

    subtype.collect_constraints(supertype, &mut inference_env);

    // This should not generate constraints since the subtype is missing a field
    // During constraint collection this is ignored, and the error would be reported
    // in is_subtype_of instead
    assert!(inference_env.take_constraints().is_empty());
}

#[test]
fn collect_constraints_nested() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create a nested structure with inference variable
    let hole = HoleId::new(0);
    let infer_var = instantiate_infer(&env, hole);

    // Subtype
    r#struct!(
        env,
        a,
        [struct_field!(
            env,
            "nested",
            r#struct!(env, [struct_field!(env, "data", infer_var)])
        )]
    );

    let number = primitive!(env, PrimitiveType::Number);

    // Supertype
    r#struct!(
        env,
        b,
        [struct_field!(
            env,
            "nested",
            r#struct!(env, [struct_field!(env, "data", number)])
        )]
    );

    let mut inference_env = InferenceEnvironment::new(&env);

    a.collect_constraints(b, &mut inference_env);

    let constraints = inference_env.take_constraints();
    assert_eq!(
        constraints,
        [Constraint::UpperBound {
            variable: Variable::synthetic(VariableKind::Hole(hole)),
            bound: number
        }]
    );
}

#[test]
fn collect_constraints_generic_params() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let arg1 = GenericArgumentId::new(0);
    let arg2 = GenericArgumentId::new(1);

    // Create generic parameter types
    let param1 = instantiate_param(&env, arg1);
    let param2 = instantiate_param(&env, arg2);

    // Create structs with generic parameters
    let subtype = generic!(
        env,
        r#struct!(env, [struct_field!(env, "value", param1)]),
        [GenericArgument {
            id: arg1,
            name: heap.intern_symbol("T"),
            constraint: None
        }]
    );

    let supertype = generic!(
        env,
        r#struct!(env, [struct_field!(env, "value", param2)]),
        [GenericArgument {
            id: arg2,
            name: heap.intern_symbol("U"),
            constraint: None
        }]
    );

    // Create an inference environment to collect constraints
    let mut inference_env = InferenceEnvironment::new(&env);

    // Collect constraints between the generic structs
    inference_env.collect_constraints(Variance::Covariant, subtype, supertype);

    let constraints = inference_env.take_constraints();
    assert_eq!(
        constraints,
        [Constraint::Ordering {
            lower: Variable::synthetic(VariableKind::Generic(arg1)),
            upper: Variable::synthetic(VariableKind::Generic(arg2))
        }]
    );
}

#[test]
fn collect_constraints_concrete() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let integer = primitive!(env, PrimitiveType::Integer);
    let number = primitive!(env, PrimitiveType::Number);

    // Create structs with a covariant relationship in the field types
    r#struct!(env, subtype, [struct_field!(env, "value", integer)]);

    r#struct!(env, supertype, [struct_field!(env, "value", number)]);

    let mut inference_env = InferenceEnvironment::new(&env);

    // In a non-constraint-collection scenario, we would expect:
    // (value: Integer) <: (value: Number)
    // but during constraint collection, no explicit constraints are added
    // since there are no inference variables
    subtype.collect_constraints(supertype, &mut inference_env);

    // No constraints should have been generated since both types are concrete
    // and constraints are only generated for inference variables
    assert!(inference_env.take_constraints().is_empty());
}

#[test]
fn collect_dependencies() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create inference variables for multiple fields
    let hole1 = HoleId::new(0);
    let infer_var1 = instantiate_infer(&env, hole1);
    let hole2 = HoleId::new(1);
    let infer_var2 = instantiate_infer(&env, hole2);

    // Create a struct with multiple fields containing inference variables: { x: _0, y: _1 }
    r#struct!(
        env,
        struct_type,
        [
            struct_field!(env, "x", infer_var1),
            struct_field!(env, "y", infer_var2)
        ]
    );

    let mut inference_env = InferenceEnvironment::new(&env);

    // Create a variable to use as the target in a structural edge
    let variable = Variable::synthetic(VariableKind::Hole(HoleId::new(2)));

    // Collect structural edges
    inference_env.collect_dependencies(struct_type.id, variable);

    // Struct fields are covariant, so the field inference variables should flow to the target
    // We expect: _0 -> _2 and _1 -> _2
    let constraints = inference_env.take_constraints();
    assert_eq!(
        constraints,
        [
            Constraint::Dependency {
                source: variable,
                target: Variable::synthetic(VariableKind::Hole(hole1)),
            },
            Constraint::Dependency {
                source: variable,
                target: Variable::synthetic(VariableKind::Hole(hole2)),
            }
        ]
    );
}

#[test]
fn simplify_recursive_struct() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create a recursive struct
    let r#type = env.types.intern(|id| PartialType {
        span: SpanId::SYNTHETIC,
        kind: env.intern_kind(TypeKind::Struct(StructType {
            fields: env
                .intern_struct_fields(&mut [struct_field!(env, "self", id.value())])
                .expect("fields should be unique"),
        })),
    });

    let mut simplify = SimplifyEnvironment::new(&env);
    let type_id = simplify.simplify(r#type.id);

    let r#type = env.r#type(type_id);

    assert_matches!(
        r#type.kind,
        TypeKind::Struct(StructType { fields }) if fields.len() == 1
            && fields[0].name.as_str() == "self"
            && fields[0].value == type_id
    );
}

#[test]
fn instantiate_struct() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let argument = env.counter.generic_argument.next();

    let id = generic!(
        env,
        r#struct!(
            env,
            [struct_field!(
                env,
                "name",
                instantiate_param(&env, argument)
            )]
        ),
        [GenericArgument {
            id: argument,
            name: env.heap.intern_symbol("T"),
            constraint: None
        }]
    );

    let mut instantiate = InstantiateEnvironment::new(&env);
    let type_id = instantiate.instantiate(id);

    let generic = env
        .r#type(type_id)
        .kind
        .generic()
        .expect("should be generic");
    assert_eq!(generic.arguments.len(), 1);

    let r#type = env
        .r#type(generic.base)
        .kind
        .r#struct()
        .expect("should be struct");

    assert_eq!(r#type.fields.len(), 1);
    assert_eq!(r#type.fields[0].name.as_str(), "name");
    let field = env.r#type(r#type.fields[0].value);
    let param = field.kind.param().expect("should be param");

    assert_eq!(param.argument, generic.arguments[0].id);
    assert_ne!(param.argument, argument);
}

#[test]
fn instantiate_struct_recursive() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let argument = env.counter.generic_argument.next();

    let value = env.types.intern(|id| PartialType {
        span: SpanId::SYNTHETIC,
        kind: env.intern_kind(TypeKind::Generic(Generic {
            base: r#struct!(env, [struct_field!(env, "name", id.value())]),
            arguments: env.intern_generic_arguments(&mut [GenericArgument {
                id: argument,
                name: env.heap.intern_symbol("T"),
                constraint: None,
            }]),
        })),
    });

    let mut instantiate = InstantiateEnvironment::new(&env);
    let type_id = instantiate.instantiate(value.id);

    let generic = env
        .r#type(type_id)
        .kind
        .generic()
        .expect("should be generic");

    assert_eq!(generic.arguments.len(), 1);

    let r#type = env
        .r#type(generic.base)
        .kind
        .r#struct()
        .expect("should be struct");

    assert_eq!(r#type.fields.len(), 1);
    assert_eq!(r#type.fields[0].name.as_str(), "name");
    assert_eq!(r#type.fields[0].value, type_id);
}

#[test]
fn instantiate_interdependent() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let t = env.counter.generic_argument.next();
    let u = env.counter.generic_argument.next();

    let value = generic!(
        env,
        r#struct!(env, []),
        [
            GenericArgument {
                id: t,
                name: env.heap.intern_symbol("T"),
                constraint: None,
            },
            GenericArgument {
                id: u,
                name: env.heap.intern_symbol("U"),
                constraint: Some(instantiate_param(&env, t)),
            }
        ]
    );

    let mut instantiate = InstantiateEnvironment::new(&env);
    let type_id = instantiate.instantiate(value);

    let formatter = Formatter::new(env.heap);
    let mut formatter = TypeFormatter::with_defaults(&formatter, &env);

    // The type is complicated enough that it isn't feasible to test it through assertions.
    insta::assert_snapshot!(formatter.render_type(type_id, RenderOptions::default().with_plain()));
}

#[test]
fn projection() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let string = primitive!(env, PrimitiveType::String);

    let value = r#struct!(env, [struct_field!(env, "foo", string)]);

    let mut lattice = LatticeEnvironment::new(&env);
    let projection = lattice.projection(value, Ident::synthetic(heap.intern_symbol("foo")));

    assert_eq!(projection, Projection::Resolved(string));
}

#[test]
fn projection_unknown_field() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let string = primitive!(env, PrimitiveType::String);

    let value = r#struct!(env, [struct_field!(env, "foo", string)]);

    let mut lattice = LatticeEnvironment::new(&env);
    let projection = lattice.projection(value, Ident::synthetic(heap.intern_symbol("bar")));
    assert_eq!(projection, Projection::Error);

    let diagnostics = lattice.take_diagnostics().into_vec();
    assert_eq!(diagnostics.len(), 1);
    assert_eq!(
        diagnostics[0].category,
        TypeCheckDiagnosticCategory::FieldNotFound
    );
}

#[test]
fn subscript() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let mut lattice = LatticeEnvironment::new(&env);
    let mut inference = InferenceEnvironment::new(&env);

    let result = lattice.subscript(
        r#struct!(
            env,
            [struct_field!(
                env,
                "foo",
                primitive!(env, PrimitiveType::String)
            )]
        ),
        primitive!(env, PrimitiveType::String),
        &mut inference,
    );
    assert_eq!(result, Subscript::Error);

    let diagnostics = lattice.take_diagnostics().into_vec();
    assert_eq!(diagnostics.len(), 1);
    assert_eq!(
        diagnostics[0].category,
        TypeCheckDiagnosticCategory::UnsupportedSubscript
    );
}
