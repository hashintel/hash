#![expect(clippy::min_ident_chars)]
use core::assert_matches::assert_matches;

use crate::{
    heap::Heap,
    span::SpanId,
    r#type::{
        PartialType,
        environment::{
            AnalysisEnvironment, Environment, InferenceEnvironment, LatticeEnvironment,
            SimplifyEnvironment, Variance, instantiate::InstantiateEnvironment,
        },
        inference::{Constraint, Inference as _, Variable, VariableKind},
        kind::{
            Generic, OpaqueType, Param, TypeKind,
            generic::{GenericArgument, GenericArgumentId},
            infer::HoleId,
            primitive::PrimitiveType,
            test::{assert_equiv, generic, opaque, primitive, union},
            union::UnionType,
        },
        lattice::{Lattice as _, test::assert_lattice_laws},
        tests::{instantiate, instantiate_infer, instantiate_param},
    },
};

#[test]
fn join_same_name_different_repr() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create two opaque types with the same name but different representations
    let a_repr = primitive!(env, PrimitiveType::Number);
    let b_repr = primitive!(env, PrimitiveType::String);

    opaque!(env, a, "MyType", a_repr);
    opaque!(env, b, "MyType", b_repr);

    let mut lattice_env = LatticeEnvironment::new(&env);

    // Joining should result in an opaque type with the same name but representation
    // that is the join of the two representations (a union in this case)
    // Should have two variants: number and string
    assert_equiv!(env, a.join(b, &mut lattice_env), [a.id, b.id]);
}

#[test]
fn join_same_name_inference() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let hole = HoleId::new(0);
    let infer = instantiate_infer(&env, hole);

    opaque!(env, a, "MyType", primitive!(env, PrimitiveType::Number));
    opaque!(env, b, "MyType", infer);

    let mut lattice_env = LatticeEnvironment::new(&env);
    lattice_env.set_inference_enabled(true);

    // If inference is enabled, we assume that the primitive type is the inferred variable
    assert_equiv!(env, a.join(b, &mut lattice_env), [a.id, b.id]);
}

#[test]
fn join_same_name_subtype() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    opaque!(env, a, "MyType", primitive!(env, PrimitiveType::Number));
    opaque!(env, b, "MyType", primitive!(env, PrimitiveType::Integer));

    let mut lattice_env = LatticeEnvironment::new(&env);

    assert_equiv!(env, a.join(b, &mut lattice_env), [a.id, b.id]);
}

#[test]
fn join_different_names() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create two opaque types with different names
    let a_repr = primitive!(env, PrimitiveType::Number);
    let b_repr = primitive!(env, PrimitiveType::Number); // Same representation, different name

    opaque!(env, a, "TypeA", a_repr);
    opaque!(env, b, "TypeB", b_repr);

    let mut lattice_env = LatticeEnvironment::new(&env);

    // Joining opaque types with different names should result in a union of both
    assert_equiv!(env, a.join(b, &mut lattice_env), [a.id, b.id]);
}

#[test]
fn meet_same_name_different_repr() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    opaque!(env, a, "MyType", primitive!(env, PrimitiveType::Number));
    opaque!(
        env,
        b,
        "MyType",
        union!(
            env,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        )
    );

    let mut lattice_env = LatticeEnvironment::new(&env);

    // Meeting should result in an opaque type with the same name but representation
    // that is the meet of the two representations (just Number in this case)
    assert_equiv!(env, a.meet(b, &mut lattice_env), []);
}

#[test]
fn meet_same_name_inference() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let hole = HoleId::new(0);
    let infer = instantiate_infer(&env, hole);

    opaque!(env, a, "MyType", primitive!(env, PrimitiveType::Number));
    opaque!(env, b, "MyType", infer);

    let mut lattice_env = LatticeEnvironment::new(&env);
    lattice_env.set_inference_enabled(true);

    // If inference is enabled, we assume that the primitive type is the inferred variable
    assert_equiv!(env, a.meet(b, &mut lattice_env), [a.id, b.id]);
}

#[test]
fn meet_different_names() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create two opaque types with different names
    let a_repr = primitive!(env, PrimitiveType::Number);
    let b_repr = primitive!(env, PrimitiveType::Number);

    opaque!(env, a, "TypeA", a_repr);
    opaque!(env, b, "TypeB", b_repr);

    let mut lattice_env = LatticeEnvironment::new(&env);

    // Meeting opaque types with different names should return `Never`
    assert_equiv!(env, a.meet(b, &mut lattice_env), []);
}

#[test]
fn is_subtype_of() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create an opaque type for numbers
    let a_repr = primitive!(env, PrimitiveType::Number);
    // Create an opaque type for the union of numbers and strings
    let b_repr = union!(
        env,
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String)
        ]
    );

    // Number variant is a subtype of Number|String
    opaque!(env, a, "MyType", a_repr);
    opaque!(env, b, "MyType", b_repr);

    // Different name with same representation
    opaque!(env, c, "DifferentType", a_repr);

    let mut analysis_env = AnalysisEnvironment::new(&env);

    // a should not be a subtype of b (invariant)
    assert!(!a.is_subtype_of(b, &mut analysis_env));

    // b should not be a subtype of a (Number|String is not a subtype of Number)
    assert!(!b.is_subtype_of(a, &mut analysis_env));

    // c should not be a subtype of a (different names)
    assert!(!c.is_subtype_of(a, &mut analysis_env));
}

#[test]
fn is_equivalent() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create two identical opaque types
    let a_repr = primitive!(env, PrimitiveType::Number);
    let b_repr = primitive!(env, PrimitiveType::Number);

    opaque!(env, a, "MyType", a_repr);
    opaque!(env, b, "MyType", b_repr);

    // Different name with same representation
    opaque!(env, c, "DifferentType", a_repr);

    // Same name but different representation
    opaque!(env, d, "MyType", primitive!(env, PrimitiveType::String));

    let mut analysis_env = AnalysisEnvironment::new(&env);

    // a and b should be equivalent (same name, equivalent representations)
    assert!(a.is_equivalent(b, &mut analysis_env));

    // a and c should not be equivalent (different names)
    assert!(!a.is_equivalent(c, &mut analysis_env));

    // a and d should not be equivalent (same name but different representations)
    assert!(!a.is_equivalent(d, &mut analysis_env));
}

#[test]
fn simplify() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create an opaque type with a union that contains duplicates
    let repr = union!(
        env,
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::Number)
        ]
    );

    opaque!(env, a, "MyType", repr);

    let mut simplify_env = SimplifyEnvironment::new(&env);

    assert_equiv!(
        env,
        [a.simplify(&mut simplify_env)],
        [opaque!(
            env,
            "MyType",
            primitive!(env, PrimitiveType::Number)
        )]
    );
}

#[test]
fn nested_opaque_types() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    opaque!(
        env,
        a,
        "Outer",
        opaque!(env, "Inner", primitive!(env, PrimitiveType::Number))
    );

    opaque!(
        env,
        b,
        "Outer",
        opaque!(env, "Inner", primitive!(env, PrimitiveType::String))
    );

    let mut lattice_env = LatticeEnvironment::new(&env);

    assert_equiv!(
        env,
        a.join(b, &mut lattice_env),
        [
            opaque!(
                env,
                "Outer",
                opaque!(env, "Inner", primitive!(env, PrimitiveType::Number))
            ),
            opaque!(
                env,
                "Outer",
                opaque!(env, "Inner", primitive!(env, PrimitiveType::String))
            )
        ]
    );
}

#[test]
fn lattice_laws() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create various opaque types for testing lattice laws
    let number_repr = primitive!(env, PrimitiveType::Number);
    let string_repr = primitive!(env, PrimitiveType::String);
    let bool_repr = primitive!(env, PrimitiveType::Boolean);

    let a = opaque!(env, "Type", number_repr);
    let b = opaque!(env, "Type", string_repr);
    let c = opaque!(env, "Type", bool_repr);

    // Test lattice laws on these opaque types
    assert_lattice_laws(&env, a, b, c);
}

#[test]
fn is_concrete() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Concrete opaque type (with primitive representation)
    let number_repr = primitive!(env, PrimitiveType::Number);
    opaque!(env, concrete, "ConcreteType", number_repr);
    assert!(concrete.is_concrete(&mut analysis_env));

    // Non-concrete opaque type (with inference variable in its representation)
    let hole = HoleId::new(0);
    let infer_var = instantiate_infer(&env, hole);
    opaque!(env, non_concrete_type, "NonConcreteType", infer_var);
    assert!(!non_concrete_type.is_concrete(&mut analysis_env));

    // Nested non-concrete type (opaque type containing another opaque type with an inference
    // variable)
    let nested_opaque = opaque!(env, "InnerType", infer_var);
    opaque!(env, nested_non_concrete, "OuterType", nested_opaque);
    assert!(!nested_non_concrete.is_concrete(&mut analysis_env));
}

#[test]
fn collect_constraints_same_name() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create an opaque type with a concrete representation
    let number = primitive!(env, PrimitiveType::Number);
    opaque!(env, number_opaque, "TypeName", number);

    // Create another opaque type with the same name but an inference variable
    let hole = HoleId::new(0);
    let infer_var = instantiate_infer(&env, hole);
    opaque!(env, infer_opaque, "TypeName", infer_var);

    // Create an inference environment to collect constraints
    let mut inference_env = InferenceEnvironment::new(&env);

    // Collect constraints between the two opaque types
    number_opaque.collect_constraints(infer_opaque, &mut inference_env);

    // Since opaque types are invariant, we should get an equality constraint
    // rather than just an upper or lower bound
    let constraints = inference_env.take_constraints();
    assert_eq!(
        constraints,
        [Constraint::Equals {
            variable: Variable::synthetic(VariableKind::Hole(hole)),
            r#type: number
        }]
    );
}

#[test]
fn collect_constraints_different_names() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create an opaque type with a concrete representation
    let number = primitive!(env, PrimitiveType::Number);
    opaque!(env, type_a, "TypeA", number);

    // Create another opaque type with a different name and an inference variable
    let hole = HoleId::new(0);
    let infer_var = instantiate_infer(&env, hole);
    opaque!(env, type_b, "TypeB", infer_var);

    // Create an inference environment to collect constraints
    let mut inference_env = InferenceEnvironment::new(&env);

    // Collect constraints between the two opaque types
    type_a.collect_constraints(type_b, &mut inference_env);

    // No constraints should be generated since the names are different
    // This is important for nominal typing - different named types don't interact
    let constraints = inference_env.take_constraints();
    assert!(constraints.is_empty());
}

#[test]
fn collect_constraints_nested() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create a nested opaque type with an inference variable
    let hole = HoleId::new(0);
    let infer_var = instantiate_infer(&env, hole);
    opaque!(env, outer_a, "Outer", opaque!(env, "Inner", infer_var));

    // Create another nested opaque type with a concrete representation
    let number = primitive!(env, PrimitiveType::Number);
    opaque!(env, outer_b, "Outer", opaque!(env, "Inner", number));

    // Create an inference environment to collect constraints
    let mut inference_env = InferenceEnvironment::new(&env);

    // Collect constraints between the two nested opaque types
    outer_a.collect_constraints(outer_b, &mut inference_env);

    // Due to invariance through the chain, we should get an equality constraint
    let constraints = inference_env.take_constraints();
    assert_eq!(
        constraints,
        [Constraint::Equals {
            variable: Variable::synthetic(VariableKind::Hole(hole)),
            r#type: number
        }]
    );
}

#[test]
fn collect_constraints_concrete() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create two opaque types with concrete but different representations
    let number = primitive!(env, PrimitiveType::Number);
    let string = primitive!(env, PrimitiveType::String);

    opaque!(env, number_opaque, "Type", number);
    opaque!(env, string_opaque, "Type", string);

    // Create an inference environment to collect constraints
    let mut inference_env = InferenceEnvironment::new(&env);

    // Collect constraints between the two opaque types
    number_opaque.collect_constraints(string_opaque, &mut inference_env);

    // No constraints should be generated since both types are concrete
    // The invariance check would fail during is_subtype_of, but we don't handle
    // that during constraint collection
    let constraints = inference_env.take_constraints();
    assert!(constraints.is_empty());
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

    // Create opaque types with generic parameters
    let opaque_a = generic!(
        env,
        opaque!(env, "Type", param1),
        [GenericArgument {
            id: arg1,
            name: heap.intern_symbol("T"),
            constraint: None
        }]
    );

    let opaque_b = generic!(
        env,
        opaque!(env, "Type", param2),
        [GenericArgument {
            id: arg2,
            name: heap.intern_symbol("T"),
            constraint: None
        }]
    );

    // Create an inference environment to collect constraints
    let mut inference_env = InferenceEnvironment::new(&env);

    // Collect constraints between the two opaque types with generic parameters
    inference_env.collect_constraints(Variance::Covariant, opaque_a, opaque_b);

    // Due to invariance, we should get an equality constraint between the generic parameters
    let constraints = inference_env.take_constraints();
    assert_eq!(constraints.len(), 1);
    assert_eq!(
        constraints[0],
        Constraint::Unify {
            lhs: Variable {
                span: SpanId::SYNTHETIC,
                kind: VariableKind::Generic(arg1)
            },
            rhs: Variable {
                span: SpanId::SYNTHETIC,
                kind: VariableKind::Generic(arg2)
            }
        }
    );
}

#[test]
fn collect_constraints_multiple_infer_vars() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create an opaque type with an inference variable
    let hole_var1 = HoleId::new(0);
    let infer_var1 = instantiate_infer(&env, hole_var1);
    opaque!(env, opaque_a, "Type", infer_var1);

    // Create another opaque type with another inference variable
    let hole_var2 = HoleId::new(1);
    let infer_var2 = instantiate_infer(&env, hole_var2);
    opaque!(env, opaque_b, "Type", infer_var2);

    // Create an inference environment to collect constraints
    let mut inference_env = InferenceEnvironment::new(&env);

    // Collect constraints between the two opaque types
    opaque_a.collect_constraints(opaque_b, &mut inference_env);

    // Due to invariance, we should get an equality constraint between the inference variables
    let constraints = inference_env.take_constraints();
    assert_eq!(constraints.len(), 1);
    assert_eq!(
        constraints[0],
        Constraint::Unify {
            lhs: Variable {
                span: SpanId::SYNTHETIC,
                kind: VariableKind::Hole(hole_var1)
            },
            rhs: Variable {
                span: SpanId::SYNTHETIC,
                kind: VariableKind::Hole(hole_var2)
            }
        }
    );
}

#[test]
fn collect_constraints_infer_and_generic_var() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create an opaque type with an inference variable
    let hole_var1 = HoleId::new(0);
    let infer_var1 = instantiate_infer(&env, hole_var1);
    opaque!(env, opaque_a, "Type", infer_var1);

    // Create another opaque type with a generic variable
    let arg = GenericArgumentId::new(0);
    opaque!(env, opaque_b, "Type", instantiate_param(&env, arg));

    // Create an inference environment to collect constraints
    let mut inference_env = InferenceEnvironment::new(&env);

    // Collect constraints between the two opaque types
    opaque_a.collect_constraints(opaque_b, &mut inference_env);

    // Due to invariance, we should get an equality constraint between the inference variable
    // and the generic variable
    let constraints = inference_env.take_constraints();
    assert_eq!(constraints.len(), 1);
    assert_eq!(
        constraints[0],
        Constraint::Unify {
            lhs: Variable {
                span: SpanId::SYNTHETIC,
                kind: VariableKind::Hole(hole_var1)
            },
            rhs: Variable {
                span: SpanId::SYNTHETIC,
                kind: VariableKind::Generic(arg)
            }
        }
    );
}

#[test]
fn collect_dependencies() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create an inference variable
    let hole = HoleId::new(0);
    let infer_var = instantiate_infer(&env, hole);

    // Create an opaque type with an inference variable: MyType[_0]
    opaque!(env, opaque_type, "MyType", infer_var);

    let mut inference_env = InferenceEnvironment::new(&env);

    // Create variables for testing both source and target edges
    let variable = Variable::synthetic(VariableKind::Hole(HoleId::new(1)));

    inference_env.collect_dependencies(opaque_type.id, variable);

    assert_eq!(
        inference_env.take_constraints(),
        [Constraint::Dependency {
            source: variable,
            target: Variable::synthetic(VariableKind::Hole(hole))
        }]
    );
}

#[test]
fn simplify_recursive_opaque() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let r#type = env.types.intern(|id| PartialType {
        span: SpanId::SYNTHETIC,
        kind: env.intern_kind(TypeKind::Opaque(OpaqueType {
            name: heap.intern_symbol("RecursiveOpaque"),
            repr: id.value(),
        })),
    });

    let mut simplify = SimplifyEnvironment::new(&env);
    let type_id = simplify.simplify(r#type.id);

    let r#type = env.r#type(type_id);

    assert_matches!(
        r#type.kind,
        TypeKind::Opaque(OpaqueType { name, repr }) if name.as_str() == "RecursiveOpaque"
            && *repr == type_id
    );
}

#[test]
fn instantiate_opaque() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let argument = env.counter.generic_argument.next();
    let param = instantiate_param(&env, argument);

    let value = generic!(
        env,
        opaque!(env, "A", param),
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
    assert_ne!(repr.argument, argument);
}
