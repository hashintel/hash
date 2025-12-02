use crate::{
    heap::Heap,
    span::SpanId,
    r#type::{
        PartialType,
        environment::{
            AnalysisEnvironment, Environment, InferenceEnvironment, LatticeEnvironment,
            SimplifyEnvironment, Variance, instantiate::InstantiateEnvironment,
        },
        inference::{Constraint, Variable, VariableKind},
        kind::{
            Generic, GenericArgument, GenericArguments, IntersectionType, PrimitiveType,
            StructType, TypeKind, UnionType,
            generic::GenericArgumentId,
            infer::HoleId,
            r#struct::StructField,
            test::{assert_equiv, generic, intersection, primitive, r#struct, struct_field, union},
        },
        lattice::test::assert_lattice_laws,
        tests::{instantiate, instantiate_infer},
    },
};

#[test]
fn lattice_laws() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let number = generic!(env, primitive!(env, PrimitiveType::Number), []);
    let string = generic!(env, primitive!(env, PrimitiveType::String), []);
    let boolean = generic!(env, primitive!(env, PrimitiveType::Boolean), []);

    assert_lattice_laws(&env, number, string, boolean);
}

#[test]
fn meet() {
    // Meet should wrap the result of the underlying operation
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let mut lattice = LatticeEnvironment::new(&env);

    let primitive_number = primitive!(env, PrimitiveType::Number);
    let primitive_integer = primitive!(env, PrimitiveType::Integer);

    let applied_number = generic!(env, primitive_number, []);
    let applied_integer = generic!(env, primitive_integer, []);

    assert_equiv!(
        env,
        [lattice.meet(applied_number, applied_integer)],
        [applied_integer]
    );

    assert_equiv!(
        env,
        [lattice.meet(applied_number, primitive_integer)],
        [applied_integer]
    );

    assert_equiv!(
        env,
        [lattice.meet(primitive_number, applied_integer)],
        [primitive_integer]
    );
}

#[test]
fn join() {
    // Join should wrap the result of the underlying operation
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let mut lattice = LatticeEnvironment::new(&env);

    let primitive_number = primitive!(env, PrimitiveType::Number);
    let primitive_integer = primitive!(env, PrimitiveType::Integer);

    let applied_number = generic!(env, primitive_number, []);
    let applied_integer = generic!(env, primitive_integer, []);

    assert_equiv!(
        env,
        [lattice.join(applied_number, applied_integer)],
        [applied_number]
    );

    assert_equiv!(
        env,
        [lattice.join(applied_number, primitive_number)],
        [applied_number]
    );

    assert_equiv!(
        env,
        [lattice.join(primitive_number, applied_number)],
        [applied_number]
    );
}

#[test]
fn join_generic_argument_merging() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let mut lattice = LatticeEnvironment::new(&env);
    lattice.without_simplify();

    // Create base types
    let number = primitive!(env, PrimitiveType::Number);

    // Create generic argument IDs
    let argument1 = env.counter.generic_argument.next();
    let argument2 = env.counter.generic_argument.next();

    // Create Apply types with different substitutions
    let generic1 = generic!(
        env,
        number,
        [GenericArgument {
            id: argument1,
            name: heap.intern_symbol("T"),
            constraint: None
        }]
    );

    let generic2 = generic!(
        env,
        number,
        [GenericArgument {
            id: argument2,
            name: heap.intern_symbol("U"),
            constraint: None
        }]
    );

    // Join the types
    let result = lattice.join(generic1, generic2);

    let generic = env
        .r#type(result)
        .kind
        .generic()
        .expect("should be generic");

    assert_eq!(generic.arguments.len(), 2);

    // Check that generic are sorted by argument ID
    assert_eq!(generic.arguments[0].id, argument1);
    assert_eq!(generic.arguments[1].id, argument2);
}

#[test]
fn join_same_generic_arguments() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let mut lattice = LatticeEnvironment::new(&env);
    lattice.without_simplify();

    // Create base types
    let number = primitive!(env, PrimitiveType::Number);
    let string = primitive!(env, PrimitiveType::String);
    let boolean = primitive!(env, PrimitiveType::Boolean);

    // Create generic argument IDs
    let argument1 = env.counter.generic_argument.next();

    // Create Apply types with different substitutions
    let generic1 = generic!(
        env,
        number,
        [GenericArgument {
            id: argument1,
            name: heap.intern_symbol("T"),
            constraint: Some(string),
        }]
    );

    let generic2 = generic!(
        env,
        number,
        [GenericArgument {
            id: argument1,
            name: heap.intern_symbol("T"),
            constraint: Some(boolean),
        }]
    );

    // Join the types
    let result = lattice.join(generic1, generic2);

    let generic = env
        .r#type(result)
        .kind
        .generic()
        .expect("should be generic");

    assert_eq!(generic.arguments.len(), 2);

    // Check that substitutions are sorted by argument ID
    assert_eq!(generic.arguments[0].id, argument1);
    assert_eq!(generic.arguments[1].id, argument1);

    // Check substitution values
    assert_equiv!(
        env,
        [generic.arguments[0].constraint.expect("should be some")],
        [string]
    );
    assert_equiv!(
        env,
        [generic.arguments[1].constraint.expect("should be some")],
        [boolean]
    );
}

#[test]
fn join_identical_generic_arguments() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let mut lattice = LatticeEnvironment::new(&env);
    lattice.without_simplify();

    // Create base types
    let number = primitive!(env, PrimitiveType::Number);
    let string = primitive!(env, PrimitiveType::String);

    // Create generic argument IDs
    let argument1 = env.counter.generic_argument.next();

    // Create Apply types with different substitutions
    let apply1 = generic!(
        env,
        number,
        [GenericArgument {
            id: argument1,
            name: heap.intern_symbol("T"),
            constraint: Some(string),
        }]
    );

    let apply2 = generic!(
        env,
        number,
        [GenericArgument {
            id: argument1,
            name: heap.intern_symbol("T"),
            constraint: Some(string),
        }]
    );

    // Join the types
    let result = lattice.join(apply1, apply2);

    let generic = env
        .r#type(result)
        .kind
        .generic()
        .expect("should be generic");

    assert_eq!(generic.arguments.len(), 1);

    // Check that arguments are sorted by argument ID
    assert_eq!(generic.arguments[0].id, argument1);

    // Check substitution values
    assert_equiv!(
        env,
        [generic.arguments[0].constraint.expect("should be some")],
        [string]
    );
}

#[test]
fn join_swallow_generic_arguments() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let mut lattice = LatticeEnvironment::new(&env);
    lattice.without_simplify();

    // Create base types
    let number = primitive!(env, PrimitiveType::Number);
    let string = primitive!(env, PrimitiveType::String);

    // Create generic argument IDs
    let argument1 = env.counter.generic_argument.next();

    // Create Apply types with different substitutions
    let apply1 = generic!(
        env,
        number,
        [GenericArgument {
            id: argument1,
            name: heap.intern_symbol("T"),
            constraint: Some(string),
        }]
    );

    let apply2 = generic!(
        env,
        number,
        [GenericArgument {
            id: argument1,
            name: heap.intern_symbol("T"),
            constraint: None,
        }]
    );

    // Join the types
    let result = lattice.join(apply1, apply2);

    let generic = env
        .r#type(result)
        .kind
        .generic()
        .expect("should be generic");

    assert_eq!(generic.arguments.len(), 1);

    // Check that arguments are sorted by argument ID
    assert_eq!(generic.arguments[0].id, argument1);

    // Check substitution values
    assert_equiv!(
        env,
        [generic.arguments[0].constraint.expect("should be some")],
        [string]
    );
}

#[test]
#[expect(clippy::too_many_lines)]
fn join_complex_generic_merging() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let mut lattice = LatticeEnvironment::new(&env);
    lattice.without_simplify();

    // Create base types for substitution values
    let number = primitive!(env, PrimitiveType::Number);
    let integer = primitive!(env, PrimitiveType::Integer);
    let string = primitive!(env, PrimitiveType::String);
    let boolean = primitive!(env, PrimitiveType::Boolean);

    // Create several generic argument IDs
    let argument1 = env.counter.generic_argument.next();
    let argument2 = env.counter.generic_argument.next();
    let argument3 = env.counter.generic_argument.next();
    let argument4 = env.counter.generic_argument.next();
    let argument5 = env.counter.generic_argument.next();

    // Create complex sets of substitutions for two Generic types:
    // 1. Identical substitutions (arg1:string in both)
    // 2. Same argument with different values (arg2:number and arg2:boolean)
    // 3. Unique arguments (arg3 only in first, arg4 only in second)
    // 4. Omitted unconstrained (arg5:number, `arg5:None`)
    let generic1 = generic!(
        env,
        number,
        [
            GenericArgument {
                id: argument1,
                name: heap.intern_symbol("T"),
                constraint: Some(string),
            },
            GenericArgument {
                id: argument2,
                name: heap.intern_symbol("U"),
                constraint: Some(number),
            },
            GenericArgument {
                id: argument3,
                name: heap.intern_symbol("V"),
                constraint: Some(integer),
            },
            GenericArgument {
                id: argument5,
                name: heap.intern_symbol("X"),
                constraint: Some(number),
            }
        ]
    );

    let generic2 = generic!(
        env,
        number,
        [
            GenericArgument {
                id: argument1,
                name: heap.intern_symbol("T"),
                constraint: Some(string),
            },
            GenericArgument {
                id: argument2,
                name: heap.intern_symbol("U"),
                constraint: Some(boolean),
            },
            GenericArgument {
                id: argument4,
                name: heap.intern_symbol("W"),
                constraint: Some(string),
            },
            GenericArgument {
                id: argument5,
                name: heap.intern_symbol("X"),
                constraint: None,
            }
        ]
    );

    // Join the types with complex generics
    let result = lattice.join(generic1, generic2);
    let generic = env
        .r#type(result)
        .kind
        .generic()
        .expect("should be an generic type");

    // The result should have:
    // - One generic for arg1 (deduped)
    // - Two generics for arg2 (different values)
    // - One generic for arg3 (from first Generic)
    // - One generic for arg4 (from second Generic)
    // So 5 total generics
    assert_eq!(
        *generic.arguments,
        [
            GenericArgument {
                id: argument1,
                name: heap.intern_symbol("T"),
                constraint: Some(string),
            },
            GenericArgument {
                id: argument2,
                name: heap.intern_symbol("U"),
                constraint: Some(number),
            },
            GenericArgument {
                id: argument2,
                name: heap.intern_symbol("U"),
                constraint: Some(boolean),
            },
            GenericArgument {
                id: argument3,
                name: heap.intern_symbol("V"),
                constraint: Some(integer),
            },
            GenericArgument {
                id: argument4,
                name: heap.intern_symbol("W"),
                constraint: Some(string),
            },
            GenericArgument {
                id: argument5,
                name: heap.intern_symbol("X"),
                constraint: Some(number),
            }
        ]
    );
}

#[test]
fn bottom() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Verify that `is_bottom` simply delegates to the base type
    let apply_never = generic!(env, instantiate(&env, TypeKind::Never), []);
    let mut analysis = AnalysisEnvironment::new(&env);
    assert!(analysis.is_bottom(apply_never));

    let apply_string = generic!(env, primitive!(env, PrimitiveType::String), []);
    assert!(!analysis.is_bottom(apply_string));
}

#[test]
fn top() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Verify that `is_top` simply delegates to the base type
    let apply_unknown = generic!(env, instantiate(&env, TypeKind::Unknown), []);
    let mut analysis = AnalysisEnvironment::new(&env);
    assert!(analysis.is_top(apply_unknown));

    let apply_string = generic!(env, primitive!(env, PrimitiveType::String), []);
    assert!(!analysis.is_top(apply_string));
}

#[test]
fn concrete() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Verify that `is_concrete` simply delegates to the base type
    let apply_never = generic!(env, instantiate(&env, TypeKind::Never), []);
    let mut analysis = AnalysisEnvironment::new(&env);
    assert!(analysis.is_concrete(apply_never));

    let apply_infer = generic!(env, instantiate_infer(&env, 0_u32), []);
    assert!(!analysis.is_concrete(apply_infer));
}

#[test]
fn recursive() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // type that's `type A = Apply<(name: A), []>`
    let recursive = env.types.intern(|id| PartialType {
        span: SpanId::SYNTHETIC,
        kind: env.intern_kind(TypeKind::Generic(Generic {
            base: r#struct!(env, [struct_field!(env, "A", id.value())]),
            arguments: GenericArguments::empty(),
        })),
    });
    let mut analysis = AnalysisEnvironment::new(&env);
    assert!(analysis.is_recursive(recursive.id));

    let apply_infer = generic!(env, instantiate_infer(&env, 0_u32), []);
    assert!(!analysis.is_recursive(apply_infer));
}

#[test]
fn distribute_union() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // If the inner type is just a single type, we should just return ourselves
    let string = generic!(env, primitive!(env, PrimitiveType::String), []);
    let mut analysis = AnalysisEnvironment::new(&env);
    assert_eq!(analysis.distribute_union(string), [string]);

    // If the inner type is distributing, we should distribute ourselves as well
    let union = generic!(
        env,
        union!(
            env,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        ),
        []
    );
    let mut analysis = AnalysisEnvironment::new(&env);
    assert_equiv!(
        env,
        analysis.distribute_union(union),
        [
            generic!(env, primitive!(env, PrimitiveType::Number), []),
            generic!(env, primitive!(env, PrimitiveType::String), [])
        ]
    );
}

#[test]
fn distribute_intersection() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // If the inner type is just a single type, we should just return ourselves
    let string = generic!(env, primitive!(env, PrimitiveType::String), []);
    let mut analysis = AnalysisEnvironment::new(&env);
    assert_eq!(analysis.distribute_intersection(string), [string]);

    // If the inner type is distributing, we should distribute ourselves as well
    let union = generic!(
        env,
        intersection!(
            env,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        ),
        []
    );
    let mut analysis = AnalysisEnvironment::new(&env);
    assert_equiv!(
        env,
        analysis.distribute_intersection(union),
        [
            generic!(env, primitive!(env, PrimitiveType::Number), []),
            generic!(env, primitive!(env, PrimitiveType::String), [])
        ]
    );
}

#[test]
fn is_subtype_of() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Apply should be transparent in is_subtype_of checks
    let integer = generic!(env, primitive!(env, PrimitiveType::Integer), []);
    let number = generic!(env, primitive!(env, PrimitiveType::Number), []);

    let mut analysis = AnalysisEnvironment::new(&env);
    assert!(analysis.is_subtype_of(Variance::Covariant, integer, number));
    assert!(!analysis.is_subtype_of(Variance::Covariant, number, integer));
}

#[test]
fn is_equivalent() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    // Apply should be transparent in is_subtype_of checks
    let integer = generic!(env, primitive!(env, PrimitiveType::Integer), []);
    let number = generic!(env, primitive!(env, PrimitiveType::Number), []);

    let mut analysis = AnalysisEnvironment::new(&env);
    assert!(analysis.is_equivalent(integer, integer));
    assert!(!analysis.is_equivalent(number, integer));
}

#[test]
fn simplify() {
    // Simplify should be transparent if the type is not concrete
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let mut simplify = SimplifyEnvironment::new(&env);
    let infer = generic!(env, instantiate_infer(&env, 0_u32), []);
    let number = generic!(env, primitive!(env, PrimitiveType::Number), []);

    assert_eq!(simplify.simplify(infer), infer);
    assert_equiv!(
        env,
        [simplify.simplify(number)],
        [primitive!(env, PrimitiveType::Number)]
    );
}

#[test]
fn collect_constraints() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let mut infer = InferenceEnvironment::new(&env);

    let subtype = generic!(
        env,
        instantiate(&env, TypeKind::Never),
        [GenericArgument {
            id: GenericArgumentId::new(0),
            name: heap.intern_symbol("T"),
            constraint: Some(primitive!(env, PrimitiveType::Number))
        }]
    );

    let supertype = generic!(env, primitive!(env, PrimitiveType::String), []);

    infer.collect_constraints(Variance::Covariant, subtype, supertype);

    let constraints = infer.take_constraints();
    assert_eq!(
        constraints,
        [Constraint::UpperBound {
            variable: Variable::synthetic(VariableKind::Generic(GenericArgumentId::new(0))),
            bound: primitive!(env, PrimitiveType::Number)
        }]
    );
}

#[test]
fn collect_dependencies() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let mut infer = InferenceEnvironment::new(&env);

    let subtype = generic!(
        env,
        instantiate(&env, TypeKind::Never),
        [GenericArgument {
            id: GenericArgumentId::new(0),
            name: heap.intern_symbol("T"),
            constraint: Some(instantiate_infer(&env, 1_u32))
        }]
    );

    infer.collect_dependencies(
        subtype,
        Variable::synthetic(VariableKind::Hole(HoleId::new(0))),
    );

    let constraints = infer.take_constraints();
    assert_eq!(
        constraints,
        [Constraint::Dependency {
            source: Variable::synthetic(VariableKind::Hole(HoleId::new(0))),
            target: Variable::synthetic(VariableKind::Generic(GenericArgumentId::new(0)))
        }]
    );
}

#[test]
fn simplify_recursive() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let r#type = env.types.intern(|id| PartialType {
        span: SpanId::SYNTHETIC,
        kind: env.intern_kind(TypeKind::Generic(Generic {
            base: id.value(),
            arguments: GenericArguments::empty(),
        })),
    });

    let mut simplify = SimplifyEnvironment::new(&env);
    let simplified = simplify.simplify(r#type.id);

    let generic = env
        .r#type(simplified)
        .kind
        .generic()
        .expect("should be generic");
    assert_eq!(generic.base, simplified);
}

#[test]
fn instantiate_recursive() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let r#type = env.types.intern(|id| PartialType {
        span: SpanId::SYNTHETIC,
        kind: env.intern_kind(TypeKind::Generic(Generic {
            base: id.value(),
            arguments: GenericArguments::empty(),
        })),
    });

    let mut instantiate = InstantiateEnvironment::new(&env);
    let instantiated = instantiate.instantiate(r#type.id);

    let generic = env
        .r#type(instantiated)
        .kind
        .generic()
        .expect("should be generic");
    assert_eq!(generic.base, instantiated);
}
