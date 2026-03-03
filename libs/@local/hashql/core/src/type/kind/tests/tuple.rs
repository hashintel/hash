use core::assert_matches;

use crate::{
    heap::Heap,
    span::SpanId,
    symbol::Ident,
    r#type::{
        PartialType,
        builder::lazy,
        environment::{
            AnalysisEnvironment, Environment, InferenceEnvironment, LatticeEnvironment,
            SimplifyEnvironment, Variance, instantiate::InstantiateEnvironment,
        },
        error::TypeCheckDiagnosticCategory,
        inference::{Constraint, Inference as _, Variable, VariableKind},
        kind::{
            Generic, GenericArgument, TupleType, TypeKind,
            generic::GenericArgumentId,
            infer::HoleId,
            intersection::IntersectionType,
            primitive::PrimitiveType,
            test::{assert_equiv, generic, intersection, primitive, tuple, union},
            tests::{assert_is_subtype, assert_join, assert_meet},
            union::UnionType,
        },
        lattice::{Lattice as _, Projection, Subscript, test::assert_lattice_laws},
        tests::{instantiate, instantiate_infer, instantiate_param, scaffold},
    },
};

#[test]
fn join_identical_tuples() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    tuple!(
        env,
        a,
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String)
        ]
    );

    tuple!(
        env,
        b,
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String)
        ]
    );

    let mut lattice_env = LatticeEnvironment::new(&env);

    // Join identical tuples should result in the same tuple
    assert_equiv!(
        env,
        a.join(b, &mut lattice_env),
        [tuple!(
            env,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        )]
    );
}

#[test]
fn join_different_length_tuples() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    tuple!(
        env,
        a,
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String)
        ]
    );
    tuple!(
        env,
        b,
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String),
            primitive!(env, PrimitiveType::String)
        ]
    );

    let mut lattice_env = LatticeEnvironment::new(&env);

    // Joining tuples of different lengths should return both tuples
    assert_equiv!(
        env,
        a.join(b, &mut lattice_env),
        [
            tuple!(
                env,
                [
                    primitive!(env, PrimitiveType::Number),
                    primitive!(env, PrimitiveType::String)
                ]
            ),
            tuple!(
                env,
                [
                    primitive!(env, PrimitiveType::Number),
                    primitive!(env, PrimitiveType::String),
                    primitive!(env, PrimitiveType::String)
                ]
            )
        ]
    );
}

#[test]
fn join_tuple_single_element() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    tuple!(env, a, [primitive!(env, PrimitiveType::Number)]);
    tuple!(env, b, [primitive!(env, PrimitiveType::Integer)]);

    let mut lattice_env = LatticeEnvironment::new(&env);

    let result = a.join(b, &mut lattice_env);

    // Join should result in a new tuple with joined fields
    assert_equiv!(
        env,
        result,
        [tuple!(
            env,
            [
                // Number ⊔ Integer = Number (number is supertype of integer)
                primitive!(env, PrimitiveType::Number),
            ]
        )]
    );
}

#[test]
fn join_tuples_with_different_field_types() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    tuple!(
        env,
        a,
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String)
        ]
    );
    tuple!(
        env,
        b,
        [
            primitive!(env, PrimitiveType::Integer),
            primitive!(env, PrimitiveType::Boolean)
        ]
    );

    let mut lattice_env = LatticeEnvironment::new(&env);

    // Join should result in a new tuple with joined fields
    assert_equiv!(
        env,
        a.join(b, &mut lattice_env),
        [tuple!(
            env,
            [
                // Number ⊔ Integer = Number (number is supertype of integer)
                primitive!(env, PrimitiveType::Number),
                // String ⊔ Boolean = String | Boolean (unrelated)
                union!(
                    env,
                    [
                        primitive!(env, PrimitiveType::String),
                        primitive!(env, PrimitiveType::Boolean)
                    ]
                )
            ]
        )]
    );
}

#[test]
fn meet_identical_tuples() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    tuple!(
        env,
        a,
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String)
        ]
    );

    tuple!(
        env,
        b,
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String)
        ]
    );

    let mut lattice_env = LatticeEnvironment::new(&env);

    // Meet identical tuples should result in the same tuple
    assert_equiv!(
        env,
        a.meet(b, &mut lattice_env),
        [tuple!(
            env,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        )]
    );
}

#[test]
fn meet_different_length_tuples() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create tuples of different lengths
    tuple!(env, a, [primitive!(env, PrimitiveType::Number)]);

    tuple!(
        env,
        b,
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String)
        ]
    );

    let mut lattice_env = LatticeEnvironment::new(&env);

    // Meeting tuples of different lengths should return empty result
    assert_equiv!(env, a.meet(b, &mut lattice_env), []);
}

#[test]
fn meet_tuples_with_different_field_types() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create tuples with same length but different field types
    tuple!(
        env,
        a,
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String)
        ]
    );

    tuple!(
        env,
        b,
        [
            primitive!(env, PrimitiveType::Integer),
            primitive!(env, PrimitiveType::Boolean)
        ]
    );

    let mut lattice_env = LatticeEnvironment::new(&env);

    assert_equiv!(
        env,
        a.meet(b, &mut lattice_env),
        [tuple!(
            env,
            [
                // Number ⊓ Integer = Integer (Integer is subtype of number)
                primitive!(env, PrimitiveType::Integer),
                // String ⊓ Boolean = Never
                instantiate(&env, TypeKind::Never)
            ]
        )]
    );
}

#[test]
fn uninhabited_tuples() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create a normal tuple with inhabited types
    tuple!(
        env,
        normal_tuple,
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String)
        ]
    );

    // Create an empty tuple (which is considered inhabited)
    tuple!(env, empty_tuple, []);

    tuple!(
        env,
        never_tuple,
        [
            primitive!(env, PrimitiveType::Number),
            instantiate(&env, TypeKind::Never),
            primitive!(env, PrimitiveType::String)
        ]
    );

    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Empty tuple should be inhabited (not uninhabited)
    assert!(!empty_tuple.is_bottom(&mut analysis_env));

    // Normal tuple should be inhabited (not uninhabited)
    assert!(!normal_tuple.is_bottom(&mut analysis_env));

    // Tuple with a never field should be uninhabited
    assert!(never_tuple.is_bottom(&mut analysis_env));
}

#[test]
fn subtype_relationship() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create tuple types for testing
    let number = primitive!(env, PrimitiveType::Number);
    let integer = primitive!(env, PrimitiveType::Integer);
    let string = primitive!(env, PrimitiveType::String);

    tuple!(env, tuple_number_string, [number, string]);
    tuple!(env, tuple_integer_string, [integer, string]);
    tuple!(env, tuple_number_number, [number, number]);
    tuple!(env, tuple_different_length, [number, string, number]);

    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Reflexivity: Every tuple is a subtype of itself
    assert!(tuple_number_string.is_subtype_of(tuple_number_string, &mut analysis_env));
    assert!(tuple_integer_string.is_subtype_of(tuple_integer_string, &mut analysis_env));

    // Tuples with the same structure but different field types
    // Since Integer <: Number, (Integer, String) <: (Number, String)
    assert!(tuple_integer_string.is_subtype_of(tuple_number_string, &mut analysis_env));

    // But (Number, String) is not a subtype of (Integer, String)
    assert!(!tuple_number_string.is_subtype_of(tuple_integer_string, &mut analysis_env));

    // Different field types entirely
    assert!(!tuple_number_string.is_subtype_of(tuple_number_number, &mut analysis_env));

    // Different length tuples have no subtyping relationship
    assert!(!tuple_number_string.is_subtype_of(tuple_different_length, &mut analysis_env));
    assert!(!tuple_different_length.is_subtype_of(tuple_number_string, &mut analysis_env));
}

#[test]
fn equivalence_relationship() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create tuples with same structure but different TypeIds
    tuple!(
        env,
        a,
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String)
        ]
    );

    tuple!(
        env,
        b,
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String)
        ]
    );

    // Create a tuple with different structure
    tuple!(
        env,
        c,
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::Boolean)
        ]
    );

    // Create a tuple with different length
    tuple!(env, d, [primitive!(env, PrimitiveType::Number)]);

    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Tuples with semantically equivalent fields should be equivalent
    assert!(a.is_equivalent(b, &mut analysis_env));

    // Tuples with different field types should not be equivalent
    assert!(!a.is_equivalent(c, &mut analysis_env));

    // Tuples with different lengths should not be equivalent
    assert!(!a.is_equivalent(d, &mut analysis_env));
}

#[test]
fn simplify_tuple() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create a tuple with fields
    tuple!(
        env,
        tuple,
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String)
        ]
    );

    let mut simplify_env = SimplifyEnvironment::new(&env);

    // Simplifying a tuple with already simplified fields should return the same tuple
    let result = tuple.simplify(&mut simplify_env);
    assert_eq!(
        result, tuple.id,
        "Simplifying a tuple with already simple fields should return the same tuple"
    );
}

#[test]
fn lattice_laws() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create three distinct single-element tuples for testing lattice laws
    // We need these to have different element types for proper lattice testing
    let a = tuple!(env, [primitive!(env, PrimitiveType::Number)]);
    let b = tuple!(env, [primitive!(env, PrimitiveType::Integer)]);
    let c = tuple!(env, [primitive!(env, PrimitiveType::String)]);

    // Test that tuple types satisfy lattice laws (associativity, commutativity, absorption)
    assert_lattice_laws(&env, a, b, c);
}

#[test]
fn is_concrete() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Concrete tuple (with all concrete fields)
    let number = primitive!(env, PrimitiveType::Number);
    let string = primitive!(env, PrimitiveType::String);
    tuple!(env, concrete_tuple, [number, string]);
    assert!(concrete_tuple.is_concrete(&mut analysis_env));

    // Non-concrete tuple (with at least one non-concrete field)
    let infer_var = instantiate_infer(&env, 0_u32);
    tuple!(env, non_concrete_tuple, [number, infer_var]);
    assert!(!non_concrete_tuple.is_concrete(&mut analysis_env));

    // Empty tuple should be concrete
    tuple!(env, empty_tuple, []);
    assert!(empty_tuple.is_concrete(&mut analysis_env));
}

#[test]
fn simplify_tuple_with_never() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create a tuple with a Never field
    tuple!(
        env,
        never_tuple,
        [
            primitive!(env, PrimitiveType::Number),
            instantiate(&env, TypeKind::Never),
            primitive!(env, PrimitiveType::String)
        ]
    );

    let mut simplify_env = SimplifyEnvironment::new(&env);

    // Simplifying a tuple with a Never field should result in Never
    let result = never_tuple.simplify(&mut simplify_env);

    // The result should be a Never type
    let result_type = env.r#type(result);
    assert!(
        matches!(result_type.kind, TypeKind::Never),
        "Expected Never, got {:?}",
        result_type.kind
    );
}

#[test]
fn nested_tuples() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create a nested tuple
    tuple!(env, inner, [primitive!(env, PrimitiveType::Number)]);
    tuple!(
        env,
        outer,
        [inner.id, primitive!(env, PrimitiveType::String)]
    );

    // Create another nested tuple with subtype relationship
    tuple!(env, inner2, [primitive!(env, PrimitiveType::Integer)]);
    tuple!(
        env,
        outer2,
        [inner2.id, primitive!(env, PrimitiveType::String)]
    );

    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Test subtyping: since Integer <: Number,
    // (Integer) <: (Number) and ((Integer), String) <: ((Number), String)
    assert!(inner2.is_subtype_of(inner, &mut analysis_env));
    assert!(outer2.is_subtype_of(outer, &mut analysis_env));
}

#[test]
fn simplify_with_and_without_flag() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create tuples for testing
    let a = tuple!(env, [primitive!(env, PrimitiveType::Number)]);
    let b = tuple!(env, [primitive!(env, PrimitiveType::String)]);

    // Create environment with simplification enabled (default)
    let mut env_with_simplify = LatticeEnvironment::new(&env);

    // Create environment with simplification disabled
    let mut env_without_simplify = LatticeEnvironment::new(&env);
    env_without_simplify.without_simplify();

    // Meet the tuples (should produce different results with and without simplification)
    let result_with_simplify = env_with_simplify.meet(a, b);
    let result_without_simplify = env_without_simplify.meet(a, b);

    assert_equiv!(
        env,
        [result_without_simplify],
        [tuple![
            env,
            [intersection!(
                env,
                [
                    primitive!(env, PrimitiveType::Number),
                    primitive!(env, PrimitiveType::String)
                ]
            )]
        ]]
    );

    assert_equiv!(
        env,
        [result_with_simplify],
        [tuple![env, [instantiate(&env, TypeKind::Never)]]]
    );
}

#[test]
fn tuple_with_disjoint_field_types() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let number = primitive!(env, PrimitiveType::Number);
    let string = primitive!(env, PrimitiveType::String);

    // Create a tuple with the intersection type
    tuple!(
        env,
        tuple_with_intersection,
        [intersection!(env, [number, string])]
    );

    let mut simplify_env = SimplifyEnvironment::new(&env);

    // Simplifying this tuple should result in Never because the field type is Never
    let result = tuple_with_intersection.simplify(&mut simplify_env);

    // The result should be a Never type
    let result_type = env.r#type(result);
    assert!(
        matches!(result_type.kind, TypeKind::Never),
        "Expected Never, got {:?}",
        result_type.kind
    );
}

#[test]
fn distribute_union_empty_tuple() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Create an empty tuple
    tuple!(env, empty_tuple, []);

    // Distribution should just return the original tuple since it's empty
    let result = empty_tuple.distribute_union(&mut analysis_env);
    assert_equiv!(env, result, [empty_tuple.id]);
}

#[test]
fn distribute_union_single_field() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Create primitive types
    let number = primitive!(env, PrimitiveType::Number);
    let string = primitive!(env, PrimitiveType::String);
    let boolean = primitive!(env, PrimitiveType::Boolean);

    // Create a union type
    let union_type = union!(env, [string, boolean]);

    // Create a tuple with a union field
    tuple!(env, tuple_with_union, [number, union_type]);

    // Distribute the union across the tuple
    let result = tuple_with_union.distribute_union(&mut analysis_env);

    // Should result in two tuples: (number, string) and (number, boolean)
    assert_equiv!(
        env,
        result,
        [
            tuple!(env, [number, string]),
            tuple!(env, [number, boolean])
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

    // Create a tuple with multiple union fields
    tuple!(env, tuple_with_unions, [union_type1, union_type2]);

    // Distribute the unions across the tuple
    let result = tuple_with_unions.distribute_union(&mut analysis_env);

    // Should result in four tuples: all combinations of the union fields
    assert_equiv!(
        env,
        result,
        [
            tuple!(env, [number, string]),
            tuple!(env, [integer, string]),
            tuple!(env, [number, boolean]),
            tuple!(env, [integer, boolean])
        ]
    );
}

#[test]
fn distribute_union_nested_tuples() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Create primitive types
    let number = primitive!(env, PrimitiveType::Number);
    let string = primitive!(env, PrimitiveType::String);
    let boolean = primitive!(env, PrimitiveType::Boolean);

    // Create a union type
    let union_type = union!(env, [string, boolean]);

    // Create an inner tuple with a union field
    tuple!(env, inner_tuple, [number, union_type]);

    // Create an outer tuple containing the inner tuple
    tuple!(env, outer_tuple, [inner_tuple.id]);

    // Distribute the unions across both tuples
    let result = outer_tuple.distribute_union(&mut analysis_env);

    // Should result in two tuples: (number, string) and (number, boolean)
    // wrapped in outer tuples
    assert_equiv!(
        env,
        result,
        [
            tuple!(env, [tuple!(env, [number, string])]),
            tuple!(env, [tuple!(env, [number, boolean])])
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

    // Create a tuple with an intersection field
    let intersect_type = intersection!(env, [number, string]);
    tuple!(env, tuple_with_intersection, [intersect_type]);

    let result = tuple_with_intersection.distribute_intersection(&mut analysis_env);

    assert_equiv!(
        env,
        result,
        [
            tuple!(env, [primitive!(env, PrimitiveType::Number)]),
            tuple!(env, [primitive!(env, PrimitiveType::String)])
        ]
    );
}

#[test]
fn collect_constraints_lower_bound() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create a tuple type with an element containing a concrete type
    let number = primitive!(env, PrimitiveType::Number);
    tuple!(env, concrete_tuple, [number]);

    // Create a tuple with an inference variable
    let hole = HoleId::new(0);
    let infer_var = instantiate_infer(&env, hole);
    tuple!(env, infer_tuple, [infer_var]);

    // Create an inference environment to collect constraints
    let mut inference_env = InferenceEnvironment::new(&env);

    // Collect constraints between the two tuple types
    concrete_tuple.collect_constraints(infer_tuple, &mut inference_env);

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
fn collect_constraints_different_length_tuples() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Note: Tuples are actually width invariant in the type system,
    // but during constraint collection we check common elements to provide better error
    // messages. This test verifies that constraint collection works on the common
    // prefix of tuples with different lengths.

    // Create a tuple with more elements
    let hole = HoleId::new(0);
    let infer_var = instantiate_infer(&env, hole);
    let boolean = primitive!(env, PrimitiveType::Boolean);
    let string = primitive!(env, PrimitiveType::String);
    tuple!(env, longer_tuple, [string, infer_var, boolean]);

    // Create a tuple with fewer elements
    let number = primitive!(env, PrimitiveType::Number);
    tuple!(env, shorter_tuple, [string, number]);

    // Create an inference environment to collect constraints
    let mut inference_env = InferenceEnvironment::new(&env);

    // Collect constraints between the two tuple types
    longer_tuple.collect_constraints(shorter_tuple, &mut inference_env);

    // Should only have constraints for the common elements
    // We expect one constraint: infer_var <: Number
    let constraints = inference_env.take_constraints();
    assert_eq!(
        constraints,
        [Constraint::UpperBound {
            variable: Variable::synthetic(VariableKind::Hole(hole)),
            bound: number
        }]
    );

    // No constraints should be generated for the "extra" element
}

#[test]
fn collect_constraints_missing_element() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create a shorter tuple with one element
    let string = primitive!(env, PrimitiveType::String);
    tuple!(env, shorter_tuple, [string]);

    // Create a longer tuple with two elements
    let hole = HoleId::new(0);
    let infer_var = instantiate_infer(&env, hole);
    tuple!(env, longer_tuple, [string, infer_var]);

    let mut inference_env = InferenceEnvironment::new(&env);

    // Note: Tuples are width invariant in the type system, but during constraint collection
    // we just collect what we can and leave the width check to is_subtype_of
    shorter_tuple.collect_constraints(longer_tuple, &mut inference_env);

    // This should not generate constraints since the element at index 1 is missing in the first
    // tuple During constraint collection this is ignored, and the error would be
    // reported in is_subtype_of instead
    assert!(inference_env.take_constraints().is_empty());
}

#[test]
fn collect_constraints_nested() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create a nested tuple with inference variable
    let hole = HoleId::new(0);
    let infer_var = instantiate_infer(&env, hole);

    // First tuple with nested inference variable
    let inner_tuple_a = tuple!(env, [infer_var]);
    tuple!(env, tuple_a, [inner_tuple_a]);

    let number = primitive!(env, PrimitiveType::Number);

    // Second tuple with nested concrete type
    let inner_tuple_b = tuple!(env, [number]);
    tuple!(env, tuple_b, [inner_tuple_b]);

    let mut inference_env = InferenceEnvironment::new(&env);

    tuple_a.collect_constraints(tuple_b, &mut inference_env);

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

    // Create tuples with generic parameters
    let tuple_a = generic!(
        env,
        tuple!(env, [param1]),
        [GenericArgument {
            id: arg1,
            name: heap.intern_symbol("T"),
            constraint: None
        }]
    );

    let tuple_b = generic!(
        env,
        tuple!(env, [param2]),
        [GenericArgument {
            id: arg2,
            name: heap.intern_symbol("U"),
            constraint: None
        }]
    );

    // Create an inference environment to collect constraints
    let mut inference_env = InferenceEnvironment::new(&env);

    // Collect constraints between the generic tuples
    inference_env.collect_constraints(Variance::Covariant, tuple_a, tuple_b);

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

    // Create tuples with a covariant relationship in the element types
    // Integer is a subtype of Number in this type system
    tuple!(env, integer_tuple, [integer]);
    tuple!(env, number_tuple, [number]);

    let mut inference_env = InferenceEnvironment::new(&env);

    // In a non-constraint-collection scenario, we would expect:
    // (Integer,) <: (Number,)
    // but during constraint collection, no explicit constraints are added
    // since there are no inference variables
    integer_tuple.collect_constraints(number_tuple, &mut inference_env);

    // No constraints should have been generated since both types are concrete
    // and constraints are only generated for inference variables
    assert!(inference_env.take_constraints().is_empty());
}

#[test]
fn collect_dependencies() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create inference variables for multiple elements
    let hole1 = HoleId::new(0);
    let infer_var1 = instantiate_infer(&env, hole1);
    let hole2 = HoleId::new(1);
    let infer_var2 = instantiate_infer(&env, hole2);

    // Create a tuple with multiple inference variables: (_0, _1)
    tuple!(env, tuple_type, [infer_var1, infer_var2]);

    let mut inference_env = InferenceEnvironment::new(&env);

    // Create a variable to use as the target in a structural edge
    let variable = Variable::synthetic(VariableKind::Hole(HoleId::new(2)));

    // Collect structural edges
    inference_env.collect_dependencies(tuple_type.id, variable);

    // Tuple elements are covariant, so both inference variables should flow to the target
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
fn simplify_recursive_tuple() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let r#type = env.types.intern(|id| PartialType {
        span: SpanId::SYNTHETIC,
        kind: env.intern_kind(TypeKind::Tuple(TupleType {
            fields: env.intern_type_ids(&[id.value()]),
        })),
    });

    let mut simplify = SimplifyEnvironment::new(&env);
    let type_id = simplify.simplify(r#type.id);

    let r#type = env.r#type(type_id);

    assert_matches!(
        r#type.kind,
        TypeKind::Tuple(TupleType { fields }) if fields.len() == 1
            && fields[0] == type_id
    );
}

#[test]
fn instantiate_tuple() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let argument = env.counter.generic_argument.next();

    let value = generic!(
        env,
        tuple!(env, [instantiate_param(&env, argument)]),
        [GenericArgument {
            id: argument,
            name: env.heap.intern_symbol("T"),
            constraint: None
        }]
    );

    let mut instantiate = InstantiateEnvironment::new(&env);
    let type_id = instantiate.instantiate(value);

    let generic = env
        .r#type(type_id)
        .kind
        .generic()
        .expect("should be generic");
    assert_eq!(generic.arguments.len(), 1);

    let r#type = env
        .r#type(generic.base)
        .kind
        .tuple()
        .expect("should be tuple");

    assert_eq!(r#type.fields.len(), 1);
    let field = env.r#type(r#type.fields[0]);
    let param = field.kind.param().expect("should be param");

    assert_eq!(param.argument, generic.arguments[0].id);
    assert_ne!(param.argument, argument);
}

#[test]
fn projection() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let string = primitive!(env, PrimitiveType::String);

    let value = tuple!(env, [string]);

    let mut lattice = LatticeEnvironment::new(&env);
    let projection = lattice.projection(value, Ident::synthetic(heap.intern_symbol("0")));

    assert_eq!(projection, Projection::Resolved(string));
}

#[test]
fn projection_out_of_bounds() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let string = primitive!(env, PrimitiveType::String);

    let value = tuple!(env, [string]);

    let mut lattice = LatticeEnvironment::new(&env);
    let projection = lattice.projection(value, Ident::synthetic(heap.intern_symbol("1")));
    assert_eq!(projection, Projection::Error);

    let diagnostics = lattice.take_diagnostics().into_vec();
    assert_eq!(diagnostics.len(), 1);
    assert_eq!(
        diagnostics[0].category,
        TypeCheckDiagnosticCategory::TupleIndexOutOfBounds
    );
}

#[test]
fn projection_not_a_number() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let string = primitive!(env, PrimitiveType::String);

    let value = tuple!(env, [string]);

    let mut lattice = LatticeEnvironment::new(&env);
    let projection = lattice.projection(value, Ident::synthetic(heap.intern_symbol("a")));
    assert_eq!(projection, Projection::Error);

    let diagnostics = lattice.take_diagnostics().into_vec();
    assert_eq!(diagnostics.len(), 1);
    assert_eq!(
        diagnostics[0].category,
        TypeCheckDiagnosticCategory::InvalidTupleIndex
    );
}

#[test]
fn subscript() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let mut lattice = LatticeEnvironment::new(&env);
    let mut inference = InferenceEnvironment::new(&env);

    let result = lattice.subscript(
        tuple!(env, [primitive!(env, PrimitiveType::String)]),
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

#[test]
fn meet_recursive_tuple() {
    scaffold!(heap, env, builder, [lattice: lattice]);

    let lhs = builder.tuple(lazy(|this, builder| [builder.integer(), this.value()]));
    let rhs = builder.tuple(lazy(|this, builder| [builder.number(), this.value()]));

    assert_meet(&mut lattice, lhs, rhs, &[lhs]);
    assert_meet(&mut lattice, rhs, lhs, &[lhs]);
}

#[test]
fn meet_recursive_tuple_unrelated() {
    scaffold!(heap, env, builder, [lattice: lattice]);

    let lhs = builder.tuple(lazy(|this, builder| [builder.integer(), this.value()]));
    let rhs = builder.tuple(lazy(|this, builder| [builder.string(), this.value()]));

    let never = builder.never();

    assert_meet(&mut lattice, lhs, rhs, &[never]);
    assert_meet(&mut lattice, rhs, lhs, &[never]);
}

#[test]
fn join_recursive_tuple() {
    scaffold!(heap, env, builder, [lattice: lattice]);

    let lhs = builder.tuple(lazy(|this, builder| [builder.integer(), this.value()]));
    let rhs = builder.tuple(lazy(|this, builder| [builder.number(), this.value()]));

    assert_join(&mut lattice, lhs, rhs, &[rhs]);
    assert_join(&mut lattice, rhs, lhs, &[rhs]);
}

#[test]
fn join_recursive_tuple_unrelated() {
    scaffold!(heap, env, builder, [lattice: lattice]);

    let lhs = builder.tuple(lazy(|this, builder| [builder.integer(), this.value()]));
    let rhs = builder.tuple(lazy(|this, builder| [builder.string(), this.value()]));

    // The type itself is a bit larger than one might like (this is of the recursive property of
    // the match), but the type approximation is still valid, as proven below and is actually
    // *smaller* than the naive approximation.
    let union = builder.union([builder.integer(), builder.string()]);
    let expected = builder.tuple([union, builder.tuple([union, builder.union([lhs, rhs])])]);

    assert_join(&mut lattice, lhs, rhs, &[expected]);
    assert_join(&mut lattice, rhs, lhs, &[expected]);

    assert_is_subtype(&env, lhs, expected);
    assert_is_subtype(&env, rhs, expected);
}
