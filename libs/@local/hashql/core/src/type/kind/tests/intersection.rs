use core::assert_matches::assert_matches;

use crate::{
    heap::Heap,
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
            Generic, IntersectionType, OpaqueType, Param, StructType, TypeKind,
            generic::{GenericArgument, GenericArgumentId},
            infer::HoleId,
            intrinsic::{DictType, IntrinsicType, ListType},
            primitive::PrimitiveType,
            r#struct::StructField,
            test::{
                assert_equiv, assert_sorted_eq, dict, generic, intersection, list, opaque,
                primitive, r#struct, struct_field, tuple, union,
            },
            tuple::TupleType,
            union::UnionType,
        },
        lattice::{Lattice as _, Projection, Subscript, test::assert_lattice_laws},
        tests::{instantiate, instantiate_infer, instantiate_param},
    },
};

#[test]
fn unnest_flattens_nested_intersections() {
    let heap = Heap::new();
    let env = Environment::new_empty(&heap);

    // Create an intersection type with a nested intersection
    let number = primitive!(env, PrimitiveType::Number);
    let string = primitive!(env, PrimitiveType::String);
    let boolean = primitive!(env, PrimitiveType::Boolean);

    // Create a nested intersection: (String & Boolean)
    let nested_intersection = intersection!(env, [string, boolean]);

    // Create an intersection that includes the nested intersection: Number & (String & Boolean)
    intersection!(env, intersection_type, [number, nested_intersection]);

    // Unnesting should flatten to: Number & String & Boolean
    let unnested = intersection_type.unnest(&env);

    assert_eq!(unnested, [number, string, boolean]);
}

#[test]
fn unnest_nested_recursive_intersection() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let r#type = env.types.intern(|id| PartialType {
        span: SpanId::SYNTHETIC,
        kind: env.intern_kind(TypeKind::Intersection(IntersectionType {
            variants: env.intern_type_ids(&[env.intern_type(PartialType {
                span: SpanId::SYNTHETIC,
                kind: env.intern_kind(TypeKind::Intersection(IntersectionType {
                    variants: env.intern_type_ids(&[id.value()]),
                })),
            })]),
        })),
    });

    let intersection = r#type
        .kind
        .intersection()
        .expect("should be an intersection");
    let unnested = r#type.with(intersection).unnest(&env);

    assert_equiv!(env, unnested, []);
}

#[test]
fn join_identical_intersections() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    intersection!(
        env,
        a,
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String)
        ]
    );
    intersection!(
        env,
        b,
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String)
        ]
    );

    let mut lattice_env = LatticeEnvironment::new(&env);

    // Join identical intersections should result in the same intersection
    assert_equiv!(
        env,
        a.join(b, &mut lattice_env),
        [intersection!(
            env,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String),
                union!(
                    env,
                    [
                        primitive!(env, PrimitiveType::Number),
                        primitive!(env, PrimitiveType::String)
                    ]
                ),
                union!(
                    env,
                    [
                        primitive!(env, PrimitiveType::Number),
                        primitive!(env, PrimitiveType::String)
                    ]
                ),
            ]
        )]
    );
}

#[test]
fn join_different_intersections() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create different intersection types
    intersection!(
        env,
        a,
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String)
        ]
    );
    intersection!(
        env,
        b,
        [
            primitive!(env, PrimitiveType::Boolean),
            primitive!(env, PrimitiveType::Null)
        ]
    );

    let mut lattice_env = LatticeEnvironment::new(&env);
    lattice_env.without_simplify();

    // Join different intersections should create distributing cross-products
    // (A & B) ∨ (C & D) = (A ∨ C) & (A ∨ D) & (B ∨ C) & (B ∨ D)
    assert_equiv!(
        env,
        a.join(b, &mut lattice_env),
        [intersection!(
            env,
            [
                union!(
                    env,
                    [
                        primitive!(env, PrimitiveType::Number),
                        primitive!(env, PrimitiveType::Boolean)
                    ]
                ),
                union!(
                    env,
                    [
                        primitive!(env, PrimitiveType::Number),
                        primitive!(env, PrimitiveType::Null)
                    ]
                ),
                union!(
                    env,
                    [
                        primitive!(env, PrimitiveType::String),
                        primitive!(env, PrimitiveType::Boolean)
                    ]
                ),
                union!(
                    env,
                    [
                        primitive!(env, PrimitiveType::String),
                        primitive!(env, PrimitiveType::Null)
                    ]
                )
            ]
        )]
    );
}

#[test]
fn join_with_empty_intersection() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create an empty intersection (Unknown) and a non-empty intersection
    intersection!(env, empty, []);
    intersection!(
        env,
        non_empty,
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String),
        ]
    );

    let mut lattice_env = LatticeEnvironment::new(&env);

    // Empty intersection (Unknown) joined with any intersection should be the other
    // intersection
    assert_equiv!(env, empty.join(non_empty, &mut lattice_env), [non_empty.id]);

    // The reverse should also be true
    assert_equiv!(env, non_empty.join(empty, &mut lattice_env), [non_empty.id]);
}

#[test]
fn meet_recursive_intersection() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    intersection!(env, a, [primitive!(env, PrimitiveType::Number)]);

    let b = env.types.intern(|id| PartialType {
        span: SpanId::SYNTHETIC,
        kind: env.intern_kind(TypeKind::Intersection(IntersectionType {
            variants: env.intern_type_ids(&[id.value(), primitive!(env, PrimitiveType::Integer)]),
        })),
    });

    let mut lattice_env = LatticeEnvironment::new(&env);
    assert_equiv!(
        env,
        [lattice_env.meet(a.id, b.id)],
        [primitive!(env, PrimitiveType::Integer)]
    );
}

#[test]
fn meet_identical_intersections() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    intersection!(
        env,
        a,
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String)
        ]
    );
    intersection!(
        env,
        b,
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String)
        ]
    );

    let mut lattice_env = LatticeEnvironment::new(&env);

    // Meet identical intersections should result in the same intersection
    assert_equiv!(
        env,
        a.meet(b, &mut lattice_env),
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String),
        ]
    );
}

#[test]
fn meet_different_intersections() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create different intersection types
    intersection!(
        env,
        a,
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String)
        ]
    );
    intersection!(
        env,
        b,
        [
            primitive!(env, PrimitiveType::Boolean),
            primitive!(env, PrimitiveType::Null)
        ]
    );

    let mut lattice_env = LatticeEnvironment::new(&env);

    // Meet should combine all variants
    assert_equiv!(
        env,
        a.meet(b, &mut lattice_env),
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String),
            primitive!(env, PrimitiveType::Boolean),
            primitive!(env, PrimitiveType::Null),
        ]
    );
}

#[test]
fn meet_with_empty_intersection() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create an empty intersection (Unknown/top type) and a non-empty intersection
    intersection!(env, empty, []);
    intersection!(
        env,
        non_empty,
        [
            primitive!(env, PrimitiveType::String),
            primitive!(env, PrimitiveType::Number),
        ]
    );

    let mut lattice_env = LatticeEnvironment::new(&env);

    // Empty intersection (Unknown) met with any intersection should be that intersection
    assert_equiv!(
        env,
        empty.meet(non_empty, &mut lattice_env),
        [
            primitive!(env, PrimitiveType::String),
            primitive!(env, PrimitiveType::Number),
        ]
    );

    // The reverse should also be true
    assert_equiv!(
        env,
        non_empty.meet(empty, &mut lattice_env),
        [
            primitive!(env, PrimitiveType::String),
            primitive!(env, PrimitiveType::Number),
        ]
    );
}

#[test]
fn meet_empty_empty_intersection() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    intersection!(env, a, []);
    intersection!(env, b, []);

    let mut lattice_env = LatticeEnvironment::new(&env);

    assert_equiv!(
        env,
        a.meet(b, &mut lattice_env),
        [instantiate(&env, TypeKind::Unknown)]
    );
}

#[test]
fn is_bottom() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Intersection with Never type
    let never = instantiate(&env, TypeKind::Never);
    intersection!(
        env,
        with_never,
        [never, primitive!(env, PrimitiveType::Number)]
    );

    // Regular intersection
    intersection!(env, regular, [primitive!(env, PrimitiveType::Number)]);

    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Intersection with Never should be bottom
    assert!(with_never.is_bottom(&mut analysis_env));

    // Regular intersection should not be bottom
    assert!(!regular.is_bottom(&mut analysis_env));
}

#[test]
fn is_top() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Empty intersection (Unknown)
    intersection!(env, empty, []);

    // Regular intersection
    intersection!(env, regular, [primitive!(env, PrimitiveType::Number)]);

    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Empty intersection should be top
    assert!(empty.is_top(&mut analysis_env));

    // Regular intersection should not be top
    assert!(!regular.is_top(&mut analysis_env));
}

#[test]
fn is_subtype_of_self() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create an intersection type
    intersection!(
        env,
        a,
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String)
        ]
    );

    intersection!(
        env,
        b,
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String)
        ]
    );

    let mut analysis_env = AnalysisEnvironment::new(&env);

    // An intersection should be a subtype of itself (reflexivity)
    //
    // This might seem counterintuitive at first, but it's necessary for correctness, consider
    // the distribution laws:
    // (Integer & String) <: (Integer & String)
    //   <=> Integer <: (Integer & String) ∧ String <: (Integer & String)
    //   <=> (Integer <: Integer ∧ Integer <: String) ∧ (String <: Integer ∧ String <: String)
    //   <=> (true ∧ false) ∧ (false ∧ true)
    //   <=> false ∧ false
    //   <=> false
    assert!(!a.is_subtype_of(b, &mut analysis_env));

    // ... as `Integer & String` is equivalent to `Never`, the `TypeKind` implementation should
    // short-circuit to never
    assert!(analysis_env.is_subtype_of(Variance::Covariant, a.id, b.id));
}

#[test]
fn subtype_supertype_relation() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create intersections for testing subtype relationships
    let number = primitive!(env, PrimitiveType::Number);
    let integer = primitive!(env, PrimitiveType::Integer); // Integer is a subtype of Number
    let string = primitive!(env, PrimitiveType::String);

    // Number & String
    intersection!(env, number_string, [number, string]);

    // Number
    intersection!(env, just_number, [number]);

    // Number & Integer
    intersection!(env, number_integer, [number, integer]);

    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Number & String <: Number
    // see is_subtype_of_self for an in-depth explanation
    assert!(!number_string.is_subtype_of(just_number, &mut analysis_env));
    assert!(analysis_env.is_subtype_of(Variance::Covariant, number_string.id, just_number.id));

    // Number ≮: Number & String
    assert!(!just_number.is_subtype_of(number_string, &mut analysis_env));

    // Number & Integer <: Number
    assert!(number_integer.is_subtype_of(just_number, &mut analysis_env));
    assert!(analysis_env.is_subtype_of(Variance::Covariant, number_integer.id, just_number.id));
}

#[test]
fn empty_intersection_is_supertype_of_all() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Empty intersection (Unknown/top type)
    intersection!(env, empty, []);

    // Non-empty intersection
    intersection!(env, non_empty, [primitive!(env, PrimitiveType::Number)]);

    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Any intersection should be a subtype of the empty intersection (Unknown)
    assert!(non_empty.is_subtype_of(empty, &mut analysis_env));

    // The inverse should not be true
    assert!(!empty.is_subtype_of(non_empty, &mut analysis_env));
}

#[test]
fn is_equivalent() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create identical intersections (but at different type IDs)
    intersection!(
        env,
        a,
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String)
        ]
    );
    intersection!(
        env,
        b,
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String)
        ]
    );

    // Create an intersection with same types in different order
    intersection!(
        env,
        c,
        [
            primitive!(env, PrimitiveType::String),
            primitive!(env, PrimitiveType::Number)
        ]
    );

    // Create an intersection with different types
    intersection!(
        env,
        d,
        [
            primitive!(env, PrimitiveType::Boolean),
            primitive!(env, PrimitiveType::Number)
        ]
    );

    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Same intersections should be equivalent
    assert!(a.is_equivalent(b, &mut analysis_env));

    // Order shouldn't matter for equivalence
    assert!(a.is_equivalent(c, &mut analysis_env));

    // Different intersections should not be equivalent
    assert!(!a.is_equivalent(d, &mut analysis_env));
}

#[test]
fn is_equivalent_side() {
    // Check that we both check the left and the right sides for equivalence
    let heap = Heap::new();
    let env = Environment::new(&heap);

    intersection!(env, a, [primitive!(env, PrimitiveType::Boolean)]);
    intersection!(
        env,
        b,
        [
            primitive!(env, PrimitiveType::Boolean),
            primitive!(env, PrimitiveType::Number)
        ]
    );

    let mut analysis_env = AnalysisEnvironment::new(&env);

    assert!(!a.is_equivalent(b, &mut analysis_env));
    assert!(!b.is_equivalent(a, &mut analysis_env));
}

#[test]
fn empty_intersection_equivalence() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create two empty intersections
    intersection!(env, a, []);
    intersection!(env, b, []);

    // Create a non-empty intersection
    intersection!(env, c, [primitive!(env, PrimitiveType::Number)]);

    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Empty intersections should be equivalent to each other
    assert!(a.is_equivalent(b, &mut analysis_env));

    // Empty intersection should not be equivalent to non-empty intersection
    assert!(!a.is_equivalent(c, &mut analysis_env));
}

#[test]
fn simplify_identical_variants() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create an intersection with duplicate variants
    intersection!(
        env,
        intersection_type,
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::Number)
        ]
    );

    let mut simplify_env = SimplifyEnvironment::new(&env);

    // Simplifying should collapse duplicates
    assert_equiv!(
        env,
        [intersection_type.simplify(&mut simplify_env)],
        [primitive!(env, PrimitiveType::Number)]
    );
}

#[test]
fn simplify_nested_intersections() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create nested intersections
    let nested = intersection!(env, [primitive!(env, PrimitiveType::Number)]);
    intersection!(
        env,
        intersection_type,
        [nested, primitive!(env, PrimitiveType::Integer)]
    );

    let mut simplify_env = SimplifyEnvironment::new(&env);

    // Simplifying should flatten nested intersections
    assert_equiv!(
        env,
        [intersection_type.simplify(&mut simplify_env)],
        [intersection!(
            env,
            [primitive!(env, PrimitiveType::Integer)]
        )]
    );
}

#[test]
fn simplify_with_top() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create an intersection with a top (Unknown) type
    intersection!(
        env,
        intersection_type,
        [
            instantiate(&env, TypeKind::Unknown),
            primitive!(env, PrimitiveType::Number)
        ]
    );

    let mut simplify_env = SimplifyEnvironment::new(&env);

    // Simplifying should keep only the non-top type
    assert_equiv!(
        env,
        [intersection_type.simplify(&mut simplify_env)],
        [primitive!(env, PrimitiveType::Number)]
    );
}

#[test]
fn simplify_with_bottom() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create an intersection with a never type
    intersection!(
        env,
        intersection_type,
        [
            instantiate(&env, TypeKind::Never),
            primitive!(env, PrimitiveType::Number)
        ]
    );

    let mut simplify_env = SimplifyEnvironment::new(&env);

    // Simplifying should collapse to Never
    assert_equiv!(
        env,
        [intersection_type.simplify(&mut simplify_env)],
        [instantiate(&env, TypeKind::Never)]
    );
}

#[test]
fn simplify_empty_intersection() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create an empty intersection
    intersection!(env, intersection_type, []);

    let mut simplify_env = SimplifyEnvironment::new(&env);

    // Simplifying empty intersection should result in Unknown
    assert_equiv!(
        env,
        [intersection_type.simplify(&mut simplify_env)],
        [instantiate(&env, TypeKind::Unknown)]
    );
}

#[test]
fn simplify_with_supertypes() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create an intersection with a type and its supertype
    let number = primitive!(env, PrimitiveType::Number);
    let integer = primitive!(env, PrimitiveType::Integer); // Integer is a subtype of Number
    intersection!(env, intersection_type, [number, integer]);

    let mut simplify_env = SimplifyEnvironment::new(&env);

    // Simplifying should keep only the subtype
    assert_equiv!(
        env,
        [intersection_type.simplify(&mut simplify_env)],
        [integer]
    );
}

#[test]
fn lattice_laws() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create three distinct intersection types for testing lattice laws
    let a = intersection!(env, [primitive!(env, PrimitiveType::Number)]);
    let b = intersection!(env, [primitive!(env, PrimitiveType::String)]);
    let c = intersection!(env, [primitive!(env, PrimitiveType::Boolean)]);

    // Test that intersection types satisfy lattice laws (associativity, commutativity,
    // absorption)
    assert_lattice_laws(&env, a, b, c);
}

#[test]
fn is_concrete() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Concrete intersection (with all concrete variants)
    let number = primitive!(env, PrimitiveType::Number);
    let string = primitive!(env, PrimitiveType::String);
    intersection!(env, concrete_intersection, [number, string]);
    assert!(concrete_intersection.is_concrete(&mut analysis_env));

    // Non-concrete intersection (with at least one non-concrete variant)
    let infer_var = instantiate_infer(&env, HoleId::new(0));
    intersection!(env, non_concrete_intersection, [number, infer_var]);
    assert!(!non_concrete_intersection.is_concrete(&mut analysis_env));

    // Empty intersection should be concrete
    intersection!(env, empty_intersection, []);
    assert!(empty_intersection.is_concrete(&mut analysis_env));

    // Nested non-concrete intersection
    intersection!(
        env,
        nested_intersection,
        [concrete_intersection.id, non_concrete_intersection.id]
    );
    assert!(!nested_intersection.is_concrete(&mut analysis_env));
}

#[test]
fn disjoint_types_produce_never() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create an intersection of disjoint types (e.g., number & string)
    intersection!(
        env,
        intersection_type,
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String)
        ]
    );

    let mut simplify_env = SimplifyEnvironment::new(&env);

    // Check if simplification of disjoint types produces Never
    assert_equiv!(
        env,
        [intersection_type.simplify(&mut simplify_env)],
        [instantiate(&env, TypeKind::Never)]
    );
}

#[test]
fn intersection_with_complex_types() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create tuple types
    let tuple1 = tuple!(env, [primitive!(env, PrimitiveType::Number)]);
    let tuple2 = tuple!(env, [primitive!(env, PrimitiveType::String)]);

    // Create an intersection of tuple types
    intersection!(env, intersection_type, [tuple1, tuple2]);

    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Intersection operations should work with non-primitive types
    assert!(!intersection_type.is_top(&mut analysis_env));

    // Test subtyping with tuples in intersections
    let tuple3 = tuple!(env, [primitive!(env, PrimitiveType::Number)]);
    intersection!(env, single_tuple, [tuple3]);

    // tuple1 & tuple2 <: tuple1
    // see for an in-depth explanation see is_subtype_of_self
    assert!(!intersection_type.is_subtype_of(single_tuple, &mut analysis_env));
    assert!(analysis_env.is_subtype_of(Variance::Covariant, intersection_type.id, single_tuple.id));

    // tuple1 ≮: tuple1 & tuple2
    assert!(!single_tuple.is_subtype_of(intersection_type, &mut analysis_env));
}

#[test]
fn intersection_and_union_interaction() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let number = primitive!(env, PrimitiveType::Number);
    let string = primitive!(env, PrimitiveType::String);
    let boolean = primitive!(env, PrimitiveType::Boolean);

    // A & (B | C)
    let union_type = union!(env, [string, boolean]);
    intersection!(env, intersection_with_union, [number, union_type]);

    let mut simplify_env = SimplifyEnvironment::new(&env);

    // This should simplify to
    //  (A & B) | (A & C)
    //    <=> (Number & String) | (Number & Boolean)
    //    <=> Never | Never
    //    <=> Never
    assert_equiv!(
        env,
        [intersection_with_union.simplify(&mut simplify_env)],
        [instantiate(&env, TypeKind::Never)]
    );
}

#[test]
fn intersection_equivalence_covariance() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Dict<Number, Boolean>
    let dict_number_boolean = dict!(
        env,
        primitive!(env, PrimitiveType::Number),
        primitive!(env, PrimitiveType::Boolean)
    );

    // Dict<Number, String>
    let dict_number_string = dict!(
        env,
        primitive!(env, PrimitiveType::Number),
        primitive!(env, PrimitiveType::String)
    );

    // Dict<Number, Boolean & String>
    let dict_number_boolean_string = dict!(
        env,
        primitive!(env, PrimitiveType::Number),
        intersection!(
            env,
            [
                primitive!(env, PrimitiveType::Boolean),
                primitive!(env, PrimitiveType::String)
            ]
        )
    );

    // Create the two union types we want to compare:
    // Type 1: Dict<Number, Boolean & String>
    let type1 = dict_number_boolean_string;

    // Type 2: Dict<Number, Boolean> & Dict<Number, String>
    let type2 = intersection!(env, [dict_number_boolean, dict_number_string]);

    let mut analysis_env = AnalysisEnvironment::new(&env);

    // These types should be equivalent despite having different variant counts
    assert!(analysis_env.is_equivalent(type1, type2));
    assert!(analysis_env.is_equivalent(type2, type1));
}

#[test]
fn collect_constraints_empty() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create two empty intersections (Unknown type)
    intersection!(env, empty_a, []);
    intersection!(env, empty_b, []);

    let mut inference_env = InferenceEnvironment::new(&env);

    // Unknown <: Unknown
    empty_a.collect_constraints(empty_b, &mut inference_env);

    // No constraints should be generated for this trivial case
    let constraints = inference_env.take_constraints();
    assert!(constraints.is_empty());
}

#[test]
fn collect_constraints_empty_subtype() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Empty intersection (Unknown) as subtype
    intersection!(env, empty, []);

    let hole = HoleId::new(0);
    let infer = instantiate_infer(&env, hole);
    intersection!(env, concrete, [infer]);

    let mut inference_env = InferenceEnvironment::new(&env);

    empty.collect_constraints(concrete, &mut inference_env);

    let constraints = inference_env.take_constraints();
    assert_matches!(
        &*constraints,
        [Constraint::LowerBound {
            variable: Variable { span: SpanId::SYNTHETIC, kind: VariableKind::Hole(var) },
            bound
        }] if *env.r#type(*bound).kind == TypeKind::Unknown && *var == hole
    );
}

#[test]
fn collect_constraints_empty_supertype() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let hole = HoleId::new(0);
    let infer = instantiate_infer(&env, hole);
    intersection!(env, concrete, [infer]);

    // Empty intersection (Unknown) as supertype
    intersection!(env, empty, []);

    let mut inference_env = InferenceEnvironment::new(&env);

    concrete.collect_constraints(empty, &mut inference_env);

    let constraints = inference_env.take_constraints();
    assert_matches!(
        &*constraints,
        [Constraint::UpperBound {
            variable: Variable { span: SpanId::SYNTHETIC, kind: VariableKind::Hole(var) },
            bound
        }] if *env.r#type(*bound).kind == TypeKind::Unknown && *var == hole
    );
}

#[test]
fn collect_constraints_inference_variable_subtype() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create an inference variable
    let hole = HoleId::new(0);
    let infer_var = instantiate_infer(&env, hole);

    // Intersection with inference variable as subtype
    intersection!(env, infer_intersection, [infer_var]);

    // Concrete intersection as supertype
    let number = primitive!(env, PrimitiveType::Number);
    intersection!(env, concrete_intersection, [number]);

    let mut inference_env = InferenceEnvironment::new(&env);

    // ?T <: Number
    infer_intersection.collect_constraints(concrete_intersection, &mut inference_env);

    // Should generate an upper bound constraint
    let constraints = inference_env.take_constraints();
    assert_sorted_eq!(
        constraints,
        [Constraint::UpperBound {
            variable: Variable::synthetic(VariableKind::Hole(hole)),
            bound: number
        }]
    );
}

#[test]
fn collect_constraints_inference_variable_supertype() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create an inference variable
    let hole = HoleId::new(0);
    let infer_var = instantiate_infer(&env, hole);

    // Concrete intersection as subtype
    let number = primitive!(env, PrimitiveType::Number);
    intersection!(env, concrete_intersection, [number]);

    // Intersection with inference variable as supertype
    intersection!(env, infer_intersection, [infer_var]);

    let mut inference_env = InferenceEnvironment::new(&env);

    // Number <: ?T
    concrete_intersection.collect_constraints(infer_intersection, &mut inference_env);

    // Should generate a lower bound constraint
    let constraints = inference_env.take_constraints();
    assert_sorted_eq!(
        constraints,
        [Constraint::LowerBound {
            variable: Variable::synthetic(VariableKind::Hole(hole)),
            bound: number
        }]
    );
}

#[test]
fn collect_constraints_multiple_variants() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create inference variables
    let hole_a = HoleId::new(0);
    let infer_a = instantiate_infer(&env, hole_a);
    let hole_b = HoleId::new(1);
    let infer_b = instantiate_infer(&env, hole_b);

    // Create concrete types
    let number = primitive!(env, PrimitiveType::Number);
    let string = primitive!(env, PrimitiveType::String);

    // Create intersection with multiple inference variables
    intersection!(env, infer_intersection, [infer_a, infer_b]);

    // Create intersection with multiple concrete types
    intersection!(env, concrete_intersection, [number, string]);

    let mut inference_env = InferenceEnvironment::new(&env);

    // (infer_a & infer_b) <: (Number & String)
    infer_intersection.collect_constraints(concrete_intersection, &mut inference_env);

    // Should collect constraints in a cartesian product
    let constraints = inference_env.take_constraints();
    assert_sorted_eq!(
        constraints,
        [
            Constraint::UpperBound {
                variable: Variable::synthetic(VariableKind::Hole(hole_a)),
                bound: string,
            },
            Constraint::UpperBound {
                variable: Variable::synthetic(VariableKind::Hole(hole_a)),
                bound: number,
            },
            Constraint::UpperBound {
                variable: Variable::synthetic(VariableKind::Hole(hole_b)),
                bound: string,
            },
            Constraint::UpperBound {
                variable: Variable::synthetic(VariableKind::Hole(hole_b)),
                bound: number,
            },
        ]
    );
}

#[test]
fn collect_constraints_nested_intersection() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create inference variable
    let hole = HoleId::new(0);
    let infer_var = instantiate_infer(&env, hole);

    // Create a nested intersection with inference variable
    let inner_infer = intersection!(env, [infer_var]);
    intersection!(env, nested_infer, [inner_infer]);

    // Create a concrete nested intersection
    let number = primitive!(env, PrimitiveType::Number);
    let inner_concrete = intersection!(env, [number]);
    intersection!(env, nested_concrete, [inner_concrete]);

    let mut inference_env = InferenceEnvironment::new(&env);

    // The nested intersection should unnest during constraint collection
    nested_infer.collect_constraints(nested_concrete, &mut inference_env);

    // Should generate constraints between infer_var and number
    let constraints = inference_env.take_constraints();
    assert_sorted_eq!(
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

    // Set up generic arguments
    let arg1 = GenericArgumentId::new(0);
    let arg2 = GenericArgumentId::new(1);

    // Create generic parameter types
    let param1 = instantiate_param(&env, arg1);
    let param2 = instantiate_param(&env, arg2);

    // Create intersections with generic parameters
    intersection!(env, generic_a, [param1]);

    intersection!(env, generic_b, [param2]);

    let mut inference_env = InferenceEnvironment::new(&env);

    // Collect constraints between generic intersections
    generic_a.collect_constraints(generic_b, &mut inference_env);

    // Should generate an ordering constraint
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
fn collect_constraints_concrete_types_only() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create concrete types
    let number = primitive!(env, PrimitiveType::Number);
    let integer = primitive!(env, PrimitiveType::Integer);

    // Create intersections with only concrete types
    intersection!(env, concrete_a, [integer]);
    intersection!(env, concrete_b, [number]);

    let mut inference_env = InferenceEnvironment::new(&env);

    // Collect constraints between concrete intersections
    concrete_a.collect_constraints(concrete_b, &mut inference_env);

    // No variable constraints should be generated for concrete types
    assert!(inference_env.take_constraints().is_empty());
}

#[test]
fn collect_dependencies() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create an inference variable
    let hole = HoleId::new(0);
    let infer_var = instantiate_infer(&env, hole);

    // Create an intersection with an inference variable: infer_var & Number
    intersection!(
        env,
        basic_intersection,
        [infer_var, primitive!(env, PrimitiveType::Number)]
    );

    let mut inference_env = InferenceEnvironment::new(&env);

    // Create a variable to use as the source in a structural edge
    let variable = Variable::synthetic(VariableKind::Hole(HoleId::new(1)));

    // Collect structural edges
    inference_env.collect_dependencies(basic_intersection.id, variable);

    // Since intersections are covariant in all their variants, the flow is preserved
    // We expect source (_1) flowing to the infer_var (_0) within the intersection
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
fn collect_dependencies_multiple_infer_vars() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create multiple inference variables
    let hole1 = HoleId::new(0);
    let infer_var1 = instantiate_infer(&env, hole1);
    let hole2 = HoleId::new(1);
    let infer_var2 = instantiate_infer(&env, hole2);

    // Create an intersection with multiple inference variables: infer_var1 & infer_var2
    intersection!(env, multi_infer_intersection, [infer_var1, infer_var2]);

    let mut inference_env = InferenceEnvironment::new(&env);

    // Create a variable for the edge
    let variable = Variable::synthetic(VariableKind::Hole(HoleId::new(3)));

    // Collect structural edges
    inference_env.collect_dependencies(multi_infer_intersection.id, variable);

    // Since intersections are covariant, the source should flow to both variables
    // We expect:
    // 1. _3 -> _0
    // 2. _3 -> _1
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
fn collect_dependencies_nested_intersection() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create inference variables
    let hole_inner = HoleId::new(0);
    let infer_inner = instantiate_infer(&env, hole_inner);
    let hole_outer = HoleId::new(1);
    let infer_outer = instantiate_infer(&env, hole_outer);

    // Create an inner intersection: infer_inner & Number
    let inner_intersection =
        intersection!(env, [infer_inner, primitive!(env, PrimitiveType::Number)]);

    // Create an outer intersection: infer_outer & inner_intersection
    intersection!(env, outer_intersection, [infer_outer, inner_intersection]);

    let mut inference_env = InferenceEnvironment::new(&env);

    // Edge variable
    let variable = Variable::synthetic(VariableKind::Hole(HoleId::new(2)));

    // Collect structural edges for the outer intersection
    inference_env.collect_dependencies(outer_intersection.id, variable);

    // We expect:
    // 1. _2 -> _1 (source flows to outer infer var)
    // 2. _2 -> _0 (source flows to inner infer var through nested intersection)
    let constraints = inference_env.take_constraints();
    assert_eq!(
        constraints,
        [
            Constraint::Dependency {
                source: variable,
                target: Variable::synthetic(VariableKind::Hole(hole_outer)),
            },
            Constraint::Dependency {
                source: variable,
                target: Variable::synthetic(VariableKind::Hole(hole_inner)),
            }
        ]
    );
}

#[test]
fn collect_dependencies_empty_intersection() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create an empty intersection (Unknown type)
    intersection!(env, empty_intersection, []);

    let mut inference_env = InferenceEnvironment::new(&env);

    // Edge variable
    let variable = Variable::synthetic(VariableKind::Hole(HoleId::new(0)));

    // Collect structural edges for an empty intersection
    inference_env.collect_dependencies(empty_intersection.id, variable);

    // Empty intersection has no variants, so no edges should be collected
    let constraints = inference_env.take_constraints();
    assert!(constraints.is_empty());
}

#[test]
fn collect_dependencies_mixed_types() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create inference variables
    let hole1 = HoleId::new(0);
    let infer_var1 = instantiate_infer(&env, hole1);
    let hole2 = HoleId::new(1);
    let infer_var2 = instantiate_infer(&env, hole2);

    // Create a tuple with an inference variable
    let tuple_type = tuple!(env, [infer_var1]);

    // Create an intersection with mixed types: tuple & infer_var2
    intersection!(env, mixed_intersection, [tuple_type, infer_var2]);

    let mut inference_env = InferenceEnvironment::new(&env);

    // Edge variable
    let variable = Variable::synthetic(VariableKind::Hole(HoleId::new(3)));

    // Collect structural edges
    inference_env.collect_dependencies(mixed_intersection.id, variable);

    // Edges should be collected for all inference variables
    // We expect:
    // 1. _3 -> _0 (through the tuple)
    // 2. _3 -> _1 (direct to the second infer var)
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
fn simplify_recursive_intersection() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let r#type = env.types.intern(|id| PartialType {
        span: SpanId::SYNTHETIC,
        kind: env.intern_kind(TypeKind::Intersection(IntersectionType {
            variants: env.intern_type_ids(&[id.value()]),
        })),
    });

    let mut simplify = SimplifyEnvironment::new(&env);
    let type_id = simplify.simplify(r#type.id);

    let r#type = env.r#type(type_id);

    assert_matches!(r#type.kind, TypeKind::Unknown);
}

#[test]
fn simplify_recursive_intersection_multiple() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let r#type = env.types.intern(|id| PartialType {
        span: SpanId::SYNTHETIC,
        kind: env.intern_kind(TypeKind::Intersection(IntersectionType {
            variants: env.intern_type_ids(&[id.value(), primitive!(env, PrimitiveType::Integer)]),
        })),
    });

    let mut simplify = SimplifyEnvironment::new(&env);
    let type_id = simplify.simplify(r#type.id);

    let r#type = env.r#type(type_id);

    assert_matches!(r#type.kind, TypeKind::Primitive(PrimitiveType::Integer));
}

#[test]
fn is_bottom_recursive_intersection_multiple() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let r#type = env.types.intern(|id| PartialType {
        span: SpanId::SYNTHETIC,
        kind: env.intern_kind(TypeKind::Intersection(IntersectionType {
            variants: env.intern_type_ids(&[id.value(), primitive!(env, PrimitiveType::Integer)]),
        })),
    });

    let mut analysis = AnalysisEnvironment::new(&env);
    let is_bottom = analysis.is_bottom(r#type.id);
    assert!(!is_bottom);

    let r#type = env.types.intern(|id| PartialType {
        span: SpanId::SYNTHETIC,
        kind: env.intern_kind(TypeKind::Intersection(IntersectionType {
            variants: env.intern_type_ids(&[id.value(), instantiate(&env, TypeKind::Never)]),
        })),
    });

    let mut analysis = AnalysisEnvironment::new(&env);
    let is_bottom = analysis.is_bottom(r#type.id);
    assert!(is_bottom);
}

#[test]
fn instantiate_intersection() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let argument1 = env.counter.generic_argument.next();
    let argument2 = env.counter.generic_argument.next();

    let param1 = instantiate_param(&env, argument1);
    let param2 = instantiate_param(&env, argument2);

    let a = generic!(
        env,
        opaque!(env, "A", param1),
        [GenericArgument {
            id: argument1,
            name: heap.intern_symbol("T"),
            constraint: None
        }]
    );

    let b = generic!(
        env,
        opaque!(env, "A", param2),
        [GenericArgument {
            id: argument2,
            name: heap.intern_symbol("T"),
            constraint: None
        }]
    );

    intersection!(env, value, [a, b]);

    let mut instantiate = InstantiateEnvironment::new(&env);
    let type_id = value.instantiate(&mut instantiate);
    assert!(instantiate.take_diagnostics().is_empty());

    let result = env.r#type(type_id);
    let intersection = result
        .kind
        .intersection()
        .expect("should be an intersection");
    assert_eq!(intersection.variants.len(), 2);

    let generic_arguments = [argument1, argument2];

    for (index, &variant) in intersection.variants.iter().enumerate() {
        let variant = env.r#type(variant);
        let generic = variant.kind.generic().expect("should be a generic type");
        let opaque = env
            .r#type(generic.base)
            .kind
            .opaque()
            .expect("should be an opaque type");
        let repr = env
            .r#type(opaque.repr)
            .kind
            .param()
            .expect("should be a param");

        assert_eq!(generic.arguments.len(), 1);
        assert_eq!(
            *repr,
            Param {
                argument: generic.arguments[0].id
            }
        );
        assert_ne!(repr.argument, generic_arguments[index]);
    }
}

#[test]
fn projection_empty() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let intersection = intersection!(env, []);

    let mut lattice = LatticeEnvironment::new(&env);
    let projection = lattice.projection(intersection, Ident::synthetic(heap.intern_symbol("foo")));
    assert_eq!(projection, Projection::Error);

    let diagnostics = lattice.take_diagnostics().into_vec();
    assert_eq!(diagnostics.len(), 1);
    assert_eq!(
        diagnostics[0].category,
        TypeCheckDiagnosticCategory::UnsupportedProjection
    );
}

#[test]
fn projection_single_variant() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let string = primitive!(env, PrimitiveType::String);

    let intersection = intersection!(env, [r#struct!(env, [struct_field!(env, "foo", string)])]);

    let mut lattice = LatticeEnvironment::new(&env);
    let projection = lattice.projection(intersection, Ident::synthetic(heap.intern_symbol("foo")));
    assert_eq!(lattice.diagnostics.len(), 0);

    assert_eq!(projection, Projection::Resolved(string));
}

#[test]
fn projection_propagate_error() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let string = primitive!(env, PrimitiveType::String);
    let integer = primitive!(env, PrimitiveType::Integer);

    let intersection = intersection!(env, [integer, string]);

    let mut lattice = LatticeEnvironment::new(&env);
    let projection = lattice.projection(intersection, Ident::synthetic(heap.intern_symbol("foo")));
    assert_eq!(lattice.diagnostics.len(), 2);
    assert_eq!(projection, Projection::Error);
}

#[test]
fn projection_propagate_pending() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let string = primitive!(env, PrimitiveType::String);
    let hole = env.counter.hole.next();

    let intersection = intersection!(env, [instantiate_infer(&env, hole), string]);

    let mut lattice = LatticeEnvironment::new(&env);
    let projection = lattice.projection(intersection, Ident::synthetic(heap.intern_symbol("foo")));
    assert_eq!(lattice.diagnostics.len(), 1);
    assert_eq!(projection, Projection::Pending);
}

#[test]
fn projection_intersection_values() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let string = primitive!(env, PrimitiveType::String);
    let integer = primitive!(env, PrimitiveType::Integer);

    let intersection = intersection!(
        env,
        [
            r#struct!(env, [struct_field!(env, "foo", integer)]),
            r#struct!(env, [struct_field!(env, "foo", string)])
        ]
    );

    let mut lattice = LatticeEnvironment::new(&env);
    let projection = lattice.projection(intersection, Ident::synthetic(heap.intern_symbol("foo")));
    assert_eq!(lattice.diagnostics.len(), 0);
    let Projection::Resolved(id) = projection else {
        panic!("expected resolved projection")
    };

    assert_equiv!(env, [id], [intersection!(env, [integer, string])]);
}

#[test]
fn subscript_empty() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let intersection = intersection!(env, []);

    let mut lattice = LatticeEnvironment::new(&env);
    let mut inference = InferenceEnvironment::new(&env);

    let subscript = lattice.subscript(
        intersection,
        primitive!(env, PrimitiveType::String),
        &mut inference,
    );
    assert_eq!(subscript, Subscript::Error);

    let diagnostics = lattice.take_diagnostics().into_vec();
    assert_eq!(diagnostics.len(), 1);
    assert_eq!(
        diagnostics[0].category,
        TypeCheckDiagnosticCategory::UnsupportedSubscript
    );
}

#[test]
fn subscript_single_variant() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let string = primitive!(env, PrimitiveType::String);

    let intersection = intersection!(env, [list!(env, string)]);

    let mut lattice = LatticeEnvironment::new(&env);
    let mut inference = InferenceEnvironment::new(&env);

    let subscript = lattice.subscript(
        intersection,
        primitive!(env, PrimitiveType::Integer),
        &mut inference,
    );
    assert_eq!(lattice.diagnostics.len(), 0);

    assert_eq!(subscript, Subscript::Resolved(string));
}

#[test]
fn subscript_propagate_error() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let string = primitive!(env, PrimitiveType::String);
    let integer = primitive!(env, PrimitiveType::Integer);

    let intersection = intersection!(env, [integer, string]);

    let mut lattice = LatticeEnvironment::new(&env);
    let mut inference = InferenceEnvironment::new(&env);

    let subscript = lattice.subscript(
        intersection,
        primitive!(env, PrimitiveType::Integer),
        &mut inference,
    );
    assert_eq!(lattice.diagnostics.len(), 2);
    assert_eq!(subscript, Subscript::Error);

    let diagnostics = lattice.take_diagnostics().into_vec();
    assert_eq!(
        diagnostics[0].category,
        TypeCheckDiagnosticCategory::UnsupportedSubscript
    );
    assert_eq!(
        diagnostics[1].category,
        TypeCheckDiagnosticCategory::UnsupportedSubscript
    );
}

#[test]
fn subscript_propagate_pending() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let string = primitive!(env, PrimitiveType::String);
    let hole = env.counter.hole.next();

    let intersection = intersection!(env, [instantiate_infer(&env, hole), string]);

    let mut lattice = LatticeEnvironment::new(&env);
    let mut inference = InferenceEnvironment::new(&env);

    let subscript = lattice.subscript(
        intersection,
        primitive!(env, PrimitiveType::Integer),
        &mut inference,
    );
    assert_eq!(lattice.diagnostics.len(), 1);
    assert_eq!(subscript, Subscript::Pending);

    let diagnostics = lattice.take_diagnostics().into_vec();
    assert_eq!(
        diagnostics[0].category,
        TypeCheckDiagnosticCategory::UnsupportedSubscript
    );
}

#[test]
fn subscript_intersection_values() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let string = primitive!(env, PrimitiveType::String);
    let integer = primitive!(env, PrimitiveType::Integer);

    let intersection = intersection!(env, [list!(env, integer), dict!(env, integer, string)]);

    let mut lattice = LatticeEnvironment::new(&env);
    let mut inference = InferenceEnvironment::new(&env);

    let subscript = lattice.subscript(
        intersection,
        primitive!(env, PrimitiveType::Integer),
        &mut inference,
    );
    assert_eq!(lattice.diagnostics.len(), 0);
    let Subscript::Resolved(id) = subscript else {
        panic!("Expected Subscript::Resolved but got {subscript:?}");
    };

    assert_equiv!(env, [id], [intersection!(env, [integer, string])]);
}
