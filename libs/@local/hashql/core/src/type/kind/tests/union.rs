use core::assert_matches;

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
            Generic, OpaqueType, Param, StructType, TypeKind, UnionType,
            generic::{GenericArgument, GenericArgumentId},
            infer::HoleId,
            intersection::IntersectionType,
            intrinsic::{DictType, IntrinsicType, ListType},
            primitive::PrimitiveType,
            r#struct::StructField,
            test::{
                assert_equiv, dict, generic, intersection, list, opaque, primitive, r#struct,
                struct_field, tuple, union,
            },
            tuple::TupleType,
        },
        lattice::{Lattice as _, Projection, Subscript, test::assert_lattice_laws},
        tests::{instantiate, instantiate_infer, instantiate_param, scaffold},
    },
};

#[test]
fn unnest_flattens_nested_unions() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create a union type with a nested union
    let number = primitive!(env, PrimitiveType::Number);
    let string = primitive!(env, PrimitiveType::String);
    let boolean = primitive!(env, PrimitiveType::Boolean);

    // Create a nested union: (String | Boolean)
    let nested_union = union!(env, [string, boolean]);

    // Create a union that includes the nested union: Number | (String | Boolean)
    union!(env, union_type, [number, nested_union]);

    // Unnesting should flatten to: Number | String | Boolean
    let unnested = union_type.unnest(&env);

    assert_eq!(unnested.len(), 3);
    assert!(unnested.contains(&number));
    assert!(unnested.contains(&string));
    assert!(unnested.contains(&boolean));
}

#[test]
fn unnest_nested_recursive_union() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let r#type = env.types.intern(|id| PartialType {
        span: SpanId::SYNTHETIC,
        kind: env.intern_kind(TypeKind::Union(UnionType {
            variants: env.intern_type_ids(&[env.intern_type(PartialType {
                span: SpanId::SYNTHETIC,
                kind: env.intern_kind(TypeKind::Union(UnionType {
                    variants: env.intern_type_ids(&[id.value()]),
                })),
            })]),
        })),
    });

    let union = r#type.kind.union().expect("should be a union");
    let unnested = r#type.with(union).unnest(&env);

    assert_equiv!(env, unnested, [instantiate(&env, TypeKind::Unknown)]);
}

#[test]
fn join_identical_unions() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    union!(
        env,
        a,
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String)
        ]
    );
    union!(
        env,
        b,
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String)
        ]
    );

    let mut lattice_env = LatticeEnvironment::new(&env);

    // Join identical unions should result in the same union
    assert_equiv!(
        env,
        a.join(b, &mut lattice_env),
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String),
        ]
    );
}

#[test]
fn join_recursive_unions() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    union!(
        env,
        a,
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String)
        ]
    );

    let b = env.types.intern(|id| PartialType {
        span: SpanId::SYNTHETIC,
        kind: env.intern_kind(TypeKind::Union(UnionType {
            variants: env.intern_type_ids(&[id.value(), primitive!(env, PrimitiveType::Number)]),
        })),
    });

    let mut lattice_env = LatticeEnvironment::new(&env);

    assert_equiv!(
        env,
        [lattice_env.join(a.id, b.id)],
        [instantiate(&env, TypeKind::Unknown)]
    );
}

#[test]
fn join_different_unions() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create different union types
    union!(
        env,
        a,
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String)
        ]
    );
    union!(
        env,
        b,
        [
            primitive!(env, PrimitiveType::Boolean),
            primitive!(env, PrimitiveType::Null)
        ]
    );

    let mut lattice_env = LatticeEnvironment::new(&env);

    // Join different unions should include all variants
    assert_equiv!(
        env,
        a.join(b, &mut lattice_env),
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String),
            primitive!(env, PrimitiveType::Boolean),
            primitive!(env, PrimitiveType::Null),
        ]
    );
}

#[test]
fn join_with_empty_union() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create an empty union (Never) and a non-empty union
    union!(env, empty, []);
    union!(
        env,
        non_empty,
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String),
        ]
    );

    let mut lattice_env = LatticeEnvironment::new(&env);

    // Empty union joined with any union should be the other union
    assert_equiv!(
        env,
        empty.join(non_empty, &mut lattice_env),
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String),
        ]
    );

    // The reverse should also be true
    assert_equiv!(
        env,
        non_empty.join(empty, &mut lattice_env),
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String),
        ]
    );
}

#[test]
fn join_with_overlapping_unions() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create overlapping unions
    union!(
        env,
        a,
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String)
        ]
    );
    union!(
        env,
        b,
        [
            primitive!(env, PrimitiveType::String),
            primitive!(env, PrimitiveType::Boolean)
        ]
    );

    let mut lattice_env = LatticeEnvironment::new(&env);

    // Join without simplification should lead to a union with all variants
    assert_equiv!(
        env,
        a.join(b, &mut lattice_env),
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String),
            primitive!(env, PrimitiveType::Boolean),
        ]
    );
}

#[test]
fn meet_disjoint_unions() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create disjoint unions (no common variants)
    union!(
        env,
        a,
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String)
        ]
    );
    union!(
        env,
        b,
        [
            primitive!(env, PrimitiveType::Boolean),
            primitive!(env, PrimitiveType::Null)
        ]
    );

    let mut lattice_env = LatticeEnvironment::new(&env);
    lattice_env.without_simplify();

    // Should have 4 combinations: Number & Boolean, Number & Null, String & Boolean, String &
    // Null These will be represented as intersection types in the result
    // Meet should result in pairwise combinations
    assert_equiv!(
        env,
        a.meet(b, &mut lattice_env),
        [union!(
            env,
            [
                intersection!(
                    env,
                    [
                        primitive!(env, PrimitiveType::Number),
                        primitive!(env, PrimitiveType::Boolean)
                    ]
                ),
                intersection!(
                    env,
                    [
                        primitive!(env, PrimitiveType::Number),
                        primitive!(env, PrimitiveType::Null)
                    ]
                ),
                intersection!(
                    env,
                    [
                        primitive!(env, PrimitiveType::String),
                        primitive!(env, PrimitiveType::Boolean)
                    ]
                ),
                intersection!(
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
fn meet_identical_unions() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    union!(
        env,
        a,
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String)
        ]
    );
    union!(
        env,
        b,
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String)
        ]
    );

    let mut lattice_env = LatticeEnvironment::new(&env);

    // Meet identical unions should result in the same union
    assert_equiv!(
        env,
        a.meet(b, &mut lattice_env),
        [union!(
            env,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String),
                instantiate(&env, TypeKind::Never),
                instantiate(&env, TypeKind::Never)
            ]
        )]
    );
}

#[test]
fn meet_with_empty_union() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create an empty union (Never) and a non-empty union
    union!(env, empty, []);
    union!(
        env,
        non_empty,
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String)
        ]
    );

    let mut lattice_env = LatticeEnvironment::new(&env);

    // Empty union met with any union should be empty
    assert_equiv!(
        env,
        empty.meet(non_empty, &mut lattice_env),
        [union!(env, [])]
    );

    // The reverse should also be true
    assert_equiv!(
        env,
        non_empty.meet(empty, &mut lattice_env),
        [union!(env, [])]
    );
}

#[test]
fn meet_subtype_supertype() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create a union with Number and another with Integer (where Integer <: Number)
    let number = primitive!(env, PrimitiveType::Number);
    let integer = primitive!(env, PrimitiveType::Integer);
    let string = primitive!(env, PrimitiveType::String);

    union!(env, number_union, [number, string]);
    union!(env, integer_union, [integer, string]);

    let mut lattice_env = LatticeEnvironment::new(&env);

    // Meet should retain the subtype in the result
    assert_equiv!(
        env,
        number_union.meet(integer_union, &mut lattice_env),
        [union!(
            env,
            [
                integer,
                string,
                instantiate(&env, TypeKind::Never),
                instantiate(&env, TypeKind::Never)
            ]
        )]
    );
}

#[test]
fn is_bottom() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Empty union (Never)
    union!(env, empty, []);

    // Non-empty union
    union!(env, non_empty, [primitive!(env, PrimitiveType::Number)]);

    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Empty union should be bottom (uninhabited)
    assert!(empty.is_bottom(&mut analysis_env));

    // Non-empty union should not be bottom
    assert!(!non_empty.is_bottom(&mut analysis_env));
}

#[test]
fn is_top() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Regular union
    union!(
        env,
        regular,
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String)
        ]
    );

    // Union containing top type (Unknown)
    let unknown = instantiate(&env, TypeKind::Unknown);
    union!(
        env,
        with_top,
        [unknown, primitive!(env, PrimitiveType::String)]
    );

    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Regular union should not be top
    assert!(!regular.is_top(&mut analysis_env));

    // Union with Unknown should be considered top
    assert!(with_top.is_top(&mut analysis_env));
}

#[test]
fn is_subtype_of_self() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create a union type
    union!(
        env,
        union_type,
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String)
        ]
    );

    let mut analysis_env = AnalysisEnvironment::new(&env);

    // A union should be a subtype of itself (reflexivity)
    assert!(union_type.is_subtype_of(union_type, &mut analysis_env));
}

#[test]
fn empty_union_is_subtype_of_all() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Empty union (Never)
    union!(env, empty, []);

    // Non-empty union
    union!(env, non_empty, [primitive!(env, PrimitiveType::Number)]);

    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Empty union should be a subtype of any other union
    assert!(empty.is_subtype_of(non_empty, &mut analysis_env));
}

#[test]
fn covariant_union_is_subtype() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Dict<String, Number>
    dict!(
        env,
        dict_string_number,
        primitive!(env, PrimitiveType::String),
        primitive!(env, PrimitiveType::Number)
    );

    // Dict<String, Number | String>
    dict!(
        env,
        dict_string_number_string,
        primitive!(env, PrimitiveType::String),
        union!(
            env,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        )
    );

    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Dict<String, Number> <: Dict<String, Number | String>
    assert!(dict_string_number.is_subtype_of(dict_string_number_string, &mut analysis_env));
}

#[test]
fn covariant_union_equivalence() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Dict<String, Number> | Dict<String, String>
    let union_dict_string_number_string = union!(
        env,
        [
            dict!(
                env,
                primitive!(env, PrimitiveType::String),
                primitive!(env, PrimitiveType::Number)
            ),
            dict!(
                env,
                primitive!(env, PrimitiveType::String),
                primitive!(env, PrimitiveType::String)
            )
        ]
    );

    // Dict<String, Number | String>
    let dict_string_number_string = dict!(
        env,
        primitive!(env, PrimitiveType::String),
        union!(
            env,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        )
    );

    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Dict<String, Number> | Dict<String, Number> = Dict<String, Number | String>
    assert!(analysis_env.is_equivalent(union_dict_string_number_string, dict_string_number_string));
    assert!(analysis_env.is_equivalent(dict_string_number_string, union_dict_string_number_string));
}

#[test]
fn union_equivalence_with_different_variant_counts() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Dict<String, Boolean>
    let dict_string_boolean = dict!(
        env,
        primitive!(env, PrimitiveType::String),
        primitive!(env, PrimitiveType::Boolean)
    );

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

    // Dict<Number, Boolean | String>
    let dict_number_boolean_string = dict!(
        env,
        primitive!(env, PrimitiveType::Number),
        union!(
            env,
            [
                primitive!(env, PrimitiveType::Boolean),
                primitive!(env, PrimitiveType::String)
            ]
        )
    );

    // Create the two union types we want to compare:
    // Type 1: Dict<String, Boolean> | Dict<Number, Boolean | String>
    union!(
        env,
        type1,
        [dict_string_boolean, dict_number_boolean_string]
    );

    // Type 2: Dict<String, Boolean> | Dict<Number, Boolean> | Dict<Number, String>
    union!(
        env,
        type2,
        [dict_string_boolean, dict_number_boolean, dict_number_string]
    );

    let mut analysis_env = AnalysisEnvironment::new(&env);

    // These types should be equivalent despite having different variant counts
    assert!(type1.is_equivalent(type2, &mut analysis_env));
    assert!(type2.is_equivalent(type1, &mut analysis_env));
}

#[test]
fn union_equivalence_non_equivalent_different_counts() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create some basic types
    let number = primitive!(env, PrimitiveType::Number);
    let string = primitive!(env, PrimitiveType::String);
    let boolean = primitive!(env, PrimitiveType::Boolean);
    let null = primitive!(env, PrimitiveType::Null);

    // Create a union with 2 variants
    union!(env, type1, [number, string]);

    // Create a union with 3 variants, adding a type not covered by type1
    union!(env, type2, [number, string, boolean]);

    // Create another union with 3 variants but equivalent to type1 + a null type
    union!(env, type3, [number, string, null]);

    let mut analysis_env = AnalysisEnvironment::new(&env);

    // These should not be equivalent (boolean is not covered by type1)
    assert!(!type1.is_equivalent(type2, &mut analysis_env));
    assert!(!type2.is_equivalent(type1, &mut analysis_env));

    // These should also not be equivalent (null is not covered by type1)
    assert!(!type1.is_equivalent(type3, &mut analysis_env));
    assert!(!type3.is_equivalent(type1, &mut analysis_env));
}

#[test]
fn no_union_is_subtype_of_never() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Empty union (Never)
    union!(env, empty, []);

    // Non-empty union
    union!(env, non_empty, [primitive!(env, PrimitiveType::Number)]);

    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Non-empty union should not be a subtype of empty union
    assert!(!non_empty.is_subtype_of(empty, &mut analysis_env));
}

#[test]
fn subtype_supertype_relation() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create a union with Number and String
    let number = primitive!(env, PrimitiveType::Number);
    let string = primitive!(env, PrimitiveType::String);
    union!(env, number_string, [number, string]);

    // Create a union with Integer (subtype of Number) and String
    let integer = primitive!(env, PrimitiveType::Integer);
    union!(env, integer_string, [integer, string]);

    // Create a union with just Number
    union!(env, just_number, [number]);

    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Integer | String should be a subtype of Number | String
    assert!(integer_string.is_subtype_of(number_string, &mut analysis_env));

    // Number | String should not be a subtype of Integer | String
    assert!(!number_string.is_subtype_of(integer_string, &mut analysis_env));

    // Number should be a subtype of Number | String
    assert!(just_number.is_subtype_of(number_string, &mut analysis_env));

    // Number | String should not be a subtype of Number
    assert!(!number_string.is_subtype_of(just_number, &mut analysis_env));
}

#[test]
fn is_equivalent() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create identical unions (but at different type IDs)
    union!(
        env,
        a,
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String)
        ]
    );
    union!(
        env,
        b,
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String)
        ]
    );

    // Create a union with same types in different order
    union!(
        env,
        c,
        [
            primitive!(env, PrimitiveType::String),
            primitive!(env, PrimitiveType::Number)
        ]
    );

    // Create a union with different types
    union!(
        env,
        d,
        [
            primitive!(env, PrimitiveType::Boolean),
            primitive!(env, PrimitiveType::Number)
        ]
    );

    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Same unions should be equivalent
    assert!(a.is_equivalent(b, &mut analysis_env));

    // Order shouldn't matter for equivalence
    assert!(a.is_equivalent(c, &mut analysis_env));

    // Different unions should not be equivalent
    assert!(!a.is_equivalent(d, &mut analysis_env));
}

#[test]
fn empty_union_equivalence() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create two empty unions
    union!(env, a, []);
    union!(env, b, []);

    // Create a non-empty union
    union!(env, c, [primitive!(env, PrimitiveType::Number)]);

    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Empty unions should be equivalent to each other
    assert!(a.is_equivalent(b, &mut analysis_env));

    // Empty union should not be equivalent to non-empty union
    assert!(!a.is_equivalent(c, &mut analysis_env));
}

#[test]
fn simplify_identical_variants() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create a union with duplicate variants
    union!(
        env,
        union_type,
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::Number)
        ]
    );

    let mut simplify_env = SimplifyEnvironment::new(&env);

    // Simplifying should collapse duplicates
    let result = union_type.simplify(&mut simplify_env);
    let result_type = env.r#type(result);

    // Result should be just Number, not a union
    assert_matches!(
        *result_type.kind,
        TypeKind::Primitive(PrimitiveType::Number)
    );
}

#[test]
fn simplify_nested_unions() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create nested unions
    let nested = union!(env, [primitive!(env, PrimitiveType::Number)]);
    union!(
        env,
        union_type,
        [nested, primitive!(env, PrimitiveType::String)]
    );

    let mut simplify_env = SimplifyEnvironment::new(&env);

    // Simplifying should flatten nested unions
    assert_equiv!(
        env,
        [union_type.simplify(&mut simplify_env)],
        [union!(
            env,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        )]
    );
}

#[test]
fn simplify_with_bottom() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create a union with a never type
    union!(
        env,
        union_type,
        [
            instantiate(&env, TypeKind::Never),
            primitive!(env, PrimitiveType::Number)
        ]
    );

    let mut simplify_env = SimplifyEnvironment::new(&env);

    // Simplifying should remove the Never type
    let result = union_type.simplify(&mut simplify_env);
    let result_type = env.r#type(result);

    // Result should be just Number, not a union
    assert!(matches!(
        *result_type.kind,
        TypeKind::Primitive(PrimitiveType::Number)
    ));
}

#[test]
fn simplify_with_top() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create a union with a top (Unknown) type
    union!(
        env,
        union_type,
        [
            instantiate(&env, TypeKind::Unknown),
            primitive!(env, PrimitiveType::Number)
        ]
    );

    let mut simplify_env = SimplifyEnvironment::new(&env);

    // Simplifying should collapse to the top type
    let result = union_type.simplify(&mut simplify_env);
    let result_type = env.r#type(result);

    // Result should be Unknown
    assert!(matches!(*result_type.kind, TypeKind::Unknown));
}

#[test]
fn simplify_empty_union() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create an empty union
    union!(env, union_type, []);

    let mut simplify_env = SimplifyEnvironment::new(&env);

    // Simplifying empty union should result in Never
    let result = union_type.simplify(&mut simplify_env);
    let result_type = env.r#type(result);

    assert!(matches!(*result_type.kind, TypeKind::Never));
}

#[test]
fn simplify_with_subtypes() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create a union with a type and its subtype
    let number = primitive!(env, PrimitiveType::Number);
    let integer = primitive!(env, PrimitiveType::Integer); // Integer is a subtype of Number
    union!(env, union_type, [number, integer]);

    let mut simplify_env = SimplifyEnvironment::new(&env);

    // Simplifying should remove the subtype
    let result = union_type.simplify(&mut simplify_env);
    let result_type = env.r#type(result);

    // Result should be just Number
    assert!(matches!(
        *result_type.kind,
        TypeKind::Primitive(PrimitiveType::Number)
    ));
}

#[test]
fn lattice_laws() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create three distinct union types for testing lattice laws
    let a = union!(env, [primitive!(env, PrimitiveType::Number)]);
    let b = union!(env, [primitive!(env, PrimitiveType::String)]);
    let c = union!(env, [primitive!(env, PrimitiveType::Boolean)]);

    // Test that union types satisfy lattice laws (associativity, commutativity, absorption)
    assert_lattice_laws(&env, a, b, c);
}

#[test]
fn is_concrete() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Concrete union (with all concrete variants)
    let number = primitive!(env, PrimitiveType::Number);
    let string = primitive!(env, PrimitiveType::String);
    union!(env, concrete_union, [number, string]);
    assert!(concrete_union.is_concrete(&mut analysis_env));

    // Non-concrete union (with at least one non-concrete variant)
    let infer_var = instantiate_infer(&env, 0_u32);
    union!(env, non_concrete_union, [number, infer_var]);
    assert!(!non_concrete_union.is_concrete(&mut analysis_env));

    // Empty union should be concrete
    union!(env, empty_union, []);
    assert!(empty_union.is_concrete(&mut analysis_env));

    // Nested non-concrete union
    union!(
        env,
        nested_union,
        [concrete_union.id, non_concrete_union.id]
    );
    assert!(!nested_union.is_concrete(&mut analysis_env));
}

#[test]
fn complex_union_relationships() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create various types to use in unions
    let number = primitive!(env, PrimitiveType::Number);
    let integer = primitive!(env, PrimitiveType::Integer);
    let string = primitive!(env, PrimitiveType::String);
    let boolean = primitive!(env, PrimitiveType::Boolean);

    // Number | String
    union!(env, number_string, [number, string]);

    // Integer | String
    union!(env, integer_string, [integer, string]);

    // Number | Boolean
    union!(env, number_boolean, [number, boolean]);

    // Number | Integer
    union!(env, number_integer, [number, integer]);

    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Integer | String <: Number | String (because Integer <: Number)
    assert!(integer_string.is_subtype_of(number_string, &mut analysis_env));

    // Number | String ≮: Integer | String
    assert!(!number_string.is_subtype_of(integer_string, &mut analysis_env));

    // Number | Boolean ≮: Number | String
    assert!(!number_boolean.is_subtype_of(number_string, &mut analysis_env));

    // No subtype relationship between Number | Boolean and Integer | String
    assert!(!number_boolean.is_subtype_of(integer_string, &mut analysis_env));
    assert!(!integer_string.is_subtype_of(number_boolean, &mut analysis_env));

    // Number | Integer simplifies to just Number
    let mut simplify_env = SimplifyEnvironment::new(&env);
    let simplified = number_integer.simplify(&mut simplify_env);
    let simplified_type = env.r#type(simplified);
    assert!(matches!(
        *simplified_type.kind,
        TypeKind::Primitive(PrimitiveType::Number)
    ));
}

#[test]
fn union_with_tuple_types() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create tuple types
    let tuple1 = tuple!(env, [primitive!(env, PrimitiveType::Number)]);
    let tuple2 = tuple!(env, [primitive!(env, PrimitiveType::String)]);

    // Create a union of tuple types
    union!(env, union_type, [tuple1, tuple2]);

    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Union operations should work with non-primitive types as well
    assert!(!union_type.is_bottom(&mut analysis_env));
    assert!(!union_type.is_top(&mut analysis_env));

    // Test subtyping with tuples in unions
    let subtype_tuple = tuple!(env, [primitive!(env, PrimitiveType::Integer)]); // (Integer) <: (Number)
    union!(env, subtype_union, [subtype_tuple, tuple2]);

    assert!(subtype_union.is_subtype_of(union_type, &mut analysis_env));
    assert!(!union_type.is_subtype_of(subtype_union, &mut analysis_env));
}

#[test]
fn collect_constraints_empty_empty() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create two empty unions (Never type)
    union!(env, empty_a, []);
    union!(env, empty_b, []);

    let mut inference_env = InferenceEnvironment::new(&env);

    // Never <: Never
    empty_a.collect_constraints(empty_b, &mut inference_env);

    // No constraints should be generated for this trivial case
    let constraints = inference_env.take_constraints();
    assert!(constraints.is_empty());
}

#[test]
fn collect_constraints_empty_subtype() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Empty union (Never) as subtype
    union!(env, empty, []);

    // Some concrete union as supertype
    let hole = HoleId::new(0);
    let infer = instantiate_infer(&env, hole);
    union!(env, concrete, [infer]);

    let mut inference_env = InferenceEnvironment::new(&env);

    // Never <: Number
    empty.collect_constraints(concrete, &mut inference_env);

    // No constraints should be generated as Never is subtype of everything
    let constraints = inference_env.take_constraints();
    assert!(constraints.is_empty());
}

#[test]
fn collect_constraints_empty_supertype() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Some concrete union as subtype
    let hole = HoleId::new(0);
    let infer = instantiate_infer(&env, hole);
    union!(env, concrete, [infer]);

    // Empty union (Never) as supertype
    union!(env, empty, []);

    let mut inference_env = InferenceEnvironment::new(&env);

    // Number <: Never
    concrete.collect_constraints(empty, &mut inference_env);

    // Should generate constraint: Number <: Never
    let constraints = inference_env.take_constraints();
    assert_eq!(constraints.len(), 1);
    assert_matches!(
        &constraints[0],
        Constraint::UpperBound { variable: Variable { span: SpanId::SYNTHETIC, kind: VariableKind::Hole(bound_hole) }, bound } if {
            let bound_type = env.r#type(*bound).kind;
            matches!(bound_type, TypeKind::Never) && *bound_hole == hole
        }
    );
}

#[test]
fn collect_constraints_inference_variable_subtype() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create an inference variable
    let hole = HoleId::new(0);
    let infer_var = instantiate_infer(&env, hole);

    // Union with inference variable as subtype
    union!(env, infer_union, [infer_var]);

    // Concrete union as supertype
    let number = primitive!(env, PrimitiveType::Number);
    let string = primitive!(env, PrimitiveType::String);
    union!(env, concrete_union, [number, string]);

    let mut inference_env = InferenceEnvironment::new(&env);

    // ?T <: (Number | String)
    infer_union.collect_constraints(concrete_union, &mut inference_env);

    // Should generate an upper bound constraint
    let constraints = inference_env.take_constraints();
    assert_eq!(constraints.len(), 1);
    assert_matches!(
        &constraints[0],
        Constraint::UpperBound {
            variable: Variable {span: SpanId::SYNTHETIC, kind: VariableKind::Hole(h)},
            bound
        } if *h == hole && *bound == concrete_union.id
    );
}

#[test]
fn collect_constraints_inference_variable_supertype() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create an inference variable
    let hole = HoleId::new(0);
    let infer_var = instantiate_infer(&env, hole);

    // Concrete union as subtype
    let number = primitive!(env, PrimitiveType::Number);
    union!(env, concrete_union, [number]);

    // Union with inference variable as supertype
    union!(env, infer_union, [infer_var]);

    let mut inference_env = InferenceEnvironment::new(&env);

    // Number <: ?T
    concrete_union.collect_constraints(infer_union, &mut inference_env);

    // Should generate a constraint for Number <: ?T
    let constraints = inference_env.take_constraints();
    assert_eq!(constraints.len(), 1);
    assert_matches!(
        &constraints[0],
        Constraint::LowerBound {
            variable: Variable {span: SpanId::SYNTHETIC, kind: VariableKind::Hole(h)},
            bound
        } if *h == hole && *bound == number
    );
}

#[test]
fn collect_constraints_multiple_variants_subtype() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create inference variables
    let hole_a = HoleId::new(0);
    let infer_a = instantiate_infer(&env, hole_a);
    let hole_b = HoleId::new(1);
    let infer_b = instantiate_infer(&env, hole_b);

    // Create concrete type
    let number = primitive!(env, PrimitiveType::Number);

    // Create union with multiple inference variables
    union!(env, infer_union, [infer_a, infer_b]);

    // Create single-variant union
    union!(env, concrete_union, [number]);

    let mut inference_env = InferenceEnvironment::new(&env);

    // (?T0 | ?T1) <: Number
    infer_union.collect_constraints(concrete_union, &mut inference_env);

    // Both variables should have an upper bound of Number
    let constraints = inference_env.take_constraints();
    assert_eq!(constraints.len(), 2);

    let constraints_contain = |expected, bound| {
        constraints.iter().any(|c| matches!(
                c,
                Constraint::UpperBound { variable, bound: b } if *variable == expected && *b == bound
            ))
    };

    assert!(constraints_contain(
        Variable::synthetic(VariableKind::Hole(hole_a)),
        number
    ));
    assert!(constraints_contain(
        Variable::synthetic(VariableKind::Hole(hole_b)),
        number
    ));
}

#[test]
fn collect_constraints_multiple_variants_supertype() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create inference variable
    let hole = HoleId::new(0);
    let infer_var = instantiate_infer(&env, hole);

    // Create single-variant union with inference variable
    union!(env, infer_union, [infer_var]);

    // Create concrete union with multiple variants
    let number = primitive!(env, PrimitiveType::Number);
    let string = primitive!(env, PrimitiveType::String);
    union!(env, concrete_union, [number, string]);

    let mut inference_env = InferenceEnvironment::new(&env);

    // ?T <: (Number | String)
    infer_union.collect_constraints(concrete_union, &mut inference_env);

    // Should generate a constraint ?T <: (Number | String)
    let constraints = inference_env.take_constraints();
    assert_eq!(constraints.len(), 1);
    assert_matches!(
        &constraints[0],
        Constraint::UpperBound {
            variable: Variable { span: SpanId::SYNTHETIC, kind: VariableKind::Hole(h) },
            bound
        } if *h == hole && *bound == concrete_union.id
    );
}

#[test]
fn collect_constraints_nested_union() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create inference variable
    let hole = HoleId::new(0);
    let infer_var = instantiate_infer(&env, hole);

    // Create a nested union with inference variable
    let inner_infer = union!(env, [infer_var]);
    union!(env, nested_infer, [inner_infer]);

    // Create a concrete nested union
    let number = primitive!(env, PrimitiveType::Number);
    let inner_concrete = union!(env, [number]);
    union!(env, nested_concrete, [inner_concrete]);

    let mut inference_env = InferenceEnvironment::new(&env);

    // The nested union should unnest during constraint collection
    nested_infer.collect_constraints(nested_concrete, &mut inference_env);

    // Should generate constraint between infer_var and number
    let constraints = inference_env.take_constraints();
    assert_eq!(constraints.len(), 1);
    assert_matches!(
        &constraints[0],
        Constraint::UpperBound {
            variable: Variable { span: SpanId::SYNTHETIC, kind: VariableKind::Hole(h) },
            bound
        } if *h == hole && *bound == number
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

    // Create unions with generic parameters
    union!(env, generic_a, [param1]);
    union!(env, generic_b, [param2]);

    let mut inference_env = InferenceEnvironment::new(&env);

    // Collect constraints between generic unions
    generic_a.collect_constraints(generic_b, &mut inference_env);

    // Should generate an ordering constraint
    let constraints = inference_env.take_constraints();
    assert_eq!(constraints.len(), 1);
    assert_matches!(
        &constraints[0],
        Constraint::Ordering {
            lower: Variable { span: SpanId::SYNTHETIC, kind: VariableKind::Generic(l) },
            upper: Variable { span: SpanId::SYNTHETIC, kind: VariableKind::Generic(u) },
        } if *l == arg1 && *u == arg2
    );
}

#[test]
fn collect_constraints_concrete_types_only() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create concrete types
    let number = primitive!(env, PrimitiveType::Number);
    let integer = primitive!(env, PrimitiveType::Integer);

    // Create unions with only concrete types
    union!(env, concrete_a, [integer]);
    union!(env, concrete_b, [number]);

    let mut inference_env = InferenceEnvironment::new(&env);

    // Collect constraints between concrete unions
    concrete_a.collect_constraints(concrete_b, &mut inference_env);

    // No variable constraints should be generated for concrete types
    assert!(inference_env.take_constraints().is_empty());
}

#[test]
fn collect_constraints_mixed_variants() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create concrete type and inference variable
    let number = primitive!(env, PrimitiveType::Number);
    let hole = HoleId::new(0);
    let infer_var = instantiate_infer(&env, hole);

    // Create a union with mixed concrete and inference vars
    union!(env, mixed_union, [number, infer_var]);

    // Create concrete union as supertype
    let string = primitive!(env, PrimitiveType::String);
    let boolean = primitive!(env, PrimitiveType::Boolean);
    union!(env, concrete_union, [string, boolean]);

    let mut inference_env = InferenceEnvironment::new(&env);

    // (Number | ?T) <: (String | Boolean)
    mixed_union.collect_constraints(concrete_union, &mut inference_env);

    // Should generate constraints for both Number and ?T
    let constraints = inference_env.take_constraints();
    assert_eq!(constraints.len(), 1);

    // The ?T should get constrained to (String | Boolean)
    assert!(constraints.iter().any(|c| matches!(
        c,
        Constraint::UpperBound {
            variable: Variable { span: SpanId::SYNTHETIC, kind: VariableKind::Hole(h) },
            bound
        } if *h == hole && *bound == concrete_union.id
    )));
}

#[test]
fn collect_constraints_with_intersection() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create an inference variable
    let hole = HoleId::new(0);
    let infer_var = instantiate_infer(&env, hole);

    // Create a union with an inference var
    union!(env, union_with_infer, [infer_var]);

    // Create an intersection of concrete types as supertype
    let number = primitive!(env, PrimitiveType::Number);
    let string = primitive!(env, PrimitiveType::String);
    let intersection_type = intersection!(env, [number, string]);
    union!(env, union_with_intersection, [intersection_type]);

    let mut inference_env = InferenceEnvironment::new(&env);

    // ?T <: (Number & String)
    union_with_infer.collect_constraints(union_with_intersection, &mut inference_env);

    // Should generate a constraint from the inference var to the intersection
    let constraints = inference_env.take_constraints();
    assert_eq!(constraints.len(), 2);
    assert_matches!(
        &constraints[0],
        Constraint::UpperBound {
            variable: Variable { span: SpanId::SYNTHETIC, kind: VariableKind::Hole(h) },
            bound
        } if *h == hole && *bound == number
    );
    assert_matches!(
        &constraints[1],
        Constraint::UpperBound {
            variable: Variable { span: SpanId::SYNTHETIC, kind: VariableKind::Hole(h) },
            bound
        } if *h == hole && *bound == string
    );
}

#[test]
fn collect_dependencies() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create inference variables for union variants
    let hole1 = HoleId::new(0);
    let infer_var1 = instantiate_infer(&env, hole1);
    let hole2 = HoleId::new(1);
    let infer_var2 = instantiate_infer(&env, hole2);

    // Create a union with inference variables: _0 | _1
    union!(env, union_type, [infer_var1, infer_var2]);

    let mut inference_env = InferenceEnvironment::new(&env);

    // Create a variable to use as the source in a structural edge
    // This puts the union on the RIGHT side of the edge
    let variable = Variable::synthetic(VariableKind::Hole(HoleId::new(2)));

    // Collect structural edges
    inference_env.collect_dependencies(union_type.id, variable);

    // When union is on the right side (source), no edges should be collected
    // This is because a union on the right side would create an "or" constraint
    // which isn't well-defined for structural edges
    let constraints = inference_env.take_constraints();
    assert_eq!(
        constraints,
        [
            Constraint::Dependency {
                source: variable,
                target: Variable::synthetic(VariableKind::Hole(hole1))
            },
            Constraint::Dependency {
                source: variable,
                target: Variable::synthetic(VariableKind::Hole(hole2))
            }
        ]
    );
}

#[test]
fn simplify_recursive_union() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let r#type = env.types.intern(|id| PartialType {
        span: SpanId::SYNTHETIC,
        kind: env.intern_kind(TypeKind::Union(UnionType {
            variants: env.intern_type_ids(&[id.value()]),
        })),
    });

    let mut simplify = SimplifyEnvironment::new(&env);
    let type_id = simplify.simplify(r#type.id);

    let r#type = env.r#type(type_id);

    assert_matches!(r#type.kind, TypeKind::Unknown);
}

#[test]
fn simplify_recursive_union_multiple_elements() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let r#type = env.types.intern(|id| PartialType {
        span: SpanId::SYNTHETIC,
        kind: env.intern_kind(TypeKind::Union(UnionType {
            variants: env.intern_type_ids(&[id.value(), primitive!(env, PrimitiveType::Number)]),
        })),
    });

    let mut simplify = SimplifyEnvironment::new(&env);
    let type_id = simplify.simplify(r#type.id);

    let r#type = env.r#type(type_id);

    assert_matches!(r#type.kind, TypeKind::Unknown);
}

#[test]
fn instantiate_union() {
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

    union!(env, value, [a, b]);

    let mut instantiate = InstantiateEnvironment::new(&env);
    let type_id = value.instantiate(&mut instantiate);
    assert!(instantiate.take_diagnostics().is_empty());

    let result = env.r#type(type_id);
    let union = result.kind.union().expect("should be a union");
    assert_eq!(union.variants.len(), 2);

    let generic_arguments = [argument1, argument2];

    for (index, &variant) in union.variants.iter().enumerate() {
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

    let union = union!(env, []);

    let mut lattice = LatticeEnvironment::new(&env);
    let projection = lattice.projection(union, Ident::synthetic(heap.intern_symbol("foo")));
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

    let union = union!(env, [r#struct!(env, [struct_field!(env, "foo", string)])]);

    let mut lattice = LatticeEnvironment::new(&env);
    let projection = lattice.projection(union, Ident::synthetic(heap.intern_symbol("foo")));
    assert_eq!(lattice.diagnostics.len(), 0);

    assert_eq!(projection, Projection::Resolved(string));
}

#[test]
fn projection_propagate_error() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let string = primitive!(env, PrimitiveType::String);
    let integer = primitive!(env, PrimitiveType::Integer);

    let union = union!(env, [integer, string]);

    let mut lattice = LatticeEnvironment::new(&env);
    let projection = lattice.projection(union, Ident::synthetic(heap.intern_symbol("foo")));
    assert_eq!(lattice.diagnostics.len(), 2);
    assert_eq!(projection, Projection::Error);
}

#[test]
fn projection_propagate_pending() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let string = primitive!(env, PrimitiveType::String);
    let hole = env.counter.hole.next();

    let union = union!(env, [instantiate_infer(&env, hole), string]);

    let mut lattice = LatticeEnvironment::new(&env);
    let projection = lattice.projection(union, Ident::synthetic(heap.intern_symbol("foo")));
    assert_eq!(lattice.diagnostics.len(), 1);
    assert_eq!(projection, Projection::Pending);
}

#[test]
fn projection_union_values() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let string = primitive!(env, PrimitiveType::String);
    let integer = primitive!(env, PrimitiveType::Integer);

    let union = union!(
        env,
        [
            r#struct!(env, [struct_field!(env, "foo", integer)]),
            r#struct!(env, [struct_field!(env, "foo", string)])
        ]
    );

    let mut lattice = LatticeEnvironment::new(&env);
    let projection = lattice.projection(union, Ident::synthetic(heap.intern_symbol("foo")));
    assert_eq!(lattice.diagnostics.len(), 0);
    let Projection::Resolved(id) = projection else {
        panic!("expected resolved projection")
    };

    assert_equiv!(env, [id], [union!(env, [integer, string])]);
}

#[test]
fn subscript_empty() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let union = union!(env, []);

    let mut lattice = LatticeEnvironment::new(&env);
    let mut inference = InferenceEnvironment::new(&env);

    let subscript = lattice.subscript(
        union,
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

    let union = union!(env, [list!(env, string)]);

    let mut lattice = LatticeEnvironment::new(&env);
    let mut inference = InferenceEnvironment::new(&env);

    let subscript = lattice.subscript(
        union,
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

    let union = union!(env, [integer, string]);

    let mut lattice = LatticeEnvironment::new(&env);
    let mut inference = InferenceEnvironment::new(&env);

    let subscript = lattice.subscript(
        union,
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

    let union = union!(env, [instantiate_infer(&env, hole), string]);

    let mut lattice = LatticeEnvironment::new(&env);
    let mut inference = InferenceEnvironment::new(&env);

    let subscript = lattice.subscript(
        union,
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
fn subscript_union_values() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let string = primitive!(env, PrimitiveType::String);
    let integer = primitive!(env, PrimitiveType::Integer);

    let union = union!(env, [list!(env, integer), dict!(env, integer, string)]);

    let mut lattice = LatticeEnvironment::new(&env);
    let mut inference = InferenceEnvironment::new(&env);

    let subscript = lattice.subscript(
        union,
        primitive!(env, PrimitiveType::Integer),
        &mut inference,
    );
    assert_eq!(lattice.diagnostics.len(), 0);
    let Subscript::Resolved(id) = subscript else {
        panic!("Expected Subscript::Resolved but got {subscript:?}");
    };

    assert_equiv!(env, [id], [union!(env, [integer, string])]);
}

#[test]
fn collect_constraints_invariant_union_left() {
    scaffold!(heap, env, builder, [inference: inference]);

    let hole = builder.fresh_hole();

    let integer = builder.integer();
    let string = builder.string();

    // union-left
    let lhs = builder.union([integer, string]);
    let rhs = builder.infer(hole);

    // First check covariance:
    inference.collect_constraints(Variance::Covariant, lhs, rhs);
    let constraints = inference.take_constraints();
    assert_eq!(
        constraints,
        [
            Constraint::LowerBound {
                variable: Variable::synthetic(hole.into()),
                bound: integer
            },
            Constraint::LowerBound {
                variable: Variable::synthetic(hole.into()),
                bound: string
            }
        ]
    );

    inference.collect_constraints(Variance::Invariant, lhs, rhs);
    let constraints = inference.take_constraints();
    assert_eq!(
        constraints,
        [Constraint::Equals {
            variable: Variable::synthetic(hole.into()),
            r#type: lhs
        }]
    );

    // right hand side has no inference variable shouldn't crash the system
    let rhs = builder.string();
    inference.collect_constraints(Variance::Invariant, lhs, rhs);
    let constraints = inference.take_constraints();
    assert!(constraints.is_empty());
}

#[test]
fn collect_constraints_invariant_union_both() {
    scaffold!(heap, env, builder, [inference: inference]);

    let a = builder.fresh_hole();
    let b = builder.fresh_hole();

    let integer = builder.integer();
    let string = builder.string();

    let lhs = builder.union([integer, builder.infer(a)]);
    let rhs = builder.union([string, builder.infer(b)]);

    inference.collect_constraints(Variance::Covariant, lhs, rhs);
    let constraints = inference.take_constraints();
    assert_eq!(
        constraints,
        [Constraint::UpperBound {
            variable: Variable::synthetic(a.into()),
            bound: rhs
        }]
    );

    inference.collect_constraints(Variance::Invariant, lhs, rhs);
    let constraints = inference.take_constraints();
    assert!(constraints.is_empty());
}
