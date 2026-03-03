use core::assert_matches;

use hashql_diagnostics::Success;

use crate::{
    heap::Heap,
    span::SpanId,
    symbol::Ident,
    r#type::{
        PartialType,
        environment::{
            AnalysisEnvironment, Environment, InferenceEnvironment, LatticeEnvironment,
            SimplifyEnvironment, instantiate::InstantiateEnvironment,
        },
        error::TypeCheckDiagnosticCategory,
        inference::{Constraint, Inference as _, Variable, VariableKind},
        kind::{
            Generic, IntrinsicType, OpaqueType, Param, TypeKind,
            generic::GenericArgument,
            infer::HoleId,
            intersection::IntersectionType,
            intrinsic::{DictType, ListType},
            primitive::PrimitiveType,
            test::{assert_equiv, dict, generic, intersection, list, opaque, primitive, union},
            union::UnionType,
        },
        lattice::{Lattice as _, test::assert_lattice_laws},
        tests::{instantiate, instantiate_infer, instantiate_param},
    },
};

#[test]
fn join_lists_same_element_type() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create two list types with the same element type
    list!(env, list_a, primitive!(env, PrimitiveType::Number));
    list!(env, list_b, primitive!(env, PrimitiveType::Number));

    let mut lattice_env = LatticeEnvironment::new(&env);

    // Joining two lists with the same element type should return one of them
    assert_equiv!(env, list_a.join(list_b, &mut lattice_env), [list_a.id]);
}

#[test]
fn join_lists_different_element_types() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create two list types with different element types
    list!(env, list_a, primitive!(env, PrimitiveType::Number));
    list!(env, list_b, primitive!(env, PrimitiveType::String));

    let mut lattice_env = LatticeEnvironment::new(&env);

    // Joining two lists with different element types should return a list with the joined
    // element types
    assert_equiv!(
        env,
        list_a.join(list_b, &mut lattice_env),
        [list!(
            env,
            union!(
                env,
                [
                    primitive!(env, PrimitiveType::Number),
                    primitive!(env, PrimitiveType::String)
                ]
            )
        )]
    );
}

#[test]
fn meet_lists_same_element_type() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create two list types with the same element type
    list!(env, list_a, primitive!(env, PrimitiveType::Number));
    list!(env, list_b, primitive!(env, PrimitiveType::Number));

    let mut lattice_env = LatticeEnvironment::new(&env);

    // Meeting two lists with the same element type should return one of them
    assert_equiv!(env, list_a.meet(list_b, &mut lattice_env), [list_a.id]);
}

#[test]
fn meet_lists_different_element_types() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create two list types with different element types
    list!(env, list_a, primitive!(env, PrimitiveType::Number));
    list!(env, list_b, primitive!(env, PrimitiveType::Integer));

    let mut lattice_env = LatticeEnvironment::new(&env);

    // Meeting List<Number> and List<Integer> should give List<Integer> (since Integer <:
    // Number)
    assert_equiv!(env, list_a.meet(list_b, &mut lattice_env), [list_b.id]);

    // Meeting with incompatible types should give empty
    list!(env, list_c, primitive!(env, PrimitiveType::String));

    assert_equiv!(
        env,
        list_a.meet(list_c, &mut lattice_env),
        [list!(env, instantiate(&env, TypeKind::Never))]
    );
}

#[test]
fn is_subtype_of_list() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create two list types where one element is a subtype of the other
    list!(env, list_number, primitive!(env, PrimitiveType::Number));
    list!(env, list_integer, primitive!(env, PrimitiveType::Integer));

    let mut analysis_env = AnalysisEnvironment::new(&env);

    // List<Integer> should be a subtype of List<Number> (covariance)
    assert!(list_integer.is_subtype_of(list_number, &mut analysis_env));

    // List<Number> should not be a subtype of List<Integer>
    assert!(!list_number.is_subtype_of(list_integer, &mut analysis_env));
}

#[test]
fn is_equivalent_list() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create two list types with equivalent element types
    list!(env, list_a, primitive!(env, PrimitiveType::Number));
    list!(env, list_b, primitive!(env, PrimitiveType::Number));

    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Lists with equivalent element types should be equivalent
    assert!(list_a.is_equivalent(list_b, &mut analysis_env));

    // Lists with different element types should not be equivalent
    list!(env, list_c, primitive!(env, PrimitiveType::String));

    assert!(!list_a.is_equivalent(list_c, &mut analysis_env));
}

#[test]
fn simplify_list() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create a list with a union element that contains duplicates
    list!(
        env,
        list_with_duplicate_union,
        union!(
            env,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::Number)
            ]
        )
    );

    let mut simplify_env = SimplifyEnvironment::new(&env);

    // Simplifying should remove duplicates in the element type
    assert_equiv!(
        env,
        [list_with_duplicate_union.simplify(&mut simplify_env)],
        [list!(env, primitive!(env, PrimitiveType::Number))]
    );
}

#[test]
fn list_concrete_check() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let mut analysis_env = AnalysisEnvironment::new(&env);

    // A list with a concrete element type should be concrete
    list!(env, concrete_list, primitive!(env, PrimitiveType::Number));

    assert!(concrete_list.is_concrete(&mut analysis_env));

    // A list with a non-concrete element type should not be concrete
    list!(env, non_concrete_list, instantiate_infer(&env, 0_u32));

    assert!(!non_concrete_list.is_concrete(&mut analysis_env));
}

#[test]
fn join_dicts_same_key_type() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create two dict types with the same key type but different value types
    dict!(
        env,
        dict_a,
        primitive!(env, PrimitiveType::String),
        primitive!(env, PrimitiveType::Number)
    );

    dict!(
        env,
        dict_b,
        primitive!(env, PrimitiveType::String),
        primitive!(env, PrimitiveType::Boolean)
    );

    let mut lattice_env = LatticeEnvironment::new(&env);

    // Joining two dicts with the same key type should return a dict with the joined value types
    assert_equiv!(
        env,
        dict_a.join(dict_b, &mut lattice_env),
        [dict!(
            env,
            primitive!(env, PrimitiveType::String),
            union!(
                env,
                [
                    primitive!(env, PrimitiveType::Number),
                    primitive!(env, PrimitiveType::Boolean)
                ]
            )
        )]
    );
}

#[test]
fn join_dicts_different_key_types() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create two dict types with different key types
    dict!(
        env,
        dict_a,
        primitive!(env, PrimitiveType::String),
        primitive!(env, PrimitiveType::Number)
    );
    dict!(
        env,
        dict_b,
        primitive!(env, PrimitiveType::Number),
        primitive!(env, PrimitiveType::Boolean)
    );

    let mut lattice_env = LatticeEnvironment::new(&env);

    // Joining two dicts with different key types should return both dicts in a union
    assert_equiv!(
        env,
        dict_a.join(dict_b, &mut lattice_env),
        [
            dict!(
                env,
                primitive!(env, PrimitiveType::String),
                primitive!(env, PrimitiveType::Number)
            ),
            dict!(
                env,
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::Boolean)
            )
        ]
    );
}

#[test]
fn meet_dicts_same_key_type() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create two dict types with the same key type but different value types
    // Integer <: Number
    dict!(
        env,
        dict_a,
        primitive!(env, PrimitiveType::String),
        primitive!(env, PrimitiveType::Number)
    );
    dict!(
        env,
        dict_b,
        primitive!(env, PrimitiveType::String),
        primitive!(env, PrimitiveType::Integer)
    );

    let mut lattice_env = LatticeEnvironment::new(&env);

    // Meeting Dict<String, Number> and Dict<String, Integer> should give Dict<String, Integer>
    assert_equiv!(env, dict_a.meet(dict_b, &mut lattice_env), [dict_b.id]);
}

#[test]
fn meet_dicts_different_key_types() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create two dict types with different key types
    dict!(
        env,
        dict_a,
        primitive!(env, PrimitiveType::String),
        primitive!(env, PrimitiveType::Number)
    );
    dict!(
        env,
        dict_b,
        primitive!(env, PrimitiveType::Boolean),
        primitive!(env, PrimitiveType::Number)
    );

    let mut lattice_env = LatticeEnvironment::new(&env);

    // Meeting two dicts with different key types should return empty (Never)
    assert_equiv!(env, dict_a.meet(dict_b, &mut lattice_env), []);
}

#[test]
fn is_subtype_of_dict() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create dicts to test invariance of keys and covariance of values
    // Integer <: Number
    dict!(
        env,
        dict_string_number,
        primitive!(env, PrimitiveType::String),
        primitive!(env, PrimitiveType::Number)
    );
    dict!(
        env,
        dict_string_integer,
        primitive!(env, PrimitiveType::String),
        primitive!(env, PrimitiveType::Integer)
    );

    // Same value type, different key type
    dict!(
        env,
        integer_key_number_value,
        primitive!(env, PrimitiveType::Integer),
        primitive!(env, PrimitiveType::Number)
    );

    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Dict<String, Integer> should be a subtype of Dict<String, Number> (covariant values)
    assert!(dict_string_integer.is_subtype_of(dict_string_number, &mut analysis_env));

    // Dict<String, Number> should not be a subtype of Dict<String, Integer>
    assert!(!dict_string_number.is_subtype_of(dict_string_integer, &mut analysis_env));

    // Dict<Integer, Number> should not be a subtype of Dict<String, Number> (invariant keys)
    assert!(!integer_key_number_value.is_subtype_of(dict_string_number, &mut analysis_env));
}

#[test]
fn is_equivalent_dict() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create dicts with equivalent types
    dict!(
        env,
        dict_a,
        primitive!(env, PrimitiveType::String),
        primitive!(env, PrimitiveType::Number)
    );
    dict!(
        env,
        dict_b,
        primitive!(env, PrimitiveType::String),
        primitive!(env, PrimitiveType::Number)
    );

    // Different key type
    dict!(
        env,
        dict_c,
        primitive!(env, PrimitiveType::Boolean),
        primitive!(env, PrimitiveType::Number)
    );

    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Dicts with equivalent key and value types should be equivalent
    assert!(dict_a.is_equivalent(dict_b, &mut analysis_env));

    // Dicts with different key types should not be equivalent
    assert!(!dict_a.is_equivalent(dict_c, &mut analysis_env));
}

#[test]
fn simplify_dict() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create a dict with union types that contain duplicates
    dict!(
        env,
        dict_with_duplicates,
        union!(
            env,
            [
                primitive!(env, PrimitiveType::String),
                primitive!(env, PrimitiveType::String)
            ]
        ),
        union!(
            env,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::Number)
            ]
        )
    );

    let mut simplify_env = SimplifyEnvironment::new(&env);

    // Simplifying should remove duplicates in both key and value types
    assert_equiv!(
        env,
        [dict_with_duplicates.simplify(&mut simplify_env)],
        [dict!(
            env,
            primitive!(env, PrimitiveType::String),
            primitive!(env, PrimitiveType::Number)
        )]
    );
}

#[test]
fn dict_concrete_check() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let mut analysis_env = AnalysisEnvironment::new(&env);

    // A dict with concrete key and value types should be concrete
    dict!(
        env,
        concrete_dict,
        primitive!(env, PrimitiveType::String),
        primitive!(env, PrimitiveType::Number)
    );
    assert!(concrete_dict.is_concrete(&mut analysis_env));

    // A dict with a non-concrete key type should not be concrete
    dict!(
        env,
        non_concrete_key_dict,
        instantiate_infer(&env, 0_u32),
        primitive!(env, PrimitiveType::Number)
    );
    assert!(!non_concrete_key_dict.is_concrete(&mut analysis_env));

    // A dict with a non-concrete value type should not be concrete
    dict!(
        env,
        non_concrete_value_dict,
        primitive!(env, PrimitiveType::String),
        instantiate_infer(&env, 0_u32)
    );
    assert!(!non_concrete_value_dict.is_concrete(&mut analysis_env));
}

#[test]
fn join_different_intrinsic_types() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create a list and a dict
    let list = list!(env, primitive!(env, PrimitiveType::String));
    let dict = dict!(
        env,
        primitive!(env, PrimitiveType::String),
        primitive!(env, PrimitiveType::Number)
    );

    let mut lattice_env = LatticeEnvironment::new(&env);

    // Joining a list and a dict should give a union of both
    assert_equiv!(
        env,
        env.r#type(list).join(env.r#type(dict), &mut lattice_env),
        [list, dict]
    );
}

#[test]
fn meet_different_intrinsic_types() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create a list and a dict
    let list = list!(env, primitive!(env, PrimitiveType::String));
    let dict = dict!(
        env,
        primitive!(env, PrimitiveType::String),
        primitive!(env, PrimitiveType::Number)
    );

    let mut lattice_env = LatticeEnvironment::new(&env);

    // Meeting a list and a dict should give Never (empty)
    let met = env.r#type(list).meet(env.r#type(dict), &mut lattice_env);
    assert!(met.is_empty());
}

#[test]
fn lattice_laws_for_intrinsics() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create three distinct list types
    let number_type = primitive!(env, PrimitiveType::Number);
    let string_type = primitive!(env, PrimitiveType::String);
    let boolean_type = primitive!(env, PrimitiveType::Boolean);

    let list_a = list!(env, number_type);
    let list_b = list!(env, string_type);
    let list_c = list!(env, boolean_type);

    // Verify lattice laws for lists
    assert_lattice_laws(&env, list_a, list_b, list_c);

    // Create three distinct dict types
    let dict_a = dict!(env, number_type, string_type);
    let dict_b = dict!(env, number_type, boolean_type);
    let dict_c = dict!(env, string_type, boolean_type);

    // Verify lattice laws for dicts
    assert_lattice_laws(&env, dict_a, dict_b, dict_c);
}

#[test]
fn dict_inference_with_non_concrete_keys() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create a dict with an inference variable as key
    let infer_var = instantiate_infer(&env, 0_u32);
    let number_type = primitive!(env, PrimitiveType::Number);
    let string_type = primitive!(env, PrimitiveType::String);

    let dict_a = dict!(env, infer_var, number_type);
    let dict_b = dict!(env, string_type, number_type);

    let mut lattice_env = LatticeEnvironment::new(&env);
    lattice_env.set_inference_enabled(true);

    // During inference, joining dicts with non-concrete keys should work using the carrier
    // pattern
    let joined = env
        .r#type(dict_a)
        .join(env.r#type(dict_b), &mut lattice_env);
    assert!(!joined.is_empty());

    // Meeting should also work with the carrier pattern
    let met = env
        .r#type(dict_a)
        .meet(env.r#type(dict_b), &mut lattice_env);
    assert!(!met.is_empty());

    // When inference is disabled, the behavior should be different
    lattice_env.set_inference_enabled(false);

    let joined_no_inference = env
        .r#type(dict_a)
        .join(env.r#type(dict_b), &mut lattice_env);
    assert_equiv!(env, joined_no_inference, [dict_a, dict_b]);

    let met_no_inference = env
        .r#type(dict_a)
        .meet(env.r#type(dict_b), &mut lattice_env);
    assert!(met_no_inference.is_empty());
}

#[test]
fn list_distribute_union() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Create primitive types
    let number = primitive!(env, PrimitiveType::Number);
    let string = primitive!(env, PrimitiveType::String);
    let boolean = primitive!(env, PrimitiveType::Boolean);

    // Create a list with a normal element type
    list!(env, list_normal, number);

    // Should return the original list since there's no union to distribute
    assert_equiv!(
        env,
        list_normal.distribute_union(&mut analysis_env),
        [list_normal.id]
    );

    // Create a list with a union element type
    let union_type = union!(env, [string, boolean]);
    list!(env, list_with_union, union_type);

    // Should result in two separate lists, one for each variant in the union
    assert_equiv!(
        env,
        list_with_union.distribute_union(&mut analysis_env),
        [list!(env, string), list!(env, boolean)]
    );
}

#[test]
fn list_distribute_intersection() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Create a list with an intersection element type
    let number = primitive!(env, PrimitiveType::Number);
    let string = primitive!(env, PrimitiveType::String);
    let intersection_type = intersection!(env, [number, string]);

    list!(env, list_with_intersection, intersection_type);

    assert_equiv!(
        env,
        list_with_intersection.distribute_intersection(&mut analysis_env),
        [list!(env, number), list!(env, string)]
    );
}

#[test]
fn dict_distribute_union() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Create primitive types
    let number = primitive!(env, PrimitiveType::Number);
    let string = primitive!(env, PrimitiveType::String);
    let boolean = primitive!(env, PrimitiveType::Boolean);

    // Create a dict with a normal value type
    dict!(env, dict_normal, string, number);

    // Should return the original dict since there's no union to distribute
    assert_equiv!(
        env,
        dict_normal.distribute_union(&mut analysis_env),
        [dict_normal.id]
    );

    // Create a dict with a union value type
    let union_type = union!(env, [number, boolean]);
    dict!(env, dict_with_union, string, union_type);

    // Should result in two separate dicts, one for each variant in the value union
    assert_equiv!(
        env,
        dict_with_union.distribute_union(&mut analysis_env),
        [dict!(env, string, number), dict!(env, string, boolean)]
    );

    // Create a dict with a union key type
    let key_union = union!(env, [string, number]);
    dict!(env, dict_with_union_key, key_union, boolean);

    // Distribute the union on the key - this should NOT distribute since keys are invariant
    // Should return the original dict, as Dict<K, V> only distributes unions in its value type
    assert_equiv!(
        env,
        dict_with_union_key.distribute_union(&mut analysis_env),
        [dict_with_union_key.id]
    );
}

#[test]
fn dict_distribute_intersection() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Create a dict with an intersection value type
    let number = primitive!(env, PrimitiveType::Number);
    let string = primitive!(env, PrimitiveType::String);
    let intersection_type = intersection!(env, [number, string]);

    dict!(env, dict_with_intersection, string, intersection_type);

    // Distribute the intersection
    // Should return the original dict (no distribution necessary)
    assert_equiv!(
        env,
        dict_with_intersection.distribute_intersection(&mut analysis_env),
        [dict!(env, string, number), dict!(env, string, string)]
    );
}

#[test]
fn intrinsic_type_distribute_delegation() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Create primitive types
    let number = primitive!(env, PrimitiveType::Number);
    let string = primitive!(env, PrimitiveType::String);
    let boolean = primitive!(env, PrimitiveType::Boolean);

    // Create union types
    let union_type = union!(env, [number, boolean]);

    // Test that IntrinsicType::List correctly delegates to ListType
    list!(env, list_with_union, union_type);

    // Distribute the union
    // Should result in two separate lists
    assert_equiv!(
        env,
        list_with_union.distribute_union(&mut analysis_env),
        [list!(env, number), list!(env, boolean)]
    );

    // Test that IntrinsicType::Dict correctly delegates to DictType
    dict!(env, dict_with_union, string, union_type);

    // Distribute the union
    // Should result in two separate dicts
    assert_equiv!(
        env,
        dict_with_union.distribute_union(&mut analysis_env),
        [dict!(env, string, number), dict!(env, string, boolean)]
    );
}

#[test]
fn collect_constraints_list_lower_bound() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create a list with a concrete type
    let number = primitive!(env, PrimitiveType::Number);
    list!(env, concrete_list, number);

    // Create a list with an inference variable
    let hole = HoleId::new(0);
    let infer_var = instantiate_infer(&env, hole);
    list!(env, infer_list, infer_var);

    // Create an inference environment to collect constraints
    let mut inference_env = InferenceEnvironment::new(&env);

    // List is covariant in its element type, so the element type of the subtype
    // must be a subtype of the element type of the supertype
    concrete_list.collect_constraints(infer_list, &mut inference_env);

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
fn collect_constraints_list_upper_bound() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create a list with a concrete type
    let number = primitive!(env, PrimitiveType::Number);
    list!(env, concrete_list, number);

    // Create a list with an inference variable
    let hole = HoleId::new(0);
    let infer_var = instantiate_infer(&env, hole);
    list!(env, infer_list, infer_var);

    // Create an inference environment to collect constraints
    let mut inference_env = InferenceEnvironment::new(&env);

    // Collect constraints in the other direction
    infer_list.collect_constraints(concrete_list, &mut inference_env);

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
fn collect_constraints_nested_list() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create a nested list with inference variable
    let hole = HoleId::new(0);
    let infer_var = instantiate_infer(&env, hole);
    let inner_list_a = list!(env, infer_var);
    list!(env, list_a, inner_list_a);

    // Create a nested list with concrete type
    let number = primitive!(env, PrimitiveType::Number);
    let inner_list_b = list!(env, number);
    list!(env, list_b, inner_list_b);

    let mut inference_env = InferenceEnvironment::new(&env);

    // Collect constraints between nested lists
    list_a.collect_constraints(list_b, &mut inference_env);

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
fn collect_constraints_dict_key_invariant() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create a dict with a concrete key and an inference variable as value
    let string = primitive!(env, PrimitiveType::String);
    let hole = HoleId::new(0);
    let infer_var = instantiate_infer(&env, hole);
    dict!(env, dict_a, string, infer_var);

    // Create a dict with a concrete key and concrete value
    let number = primitive!(env, PrimitiveType::Number);
    dict!(env, dict_b, string, number);

    let mut inference_env = InferenceEnvironment::new(&env);

    // Collect constraints between the two dictionary types
    dict_a.collect_constraints(dict_b, &mut inference_env);

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
fn collect_constraints_dict_key_variable() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create a dict with an inference variable as key
    let hole = HoleId::new(0);
    let infer_key = instantiate_infer(&env, hole);
    let number = primitive!(env, PrimitiveType::Number);
    dict!(env, dict_a, infer_key, number);

    // Create a dict with a concrete key
    let string = primitive!(env, PrimitiveType::String);
    dict!(env, dict_b, string, number);

    let mut inference_env = InferenceEnvironment::new(&env);

    // Collect constraints between the two dictionary types
    dict_a.collect_constraints(dict_b, &mut inference_env);

    let constraints = inference_env.take_constraints();
    assert_eq!(
        constraints,
        [Constraint::Equals {
            variable: Variable::synthetic(VariableKind::Hole(hole)),
            r#type: string
        }]
    );
}

#[test]
fn collect_constraints_dict_bidirectional() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create a dict with inference variables for both key and value
    let hole_key = HoleId::new(0);
    let infer_key = instantiate_infer(&env, hole_key);
    let hole_value = HoleId::new(1);
    let infer_value = instantiate_infer(&env, hole_value);
    dict!(env, dict_a, infer_key, infer_value);

    // Create a dict with concrete types
    let string = primitive!(env, PrimitiveType::String);
    let number = primitive!(env, PrimitiveType::Number);
    dict!(env, dict_b, string, number);

    let mut inference_env = InferenceEnvironment::new(&env);

    // Collect constraints between the two dictionary types
    dict_a.collect_constraints(dict_b, &mut inference_env);

    let constraints = inference_env.take_constraints();
    // We expect two constraints:
    // 1. infer_key = string (keys are invariant)
    // 2. infer_value <: number (values are covariant)
    assert_eq!(
        constraints,
        [
            Constraint::Equals {
                variable: Variable::synthetic(VariableKind::Hole(hole_key)),
                r#type: string,
            },
            Constraint::UpperBound {
                variable: Variable::synthetic(VariableKind::Hole(hole_value)),
                bound: number,
            }
        ]
    );
}

#[test]
fn collect_constraints_concrete_intrinsics() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create concrete lists and dicts
    let integer = primitive!(env, PrimitiveType::Integer);
    let number = primitive!(env, PrimitiveType::Number);
    let string = primitive!(env, PrimitiveType::String);

    // Integer <: Number
    list!(env, integer_list, integer);
    list!(env, number_list, number);

    dict!(env, dict_a, string, integer);
    dict!(env, dict_b, string, number);

    let mut inference_env = InferenceEnvironment::new(&env);

    // Collect constraints for concrete lists
    integer_list.collect_constraints(number_list, &mut inference_env);

    // No constraints should be generated for concrete types
    assert!(inference_env.take_constraints().is_empty());

    // Collect constraints for concrete dicts
    dict_a.collect_constraints(dict_b, &mut inference_env);

    // No constraints should be generated for concrete types
    assert!(inference_env.take_constraints().is_empty());
}

// Tests for ListType.collect_structural_edges
#[test]
fn collect_dependencies_list() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create an inference variable
    let hole = HoleId::new(0);
    let infer_var = instantiate_infer(&env, hole);

    // Create a list with an inference variable: List<_0>
    list!(env, list_type, infer_var);

    let mut inference_env = InferenceEnvironment::new(&env);

    // Create a variable to use as the source in a structural edge
    let variable = Variable::synthetic(VariableKind::Hole(HoleId::new(1)));

    // Collect structural edges
    inference_env.collect_dependencies(list_type.id, variable);

    // Since list elements are covariant, the source should flow to the element infer var
    // We expect: _1 -> _0
    let constraints = inference_env.take_constraints();
    assert_eq!(
        constraints,
        [Constraint::Dependency {
            source: variable,
            target: Variable::synthetic(VariableKind::Hole(hole)),
        }]
    );
}

#[test]
fn collect_dependencies_dict() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create inference variables for both key and value
    let key_hole = HoleId::new(0);
    let key_var = instantiate_infer(&env, key_hole);
    let value_hole = HoleId::new(1);
    let value_var = instantiate_infer(&env, value_hole);

    // Create a dict with inference variables for both key and value: Dict<_0, _1>
    dict!(env, dict_type, key_var, value_var);

    let mut inference_env = InferenceEnvironment::new(&env);

    // Create a variable to use as the source in a structural edge
    let variable = Variable::synthetic(VariableKind::Hole(HoleId::new(2)));

    // Collect structural edges
    inference_env.collect_dependencies(dict_type.id, variable);

    // Dict keys are invariant (no edge), values are covariant (source flows to value)
    // We expect only: _2 -> _1
    let constraints = inference_env.take_constraints();
    assert_eq!(
        constraints,
        [
            Constraint::Dependency {
                source: variable,
                target: Variable::synthetic(VariableKind::Hole(key_hole))
            },
            Constraint::Dependency {
                source: variable,
                target: Variable::synthetic(VariableKind::Hole(value_hole)),
            }
        ]
    );
}

#[test]
fn simplify_recursive_list() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let r#type = env.types.intern(|id| PartialType {
        span: SpanId::SYNTHETIC,
        kind: env.intern_kind(TypeKind::Intrinsic(IntrinsicType::List(ListType {
            element: id.value(),
        }))),
    });

    let mut simplify = SimplifyEnvironment::new(&env);
    let type_id = simplify.simplify(r#type.id);

    let r#type = env.r#type(type_id);

    assert_matches!(
        r#type.kind,
        TypeKind::Intrinsic(IntrinsicType::List(ListType { element })) if *element == type_id
    );
}

#[test]
fn simplify_recursive_dict() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let r#type = env.types.intern(|id| PartialType {
        span: SpanId::SYNTHETIC,
        kind: env.intern_kind(TypeKind::Intrinsic(IntrinsicType::Dict(DictType {
            key: id.value(),
            value: id.value(),
        }))),
    });

    let mut simplify = SimplifyEnvironment::new(&env);
    let type_id = simplify.simplify(r#type.id);

    let r#type = env.r#type(type_id);

    assert_matches!(
        r#type.kind,
        TypeKind::Intrinsic(IntrinsicType::Dict(DictType { key, value })) if *key == type_id && *value == type_id
    );
}

#[test]
fn instantiate_list() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let argument = env.counter.generic_argument.next();
    let param = instantiate_param(&env, argument);

    let value = generic!(
        env,
        opaque!(env, "A", list!(env, param)),
        [GenericArgument {
            id: argument,
            name: heap.intern_symbol("T"),
            constraint: None
        }]
    );

    let mut instantiate = InstantiateEnvironment::new(&env);
    let type_id = instantiate.instantiate(value);
    assert!(instantiate.take_diagnostics().is_empty());

    let result = env.r#type(type_id);

    let generic = result.kind.generic().expect("should be a generic type");
    let opaque = env
        .r#type(generic.base)
        .kind
        .opaque()
        .expect("should be an opaque type");
    let element = env
        .r#type(opaque.repr)
        .kind
        .intrinsic()
        .expect("should be an intrinsic type")
        .list()
        .expect("should be a list")
        .element;
    let element = env.r#type(element).kind.param().expect("should be a param");

    assert_eq!(generic.arguments.len(), 1);
    assert_eq!(
        *element,
        Param {
            argument: generic.arguments[0].id
        }
    );
    assert_ne!(element.argument, argument);
}

#[test]
fn instantiate_dict() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let argument = env.counter.generic_argument.next();
    let param = instantiate_param(&env, argument);

    let value = generic!(
        env,
        opaque!(env, "A", dict!(env, param, param)),
        [GenericArgument {
            id: argument,
            name: heap.intern_symbol("T"),
            constraint: None
        }]
    );

    let mut instantiate = InstantiateEnvironment::new(&env);
    let type_id = instantiate.instantiate(value);
    assert!(instantiate.take_diagnostics().is_empty());

    let result = env.r#type(type_id);
    let generic = result.kind.generic().expect("should be a generic type");
    let opaque = env
        .r#type(generic.base)
        .kind
        .opaque()
        .expect("should be an opaque type");
    let dict = env
        .r#type(opaque.repr)
        .kind
        .intrinsic()
        .expect("should be an intrinsic type")
        .dict()
        .expect("should be a dict");
    let key = env
        .r#type(dict.key)
        .kind
        .param()
        .expect("should be a param");
    let value = env
        .r#type(dict.value)
        .kind
        .param()
        .expect("should be a param");

    assert_eq!(generic.arguments.len(), 1);
    assert_eq!(
        *key,
        Param {
            argument: generic.arguments[0].id
        }
    );
    assert_ne!(key.argument, argument);

    assert_eq!(
        *value,
        Param {
            argument: generic.arguments[0].id
        }
    );
    assert_ne!(value.argument, argument);
}

#[test]
fn list_projection() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let list = list!(env, primitive!(env, PrimitiveType::String));

    let mut lattice = LatticeEnvironment::new(&env);
    lattice.projection(list, Ident::synthetic(heap.intern_symbol("foo")));

    let diagnostics = lattice.take_diagnostics();
    assert_eq!(diagnostics.len(), 1);
    let diagnostics = diagnostics.into_vec();

    assert_eq!(
        diagnostics[0].category,
        TypeCheckDiagnosticCategory::UnsupportedProjection
    );
}

#[test]
fn dict_projection() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let dict = dict!(
        env,
        primitive!(env, PrimitiveType::String),
        primitive!(env, PrimitiveType::Number)
    );

    let mut lattice = LatticeEnvironment::new(&env);
    lattice.projection(dict, Ident::synthetic(heap.intern_symbol("foo")));

    let diagnostics = lattice.take_diagnostics();
    assert_eq!(diagnostics.len(), 1);
    let diagnostics = diagnostics.into_vec();

    assert_eq!(
        diagnostics[0].category,
        TypeCheckDiagnosticCategory::UnsupportedProjection
    );
}

#[test]
fn list_subscript() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let list = list!(env, primitive!(env, PrimitiveType::String));

    let mut inference = InferenceEnvironment::new(&env);
    let variable = inference.add_subscript(
        SpanId::SYNTHETIC,
        list,
        primitive!(env, PrimitiveType::Integer),
    );

    let Success {
        value: substitution,
        advisories,
    } = inference.into_solver().solve().expect("should have solved");
    assert!(advisories.is_empty());

    assert_equiv!(
        env,
        [substitution
            .infer(variable.kind.hole().expect("variable should be hole"))
            .expect("should have inferred variable")],
        [union!(
            env,
            [
                primitive!(env, PrimitiveType::Null),
                primitive!(env, PrimitiveType::String)
            ]
        )]
    );
}

#[test]
fn list_subscript_mismatch() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let list = list!(env, primitive!(env, PrimitiveType::String));

    let mut inference = InferenceEnvironment::new(&env);
    inference.add_subscript(
        SpanId::SYNTHETIC,
        list,
        primitive!(env, PrimitiveType::String),
    );

    let diagnostics = inference
        .into_solver()
        .solve()
        .expect_err("solver should error out");
    let diagnostics = diagnostics.into_issues();
    assert_eq!(diagnostics.len(), 2);
    let diagnostics = diagnostics.into_vec();

    assert_eq!(
        diagnostics[0].category,
        TypeCheckDiagnosticCategory::UnconstrainedTypeVariable
    );
    assert_eq!(
        diagnostics[1].category,
        TypeCheckDiagnosticCategory::ListIndexTypeMismatch
    );
}

#[test]
fn list_subscript_discharge_constraints() {
    // If the key for either is unknown, discharge constraints
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let hole1 = env.counter.hole.next();

    let list = list!(env, primitive!(env, PrimitiveType::Number));

    let mut lattice = LatticeEnvironment::new(&env);
    let mut inference = InferenceEnvironment::new(&env);

    lattice.subscript(list, instantiate_infer(&env, hole1), &mut inference);

    let constraints = inference.take_constraints();
    assert_eq!(
        constraints,
        [Constraint::UpperBound {
            variable: Variable::synthetic(VariableKind::Hole(hole1)),
            bound: primitive!(env, PrimitiveType::Integer)
        }]
    );
}

#[test]
fn dict_subscript() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let dict = dict!(
        env,
        primitive!(env, PrimitiveType::Number),
        primitive!(env, PrimitiveType::String)
    );

    let mut inference = InferenceEnvironment::new(&env);
    let variable = inference.add_subscript(
        SpanId::SYNTHETIC,
        dict,
        primitive!(env, PrimitiveType::Number),
    );

    let Success {
        value: substitution,
        advisories,
    } = inference.into_solver().solve().expect("should have solved");
    assert!(advisories.is_empty());

    assert_equiv!(
        env,
        [substitution
            .infer(variable.kind.hole().expect("variable should be hole"))
            .expect("should have inferred variable")],
        [union!(
            env,
            [
                primitive!(env, PrimitiveType::Null),
                primitive!(env, PrimitiveType::String)
            ]
        )]
    );
}

#[test]
fn dict_subscript_mismatch() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let dict = dict!(
        env,
        primitive!(env, PrimitiveType::Number),
        primitive!(env, PrimitiveType::String)
    );

    let mut inference = InferenceEnvironment::new(&env);
    inference.add_subscript(
        SpanId::SYNTHETIC,
        dict,
        primitive!(env, PrimitiveType::Integer),
    );

    let diagnostics = inference
        .into_solver()
        .solve()
        .expect_err("solver should error out");
    let diagnostics = diagnostics.into_issues();
    assert_eq!(diagnostics.len(), 2);
    let diagnostics = diagnostics.into_vec();

    assert_eq!(
        diagnostics[0].category,
        TypeCheckDiagnosticCategory::UnconstrainedTypeVariable
    );
    assert_eq!(
        diagnostics[1].category,
        TypeCheckDiagnosticCategory::DictKeyTypeMismatch
    );
}

#[test]
fn dict_subscript_discharge_constraints() {
    // If the key for either is unknown, discharge constraints
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let hole1 = env.counter.hole.next();
    let hole2 = env.counter.hole.next();

    let dict = dict!(
        env,
        instantiate_infer(&env, hole1),
        primitive!(env, PrimitiveType::Number)
    );

    let mut lattice = LatticeEnvironment::new(&env);
    let mut inference = InferenceEnvironment::new(&env);

    lattice.subscript(dict, instantiate_infer(&env, hole2), &mut inference);

    let constraints = inference.take_constraints();
    assert_eq!(
        constraints,
        [Constraint::Unify {
            lhs: Variable::synthetic(VariableKind::Hole(hole2)),
            rhs: Variable::synthetic(VariableKind::Hole(hole1))
        }]
    );
}
