use core::assert_matches::assert_matches;

use rstest::rstest;

use super::ty;
use crate::{
    heap::Heap,
    span::SpanId,
    symbol::Ident,
    r#type::{
        PartialType, TypeBuilder, TypeId,
        environment::{
            AnalysisEnvironment, Environment, InferenceEnvironment, LatticeEnvironment,
            SimplifyEnvironment, Variance, instantiate::InstantiateEnvironment,
        },
        error::TypeCheckDiagnosticCategory,
        inference::{Constraint, Inference as _, Variable, VariableKind},
        kind::{
            ClosureType, Generic, Param, TypeKind,
            generic::{GenericArgument, GenericArgumentId},
            infer::HoleId,
            intersection::IntersectionType,
            primitive::PrimitiveType,
            test::{assert_equiv, closure, generic, intersection, primitive, union},
            tests::{assert_join, assert_meet},
            union::UnionType,
        },
        lattice::{Lattice as _, Projection, Subscript, test::assert_lattice_laws},
        tests::{instantiate, instantiate_infer, instantiate_param, scaffold},
    },
};

#[rstest]
#[case::identical(
    ty!(fn(Number) -> String),
    ty!(fn(Number) -> String),
    &[ty!(fn(Number) -> String)]
)]
#[case::parameter_contravariance(
    ty!(fn(Integer) -> String),
    ty!(fn(Number) -> String),
    &[ty!(fn(Integer) -> String)]
)]
#[case::return_covariance(
    ty!(fn(Number) -> Number),
    ty!(fn(Number) -> Integer),
    &[ty!(fn(Number) -> Number)]
)]
#[case::parameter_count_invariance(
    ty!(fn(Number) -> Number),
    ty!(fn(Number, String) -> Number),
    &[ty!(fn(Number) -> Number), ty!(fn(Number, String) -> Number)]
)]
fn join(
    #[case] lhs: impl Fn(&TypeBuilder) -> TypeId,
    #[case] rhs: impl Fn(&TypeBuilder) -> TypeId,
    #[case] expected: &[impl Fn(&TypeBuilder) -> TypeId],
) {
    scaffold!(heap, env, builder, [lattice(!simplify): lattice]);

    let lhs = lhs(&builder);
    let rhs = rhs(&builder);

    let expected: Vec<_> = expected.iter().map(|func| func(&builder)).collect();

    assert_join(&mut lattice, lhs, rhs, &expected);
}

#[rstest]
#[case::identical(
    ty!(fn(Number) -> String),
    ty!(fn(Number) -> String),
    &[ty!(fn(Number) -> String)]
)]
#[case::parameter_contravariance(
    ty!(fn(Integer) -> String),
    ty!(fn(Number) -> String),
    &[ty!(fn(Number) -> String)]
)]
#[case::return_covariance(
    ty!(fn(Number) -> Number),
    ty!(fn(Number) -> Integer),
    &[ty!(fn(Number) -> Integer)]
)]
#[case::parameter_count_invariance(
    ty!(fn(Number) -> Number),
    ty!(fn(Number, String) -> Number),
    &[] as &[fn(&TypeBuilder) -> TypeId]
)]
fn meet(
    #[case] lhs: impl Fn(&TypeBuilder) -> TypeId,
    #[case] rhs: impl Fn(&TypeBuilder) -> TypeId,
    #[case] expected: &[impl Fn(&TypeBuilder) -> TypeId],
) {
    scaffold!(heap, env, builder, [lattice(!simplify): lattice]);

    let lhs = lhs(&builder);
    let rhs = rhs(&builder);

    let expected: Vec<_> = expected.iter().map(|func| func(&builder)).collect();

    assert_meet(&mut lattice, lhs, rhs, &expected);
}

#[test]
fn is_bottom_and_is_top() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Create a normal closure
    closure!(
        env,
        normal_closure,
        [primitive!(env, PrimitiveType::Number)],
        primitive!(env, PrimitiveType::String)
    );

    // Create a closure with Never parameter type
    closure!(
        env,
        never_param_closure,
        [instantiate(&env, TypeKind::Never)],
        primitive!(env, PrimitiveType::String)
    );

    // Create a closure with Never return type
    closure!(
        env,
        never_return_closure,
        [primitive!(env, PrimitiveType::Number)],
        instantiate(&env, TypeKind::Never)
    );

    // Closures are never bottom types, even with Never parameters or return type
    assert!(!normal_closure.is_bottom(&mut analysis_env));
    assert!(!never_param_closure.is_bottom(&mut analysis_env));
    assert!(!never_return_closure.is_bottom(&mut analysis_env));

    // Closures are never top types
    assert!(!normal_closure.is_top(&mut analysis_env));
}

#[test]
fn is_concrete() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Create a concrete closure
    closure!(
        env,
        concrete_closure,
        [primitive!(env, PrimitiveType::Number)],
        primitive!(env, PrimitiveType::String)
    );

    // Create a closure with a non-concrete parameter
    let infer_var = instantiate_infer(&env, 0_u32);
    closure!(
        env,
        non_concrete_param,
        [infer_var],
        primitive!(env, PrimitiveType::String)
    );

    // Create a closure with a non-concrete return type
    closure!(
        env,
        non_concrete_return,
        [primitive!(env, PrimitiveType::Number)],
        infer_var
    );

    // Concrete closure should be concrete
    assert!(concrete_closure.is_concrete(&mut analysis_env));

    // Closures with non-concrete parameters or returns should not be concrete
    assert!(!non_concrete_param.is_concrete(&mut analysis_env));
    assert!(!non_concrete_return.is_concrete(&mut analysis_env));
}

#[test]
fn subtype_relationship() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let mut analysis_env = AnalysisEnvironment::new(&env);

    let number = primitive!(env, PrimitiveType::Number);
    let integer = primitive!(env, PrimitiveType::Integer);
    let string = primitive!(env, PrimitiveType::String);

    // Create various closures for testing subtyping
    closure!(
        env,
        closure_a,
        [number], // fn(Number) -> Integer
        integer
    );

    closure!(
        env,
        closure_b,
        [integer], // fn(Integer) -> Integer
        integer
    );

    closure!(
        env,
        closure_c,
        [integer], // fn(Integer) -> Number
        number
    );

    closure!(
        env,
        closure_d,
        [number], // fn(Number) -> Number
        number
    );

    // Test parameter contravariance:
    // fn(Number) -> Integer <: fn(Integer) -> Integer
    // Because Number >: Integer (contravariant!)
    assert!(closure_a.is_subtype_of(closure_b, &mut analysis_env));

    // Test return type covariance:
    // fn(Integer) -> Integer <: fn(Integer) -> Number
    // Because Integer <: Number (covariant)
    assert!(closure_b.is_subtype_of(closure_c, &mut analysis_env));

    // Test combined effects:
    // fn(Number) -> Integer <: fn(Integer) -> Number
    // Parameter: Number >: Integer
    // Return: Integer <: Number
    assert!(closure_a.is_subtype_of(closure_c, &mut analysis_env));

    // Test parameter contravariance (opposite direction):
    // fn(Integer) -> Integer is NOT a subtype of fn(Number) -> Integer
    // Because Integer <: Number (wrong direction for contravariance)
    assert!(!closure_b.is_subtype_of(closure_a, &mut analysis_env));

    // Subtyping with different parameter counts
    closure!(
        env,
        closure_e,
        [number, string], // fn(Number, String) -> Integer
        integer
    );

    // Different parameter count means they're not in a subtyping relationship
    assert!(!closure_a.is_subtype_of(closure_e, &mut analysis_env));
    assert!(!closure_e.is_subtype_of(closure_a, &mut analysis_env));

    // Test return type covariance with same parameter types:
    // fn(Number) -> Integer <: fn(Number) -> Number
    // Because Integer <: Number (covariant return type)
    assert!(closure_a.is_subtype_of(closure_d, &mut analysis_env));

    // Test reflexivity: all closures are subtypes of themselves
    assert!(closure_d.is_subtype_of(closure_d, &mut analysis_env));
}

#[test]
fn equivalence_relationship() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Create identical closures semantically
    closure!(
        env,
        a,
        [primitive!(env, PrimitiveType::Number)],
        primitive!(env, PrimitiveType::String)
    );

    closure!(
        env,
        b,
        [primitive!(env, PrimitiveType::Number)],
        primitive!(env, PrimitiveType::String)
    );

    // Create a closure with different return type
    closure!(
        env,
        c,
        [primitive!(env, PrimitiveType::Number)],
        primitive!(env, PrimitiveType::Boolean)
    );

    // Create a closure with different parameter type
    closure!(
        env,
        d,
        [primitive!(env, PrimitiveType::Integer)],
        primitive!(env, PrimitiveType::String)
    );

    // Create a closure with different parameter count
    closure!(
        env,
        e,
        [
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String)
        ],
        primitive!(env, PrimitiveType::Boolean)
    );

    // Test equivalence properties
    assert!(a.is_equivalent(b, &mut analysis_env));
    assert!(!a.is_equivalent(c, &mut analysis_env));
    assert!(!a.is_equivalent(d, &mut analysis_env));
    assert!(!a.is_equivalent(e, &mut analysis_env));

    // Self-equivalence check
    assert!(a.is_equivalent(a, &mut analysis_env));
}

#[test]
fn distribute_union() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Create primitive types
    let number = primitive!(env, PrimitiveType::Number);
    let string = primitive!(env, PrimitiveType::String);
    let boolean = primitive!(env, PrimitiveType::Boolean);

    // Create a union type for the return type
    let union_type = union!(env, [string, boolean]);

    // Create a closure with union return type
    closure!(env, closure_with_union_return, [number], union_type);

    // Distribute union across the return type (covariant position)
    let result = closure_with_union_return.distribute_union(&mut analysis_env);

    // Should result in the same type
    assert_equiv!(env, result, [closure_with_union_return.id]);
}

#[test]
fn distribute_intersection() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Create primitive types
    let number = primitive!(env, PrimitiveType::Number);
    let string = primitive!(env, PrimitiveType::String);
    let integer = primitive!(env, PrimitiveType::Integer);

    // Create an intersection type for parameter (contravariant position)
    let intersect_type = intersection!(env, [number, string]);

    // Create a closure with intersection parameter
    closure!(env, closure_with_intersect_param, [intersect_type], integer);

    let result = closure_with_intersect_param.distribute_intersection(&mut analysis_env);

    // Should result in no change
    assert_equiv!(env, result, [closure_with_intersect_param.id]);
}

#[test]
fn simplify_closure() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create a normal closure
    closure!(
        env,
        normal_closure,
        [primitive!(env, PrimitiveType::Number)],
        primitive!(env, PrimitiveType::String)
    );

    let mut simplify_env = SimplifyEnvironment::new(&env);

    // Simplifying an already simplified closure should return the same closure
    let result = normal_closure.simplify(&mut simplify_env);
    assert_eq!(result, normal_closure.id);
}

#[test]
fn lattice_laws() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create three distinct closures for testing lattice laws
    let a = closure!(
        env,
        [primitive!(env, PrimitiveType::Number)],
        primitive!(env, PrimitiveType::String)
    );

    let b = closure!(
        env,
        [primitive!(env, PrimitiveType::Integer)],
        primitive!(env, PrimitiveType::Boolean)
    );

    let c = closure!(
        env,
        [primitive!(env, PrimitiveType::String)],
        primitive!(env, PrimitiveType::Number)
    );

    // Test lattice laws (commutativity, associativity, absorption, etc.)
    assert_lattice_laws(&env, a, b, c);
}

#[test]
fn collect_constraints_closure_parameters() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create function types with an inference variable as parameter
    let hole = HoleId::new(0);
    let infer_var = instantiate_infer(&env, hole);
    let string = primitive!(env, PrimitiveType::String);

    // fn(?T) -> String
    closure!(env, infer_param_fn, [infer_var], string);

    // fn(Number) -> String
    let number = primitive!(env, PrimitiveType::Number);
    closure!(env, concrete_param_fn, [number], string);

    let mut inference_env = InferenceEnvironment::new(&env);

    // Test constraints when the subtype has a concrete parameter
    // Collect: fn(Number) -> String <: fn(?T) -> String
    // For parameters, this should generate Number >: ?T (upper bound)
    concrete_param_fn.collect_constraints(infer_param_fn, &mut inference_env);

    let constraints = inference_env.take_constraints();
    assert_eq!(
        constraints,
        [Constraint::UpperBound {
            variable: Variable::synthetic(VariableKind::Hole(hole)),
            bound: number
        }]
    );

    // Test constraints in the opposite direction
    // Collect: fn(?T) -> String <: fn(Number) -> String
    // For parameters, this should generate ?T <: Number (lower bound)
    inference_env = InferenceEnvironment::new(&env);
    infer_param_fn.collect_constraints(concrete_param_fn, &mut inference_env);

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
fn collect_constraints_closure_return_type() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create function types with an inference variable as return type
    let hole = HoleId::new(0);
    let infer_var = instantiate_infer(&env, hole);
    let number = primitive!(env, PrimitiveType::Number);

    // fn(Number) -> ?T
    closure!(env, infer_return_fn, [number], infer_var);

    // fn(Number) -> String
    let string = primitive!(env, PrimitiveType::String);
    closure!(env, concrete_return_fn, [number], string);

    let mut inference_env = InferenceEnvironment::new(&env);

    // Test constraints when the subtype has an inference variable return
    // Collect: fn(Number) -> ?T <: fn(Number) -> String
    // For return type, this should generate ?T <: String (upper bound)
    infer_return_fn.collect_constraints(concrete_return_fn, &mut inference_env);

    let constraints = inference_env.take_constraints();
    assert_eq!(
        constraints,
        [Constraint::UpperBound {
            variable: Variable::synthetic(VariableKind::Hole(hole)),
            bound: string
        }]
    );

    // Test constraints in the opposite direction
    // Collect: fn(Number) -> String <: fn(Number) -> ?T
    // For return type, this should generate String >: ?T (lower bound)
    inference_env = InferenceEnvironment::new(&env);
    concrete_return_fn.collect_constraints(infer_return_fn, &mut inference_env);

    let constraints = inference_env.take_constraints();
    assert_eq!(
        constraints,
        [Constraint::LowerBound {
            variable: Variable::synthetic(VariableKind::Hole(hole)),
            bound: string
        }]
    );
}

#[test]
fn collect_constraints_closure_both_param_and_return() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create inference variables
    let hole_param = HoleId::new(0);
    let infer_param = instantiate_infer(&env, hole_param);
    let hole_return = HoleId::new(1);
    let infer_return = instantiate_infer(&env, hole_return);

    // fn(?P) -> ?R
    closure!(env, infer_fn, [infer_param], infer_return);

    // fn(Number) -> String
    let number = primitive!(env, PrimitiveType::Number);
    let string = primitive!(env, PrimitiveType::String);
    closure!(env, concrete_fn, [number], string);

    let mut inference_env = InferenceEnvironment::new(&env);

    // Test constraints when comparing functions with inference vars in both positions
    // Collect: fn(?P) -> ?R <: fn(Number) -> String
    // For parameters: Number <: ?P (upper bound)
    // For return: ?R <: String (upper bound)
    infer_fn.collect_constraints(concrete_fn, &mut inference_env);

    let constraints = inference_env.take_constraints();
    assert_eq!(
        constraints,
        [
            Constraint::LowerBound {
                variable: Variable::synthetic(VariableKind::Hole(hole_param)),
                bound: number,
            },
            Constraint::UpperBound {
                variable: Variable::synthetic(VariableKind::Hole(hole_return)),
                bound: string,
            },
        ]
    );
}

#[test]
fn collect_constraints_closure_multiple_parameters() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create a function with multiple parameters, some inference variables
    let hole1 = HoleId::new(0);
    let infer1 = instantiate_infer(&env, hole1);
    let hole2 = HoleId::new(1);
    let infer2 = instantiate_infer(&env, hole2);
    let string = primitive!(env, PrimitiveType::String);

    // fn(?T1, ?T2, String) -> String
    closure!(env, infer_params_fn, [infer1, infer2, string], string);

    // Create a function with concrete types
    let number = primitive!(env, PrimitiveType::Number);
    let boolean = primitive!(env, PrimitiveType::Boolean);

    // fn(Number, Boolean, String) -> String
    closure!(env, concrete_params_fn, [number, boolean, string], string);

    let mut inference_env = InferenceEnvironment::new(&env);

    // Collect constraints
    infer_params_fn.collect_constraints(concrete_params_fn, &mut inference_env);

    let constraints = inference_env.take_constraints();
    assert_eq!(
        constraints,
        [
            Constraint::LowerBound {
                variable: Variable::synthetic(VariableKind::Hole(hole1)),
                bound: number,
            },
            Constraint::LowerBound {
                variable: Variable::synthetic(VariableKind::Hole(hole2)),
                bound: boolean,
            },
        ]
    );
}

#[test]
fn collect_constraints_closure_with_different_param_count() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create functions with different parameter counts
    let hole = HoleId::new(0);
    let infer_var = instantiate_infer(&env, hole);
    let number = primitive!(env, PrimitiveType::Number);
    let string = primitive!(env, PrimitiveType::String);

    // fn(Number) -> String
    closure!(env, one_param_fn, [number], string);

    // fn(Number, ?T) -> String
    closure!(env, two_param_fn, [number, infer_var], string);

    let mut inference_env = InferenceEnvironment::new(&env);

    // Collect constraints despite different parameter counts
    one_param_fn.collect_constraints(two_param_fn, &mut inference_env);

    // Should have no constraints since we only collect for common prefix
    // and there's no inference variable in the common prefix
    let constraints = inference_env.take_constraints();
    assert!(constraints.is_empty());

    // Now test with inference variable in the common parameter
    let hole_first = HoleId::new(1);
    let infer_first = instantiate_infer(&env, hole_first);

    let hole_second = HoleId::new(2);
    let infer_second = instantiate_infer(&env, hole_second);

    // fn(?T, String) -> Number
    closure!(env, infer_first_param, [infer_first, string], number);

    // fn(?T) -> Number
    closure!(env, infer_only_param, [infer_second], number);

    inference_env = InferenceEnvironment::new(&env);
    infer_first_param.collect_constraints(infer_only_param, &mut inference_env);

    // Should have a constraint for the common first parameter
    let constraints = inference_env.take_constraints();
    assert_eq!(
        constraints,
        [Constraint::Ordering {
            lower: Variable::synthetic(VariableKind::Hole(hole_second)),
            upper: Variable::synthetic(VariableKind::Hole(hole_first)),
        }]
    );
}

#[test]
fn collect_constraints_nested_closure() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create a nested closure with inference variable
    let hole = HoleId::new(0);
    let infer_var = instantiate_infer(&env, hole);
    let number = primitive!(env, PrimitiveType::Number);
    let string = primitive!(env, PrimitiveType::String);

    // Create inner closure fn(Number) -> ?T
    let inner_closure_a = closure!(env, [number], infer_var);

    // Outer closure fn(fn(Number) -> ?T) -> String
    closure!(env, closure_a, [inner_closure_a], string);

    // Create inner closure fn(Number) -> Boolean
    let boolean = primitive!(env, PrimitiveType::Boolean);
    let inner_closure_b = closure!(env, [number], boolean);

    // Outer closure fn(fn(Number) -> Boolean) -> String
    closure!(env, closure_b, [inner_closure_b], string);

    let mut inference_env = InferenceEnvironment::new(&env);

    // Collect constraints with nested closures
    // closure_a <: closure_b
    // This requires inner_closure_b <: inner_closure_a
    // For return types, this means Boolean <: ?T
    closure_a.collect_constraints(closure_b, &mut inference_env);

    let constraints = inference_env.take_constraints();
    assert_eq!(
        constraints,
        [Constraint::LowerBound {
            variable: Variable::synthetic(VariableKind::Hole(hole)),
            bound: boolean
        }]
    );
}

#[test]
fn collect_constraints_concrete_closures() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create concrete closures
    let number = primitive!(env, PrimitiveType::Number);
    let integer = primitive!(env, PrimitiveType::Integer);
    let string = primitive!(env, PrimitiveType::String);

    // fn(Number) -> String
    closure!(env, fn_a, [number], string);

    // fn(Integer) -> String
    closure!(env, fn_b, [integer], string);

    let mut inference_env = InferenceEnvironment::new(&env);

    // For concrete types, no constraints should be generated
    fn_a.collect_constraints(fn_b, &mut inference_env);

    assert!(inference_env.take_constraints().is_empty());
}

#[test]
fn collect_constraints_with_generic_args() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Set up generic arguments
    let arg1 = GenericArgumentId::new(0);
    let arg2 = GenericArgumentId::new(1);

    // Create generic parameter types
    let param1 = instantiate_param(&env, arg1);
    let param2 = instantiate_param(&env, arg2);

    // Create closures with generic parameters
    let fn_a = generic!(
        env,
        closure!(env, [param1], param1),
        [GenericArgument {
            id: arg1,
            name: heap.intern_symbol("T"),
            constraint: None
        }]
    );

    let fn_b = generic!(
        env,
        closure!(env, [param2], param2),
        [GenericArgument {
            id: arg2,
            name: heap.intern_symbol("T"),
            constraint: None
        }]
    );

    let mut inference_env = InferenceEnvironment::new(&env);

    // Collect constraints between closures with generic parameters
    inference_env.collect_constraints(Variance::Covariant, fn_a, fn_b);

    let constraints = inference_env.take_constraints();
    assert_eq!(
        constraints,
        [
            Constraint::Ordering {
                lower: Variable::synthetic(VariableKind::Generic(arg2)),
                upper: Variable::synthetic(VariableKind::Generic(arg1)),
            },
            Constraint::Ordering {
                lower: Variable::synthetic(VariableKind::Generic(arg1)),
                upper: Variable::synthetic(VariableKind::Generic(arg2)),
            }
        ]
    );
}

#[test]
fn collect_dependencies_param() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create an inference variable
    let hole = HoleId::new(0);
    let infer_var = instantiate_infer(&env, hole);
    let string = primitive!(env, PrimitiveType::String);

    // Create a closure with an inference variable in parameter position: fn(_0) -> String
    closure!(env, param_fn, [infer_var], string);

    let mut inference_env = InferenceEnvironment::new(&env);

    // Create a variable to use as the source in a structural edge
    let variable = Variable::synthetic(VariableKind::Hole(HoleId::new(1)));

    // Collect structural edges
    inference_env.collect_dependencies(param_fn.id, variable);

    // Since parameters are contravariant, the flow direction is from param to the source
    // We expect _0 -> _1 (where _0 is the param infer var and _1 is the source var)
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
fn collect_dependencies_return() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create an inference variable
    let hole = HoleId::new(0);
    let infer_var = instantiate_infer(&env, hole);
    let number = primitive!(env, PrimitiveType::Number);

    // Create a closure with an inference variable in return position: fn(Number) -> _0
    closure!(env, return_fn, [number], infer_var);

    let mut inference_env = InferenceEnvironment::new(&env);

    // Create a variable to use as the target in a structural edge
    let variable = Variable::synthetic(VariableKind::Hole(HoleId::new(1)));

    // Collect structural edges
    inference_env.collect_dependencies(return_fn.id, variable);

    // Since return types are covariant, the flow is from return to target
    // We expect _0 -> _1 (where _0 is the infer var in return position and _1 is target)
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
fn collect_dependencies_both_param_and_return() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create inference variables for param and return
    let hole_param = HoleId::new(0);
    let infer_param = instantiate_infer(&env, hole_param);
    let hole_return = HoleId::new(1);
    let infer_return = instantiate_infer(&env, hole_return);

    // Create a closure with inference variables in both positions: fn(_0) -> _1
    closure!(env, both_fn, [infer_param], infer_return);

    let mut inference_env = InferenceEnvironment::new(&env);

    // Create a variable to use as the source in a structural edge
    let variable = Variable::synthetic(VariableKind::Hole(HoleId::new(2)));

    // Collect structural edges
    inference_env.collect_dependencies(both_fn.id, variable);

    // We expect two edges:
    // 1. _0 -> _2 (contravariant parameter position: param flows to source)
    // 2. _2 -> _1 (covariant return position: source flows to return)
    let constraints = inference_env.take_constraints();
    assert_eq!(
        constraints,
        [
            Constraint::Dependency {
                source: variable,
                target: Variable::synthetic(VariableKind::Hole(hole_param)),
            },
            Constraint::Dependency {
                source: variable,
                target: Variable::synthetic(VariableKind::Hole(hole_return)),
            }
        ]
    );
}

#[test]
fn collect_dependencies_multiple_params() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create multiple inference variables for parameters
    let hole1 = HoleId::new(0);
    let infer1 = instantiate_infer(&env, hole1);
    let hole2 = HoleId::new(1);
    let infer2 = instantiate_infer(&env, hole2);
    let string = primitive!(env, PrimitiveType::String);

    // Create a closure with multiple inference variables: fn(_0, _1) -> String
    closure!(env, multi_param_fn, [infer1, infer2], string);

    let mut inference_env = InferenceEnvironment::new(&env);

    // Create a variable for the edge
    let variable = Variable::synthetic(VariableKind::Hole(HoleId::new(3)));

    // Collect structural edges
    inference_env.collect_dependencies(multi_param_fn.id, variable);

    // Since parameters are contravariant and we provided a Target edge,
    // we expect the flow from the target to each parameter:
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
fn collect_dependencies_nested_closure() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create inference variables
    let hole_inner = HoleId::new(0);
    let infer_inner = instantiate_infer(&env, hole_inner);
    let hole_outer = HoleId::new(1);
    let infer_outer = instantiate_infer(&env, hole_outer);
    let number = primitive!(env, PrimitiveType::Number);

    // Create inner closure: fn(Number) -> _0
    let inner_closure = closure!(env, [number], infer_inner);

    // Create outer closure: fn(_1) -> fn(Number) -> _0
    closure!(env, outer_fn, [infer_outer], inner_closure);

    let mut inference_env = InferenceEnvironment::new(&env);

    // Edge variable
    let variable = Variable::synthetic(VariableKind::Hole(HoleId::new(2)));

    // Collect structural edges for the outer function
    inference_env.collect_dependencies(outer_fn.id, variable);

    // We expect:
    // 1. _1 -> _2 (contravariant parameter of outer closure flows to source)
    // 2. _2 -> _0 (covariant return position - inner closure's return type, source flows to return)
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
fn collect_dependencies_invariant_context() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Create inference variables
    let hole = HoleId::new(0);
    let infer_var = instantiate_infer(&env, hole);
    let string = primitive!(env, PrimitiveType::String);

    // Create a closure with an inference variable: fn(_0) -> String
    closure!(env, fn_with_infer, [infer_var], string);

    // Create an InferenceEnvironment in invariant context
    let mut inference_env = InferenceEnvironment::new(&env);

    // Edge variable
    let variable = Variable::synthetic(VariableKind::Hole(HoleId::new(1)));

    // Collect structural edges in an invariant context
    inference_env.collect_dependencies(fn_with_infer.id, variable);

    // In invariant context, no structural edges should be collected
    let constraints = inference_env.take_constraints();
    assert_eq!(
        constraints,
        [Constraint::Dependency {
            source: variable,
            target: Variable::synthetic(VariableKind::Hole(hole)),
        },]
    );
}

#[test]
fn simplify_recursive_closure() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let r#type = env.types.intern(|id| PartialType {
        span: SpanId::SYNTHETIC,
        kind: env.intern_kind(TypeKind::Closure(ClosureType {
            params: env.intern_type_ids(&[id.value()]),
            returns: id.value(),
        })),
    });

    let mut simplify = SimplifyEnvironment::new(&env);
    let type_id = simplify.simplify(r#type.id);

    let r#type = env.r#type(type_id);

    assert_matches!(
        r#type.kind,
        TypeKind::Closure(ClosureType { params, returns }) if params.len() == 1
            && params[0] == type_id
            && *returns == type_id
    );
}

#[test]
fn instantiate_closure() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let argument = env.counter.generic_argument.next();
    let param = instantiate_param(&env, argument);

    let value = generic!(
        env,
        closure!(env, [param], param),
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

    let closure = env
        .r#type(generic.base)
        .kind
        .closure()
        .expect("should be a closure type");
    assert_eq!(closure.params.len(), 1);

    let param = env
        .r#type(closure.params[0])
        .kind
        .param()
        .expect("should be a param type");
    assert_eq!(
        *param,
        Param {
            argument: generic.arguments[0].id
        }
    );
    assert_ne!(param.argument, argument);

    let returns = env
        .r#type(closure.returns)
        .kind
        .param()
        .expect("should be a param type");

    assert_eq!(
        *returns,
        Param {
            argument: generic.arguments[0].id
        }
    );
    assert_ne!(returns.argument, argument);
}

#[test]
fn projection() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let mut lattice = LatticeEnvironment::new(&env);

    let result = lattice.projection(
        closure!(env, [], primitive!(env, PrimitiveType::String)),
        Ident::synthetic(heap.intern_symbol("foo")),
    );
    assert_eq!(result, Projection::Error);

    let diagnostics = lattice.take_diagnostics().into_vec();
    assert_eq!(diagnostics.len(), 1);
    assert_eq!(
        diagnostics[0].category,
        TypeCheckDiagnosticCategory::UnsupportedProjection
    );
}

#[test]
fn subscript() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let mut lattice = LatticeEnvironment::new(&env);
    let mut inference = InferenceEnvironment::new(&env);

    let result = lattice.subscript(
        closure!(env, [], primitive!(env, PrimitiveType::String)),
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
fn regression_contravariance_flip_flop() {
    // given
    // A: `fn(List<Number>) -> Number`
    // B: `fn(List<Integer>) -> Number`
    // then if `A <: B`
    // List<Integer> <: List<Number>
    // Integer <: Number
    // Ok!
    // before https://linear.app/hash/issue/H-4899/hashql-fix-contravariance-applying-unilaterally this would've failed
    scaffold!(heap, env, builder, [analysis: analysis]);

    let a = builder.closure([builder.list(builder.number())], builder.number());
    let b = builder.closure([builder.list(builder.integer())], builder.number());

    assert!(analysis.is_subtype_of(Variance::Covariant, a, b));
}
