use bumpalo::Bump;
use hashql_diagnostics::Success;

use super::{Constraint, InferenceSolver, VariableConstraint};
use crate::{
    collections::{FastHashMap, SmallVec},
    heap::Heap,
    span::SpanId,
    symbol::Ident,
    r#type::{
        PartialType,
        environment::{AnalysisEnvironment, Environment, InferenceEnvironment, Variance},
        error::TypeCheckDiagnosticCategory,
        inference::{
            Variable, VariableKind,
            solver::{Unification, VariableConstraintSatisfiability, graph::Graph},
        },
        kind::{
            IntersectionType, IntrinsicType, OpaqueType, PrimitiveType, StructType, TypeKind,
            UnionType,
            infer::HoleId,
            intrinsic::ListType,
            r#struct::StructField,
            test::{assert_equiv, intersection, list, primitive, r#struct, struct_field, union},
            tests::assert_equivalent,
        },
        tests::{instantiate, instantiate_infer, scaffold},
    },
};

#[test]
fn unification_upsert_variable() {
    let mut unification = Unification::new();
    let hole1 = HoleId::new(1);
    let kind = VariableKind::Hole(hole1);

    let id1 = unification.upsert_variable(kind);
    assert_eq!(unification.variables.len(), 1);
    assert_eq!(unification.variables[0], kind);
    assert_eq!(unification.lookup[&kind], id1);

    let id2 = unification.upsert_variable(kind);
    assert_eq!(id1, id2);
    assert_eq!(unification.variables.len(), 1);
}

#[test]
fn unification_unify() {
    let mut unification = Unification::new();
    let hole1 = HoleId::new(1);
    let hole2 = HoleId::new(2);

    let kind1 = VariableKind::Hole(hole1);
    let kind2 = VariableKind::Hole(hole2);

    unification.upsert_variable(kind1);
    unification.upsert_variable(kind2);

    assert!(!unification.is_unioned(kind1, kind2));

    unification.unify(kind1, kind2);
    assert!(unification.is_unioned(kind1, kind2));
}

#[test]
fn unification_root_id_and_root() {
    let mut unification = Unification::new();
    let hole1 = HoleId::new(1);
    let hole2 = HoleId::new(2);
    let hole3 = HoleId::new(3);

    let kind1 = VariableKind::Hole(hole1);
    let kind2 = VariableKind::Hole(hole2);
    let kind3 = VariableKind::Hole(hole3);

    unification.unify(kind1, kind2);
    unification.unify(kind2, kind3);

    // All should have the same root
    let root1 = unification.root(kind1);
    let root2 = unification.root(kind2);
    let root3 = unification.root(kind3);

    assert_eq!(root1, root2);
    assert_eq!(root2, root3);
}

#[test]
fn unification_lookup() {
    let mut unification = Unification::new();
    let hole1 = HoleId::new(1);
    let hole2 = HoleId::new(2);

    let kind1 = VariableKind::Hole(hole1);
    let kind2 = VariableKind::Hole(hole2);

    unification.unify(kind1, kind2);

    let lookup = unification.lookup();

    // Both variables should map to the same root
    assert_eq!(lookup[kind1], lookup[kind2]);
}

// =============== SOLVER COMPONENT TESTS ===============

#[test]
fn solve_anti_symmetry() {
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let hole1 = HoleId::new(1);
    let hole2 = HoleId::new(2);

    let kind1 = Variable::synthetic(VariableKind::Hole(hole1));
    let kind2 = Variable::synthetic(VariableKind::Hole(hole2));

    let constraints = [
        Constraint::Ordering {
            lower: kind1,
            upper: kind2,
        },
        Constraint::Ordering {
            lower: kind2,
            upper: kind1,
        },
    ];

    let mut solver =
        InferenceSolver::new(InferenceEnvironment::new(&env).with_constraints(constraints));

    let mut graph = Graph::new(&mut solver.unification);
    let bump = Bump::new();
    solver.upsert_variables(&mut graph);
    solver.solve_anti_symmetry(&mut graph, &mut FastHashMap::default(), &bump);

    assert!(solver.unification.is_unioned(kind1.kind, kind2.kind));
}

#[test]
fn solve_anti_symmetry_with_cycles() {
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let hole1 = HoleId::new(1);
    let hole2 = HoleId::new(2);
    let hole3 = HoleId::new(3);

    let variable1 = Variable::synthetic(VariableKind::Hole(hole1));
    let variable2 = Variable::synthetic(VariableKind::Hole(hole2));
    let variable3 = Variable::synthetic(VariableKind::Hole(hole3));

    let constraints = [
        Constraint::Ordering {
            lower: variable1,
            upper: variable2,
        },
        Constraint::Ordering {
            lower: variable2,
            upper: variable3,
        },
        Constraint::Ordering {
            lower: variable3,
            upper: variable1,
        },
    ];

    let mut solver =
        InferenceSolver::new(InferenceEnvironment::new(&env).with_constraints(constraints));

    let mut graph = Graph::new(&mut solver.unification);
    let bump = Bump::new();
    solver.upsert_variables(&mut graph);
    solver.solve_anti_symmetry(&mut graph, &mut FastHashMap::default(), &bump);

    // All three variables should be unified
    assert!(
        solver
            .unification
            .is_unioned(variable1.kind, variable2.kind)
    );
    assert!(
        solver
            .unification
            .is_unioned(variable2.kind, variable3.kind)
    );
}

#[test]
fn apply_constraints() {
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let hole = HoleId::new(0);
    let string = primitive!(env, PrimitiveType::String);
    let number = primitive!(env, PrimitiveType::Number);

    let variable = Variable::synthetic(VariableKind::Hole(hole));

    let constraints = [
        Constraint::LowerBound {
            variable,
            bound: string,
        },
        Constraint::UpperBound {
            variable,
            bound: number,
        },
    ];

    let mut solver =
        InferenceSolver::new(InferenceEnvironment::new(&env).with_constraints(constraints));

    let mut graph = Graph::new(&mut solver.unification);
    let bump = Bump::new();
    solver.upsert_variables(&mut graph);
    solver.solve_anti_symmetry(&mut graph, &mut FastHashMap::default(), &bump);
    solver.lattice.set_variables(solver.unification.lookup());

    let mut variables = FastHashMap::default();
    let bump = Bump::new();
    solver.apply_constraints(&graph, &bump, &mut variables, &mut Vec::new());

    assert_eq!(variables.len(), 1);
    let (_, (_, constraint)) = variables.iter().next().expect("Should have one constraint");

    // Check that the constraint has the correct bounds
    assert_eq!(constraint.lower, [string]);
    assert_eq!(constraint.upper, [number]);
}

#[test]
fn apply_constraints_equality() {
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let hole = HoleId::new(0);
    let string = primitive!(env, PrimitiveType::String);

    let variable = Variable::synthetic(VariableKind::Hole(hole));

    let constraints = [Constraint::Equals {
        variable,
        r#type: string,
    }];

    let mut solver =
        InferenceSolver::new(InferenceEnvironment::new(&env).with_constraints(constraints));

    let mut graph = Graph::new(&mut solver.unification);
    let bump = Bump::new();
    solver.upsert_variables(&mut graph);
    solver.solve_anti_symmetry(&mut graph, &mut FastHashMap::default(), &bump);
    solver.lattice.set_variables(solver.unification.lookup());

    let mut variables = FastHashMap::default();
    solver.apply_constraints(&graph, &bump, &mut variables, &mut Vec::new());

    assert_eq!(variables.len(), 1);
    let (_, (_, constraint)) = variables.iter().next().expect("Should have one constraint");

    assert_eq!(
        *constraint,
        VariableConstraint {
            equal: Some(string),
            lower: SmallVec::new(),
            upper: SmallVec::new(),
            satisfiability: VariableConstraintSatisfiability::default(),
        }
    );
}

#[test]
fn apply_constraints_with_unification() {
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let number = primitive!(env, PrimitiveType::Number);
    let string = primitive!(env, PrimitiveType::String);

    let hole1 = HoleId::new(1);
    let hole2 = HoleId::new(2);

    let var1 = Variable::synthetic(VariableKind::Hole(hole1));
    let var2 = Variable::synthetic(VariableKind::Hole(hole2));

    let constraints = [
        Constraint::Unify {
            lhs: var1,
            rhs: var2,
        },
        Constraint::Equals {
            variable: var1,
            r#type: string,
        },
        Constraint::UpperBound {
            variable: var2,
            bound: number,
        },
    ];

    let mut solver =
        InferenceSolver::new(InferenceEnvironment::new(&env).with_constraints(constraints));

    let mut graph = Graph::new(&mut solver.unification);
    let bump = Bump::new();
    solver.upsert_variables(&mut graph);
    solver.solve_anti_symmetry(&mut graph, &mut FastHashMap::default(), &bump);
    solver.lattice.set_variables(solver.unification.lookup());

    let mut variables = FastHashMap::default();
    solver.apply_constraints(&graph, &bump, &mut variables, &mut Vec::new());

    // Only one entry since the variables are unified
    assert_eq!(variables.len(), 1);
    let (_, (_, constraint)) = variables.iter().next().expect("Expected a constraint");

    // Both constraints should be applied to the root variable
    assert_eq!(
        *constraint,
        VariableConstraint {
            equal: Some(string),
            lower: SmallVec::new(),
            upper: SmallVec::from_slice_copy(&[number]),
            satisfiability: VariableConstraintSatisfiability::default(),
        }
    );
}

#[test]
fn solve_constraints() {
    let heap = Heap::new();
    let bump = Bump::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let hole = HoleId::new(0);
    let string = primitive!(env, PrimitiveType::String);
    let unknown = instantiate(&env, TypeKind::Unknown);

    let variable = Variable::synthetic(VariableKind::Hole(hole));

    // Create a valid constraint set with lower bound and upper bound
    let mut applied_constraints = FastHashMap::default();
    let constraint = VariableConstraint {
        equal: None,
        lower: SmallVec::from_slice_copy(&[string]),
        upper: SmallVec::from_slice_copy(&[unknown]),
        satisfiability: VariableConstraintSatisfiability::default(),
    };
    applied_constraints.insert(variable.kind, (variable, constraint));

    let mut solver = InferenceSolver::new(InferenceEnvironment::new(&env).with_constraints([]));
    solver.unification.upsert_variable(variable.kind);

    let graph = Graph::new(&mut solver.unification);

    // Directly call solve_constraints
    let mut substitutions = FastHashMap::default();
    solver.solve_constraints(
        &graph,
        &bump,
        &applied_constraints,
        &mut substitutions,
        &mut Vec::new_in(&bump),
    );

    // Verify the substitution
    assert_eq!(substitutions.len(), 1);
    assert_eq!(substitutions[&variable.kind], string);
}

#[test]
fn solve_constraints_with_equality() {
    let heap = Heap::new();
    let bump = Bump::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let hole = HoleId::new(0);
    let string = primitive!(env, PrimitiveType::String);

    let var = Variable::synthetic(VariableKind::Hole(hole));

    // Create a constraint with an equality
    let mut applied_constraints = FastHashMap::default();
    let vc = VariableConstraint {
        equal: Some(string),
        lower: SmallVec::new(),
        upper: SmallVec::new(),
        satisfiability: VariableConstraintSatisfiability::default(),
    };
    applied_constraints.insert(var.kind, (var, vc));

    let mut solver = InferenceSolver::new(InferenceEnvironment::new(&env).with_constraints([]));
    solver.unification.upsert_variable(VariableKind::Hole(hole));

    let graph = Graph::new(&mut solver.unification);

    let mut substitutions = FastHashMap::default();
    solver.solve_constraints(
        &graph,
        &bump,
        &applied_constraints,
        &mut substitutions,
        &mut Vec::new_in(&bump),
    );

    assert_eq!(substitutions.len(), 1);
    assert_eq!(substitutions[&var.kind], string);
}

#[test]
fn solve_constraints_with_incompatible_bounds() {
    let heap = Heap::new();
    let bump = Bump::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let hole = HoleId::new(0);
    let string = primitive!(env, PrimitiveType::String);
    let number = primitive!(env, PrimitiveType::Number);

    let var = Variable::synthetic(VariableKind::Hole(hole));

    // Create incompatible bounds
    let mut applied_constraints = FastHashMap::default();
    let vc = VariableConstraint {
        equal: None,
        lower: SmallVec::from_slice_copy(&[string]),
        upper: SmallVec::from_slice_copy(&[number]),
        satisfiability: VariableConstraintSatisfiability::default(),
    };
    applied_constraints.insert(var.kind, (var, vc));

    let mut solver = InferenceSolver::new(InferenceEnvironment::new(&env).with_constraints([]));
    solver.unification.upsert_variable(VariableKind::Hole(hole));

    let graph = Graph::new(&mut solver.unification);

    // These bounds are incompatible, so a diagnostic should be created
    let mut substitutions = FastHashMap::default();
    solver.solve_constraints(
        &graph,
        &bump,
        &applied_constraints,
        &mut substitutions,
        &mut Vec::new_in(&bump),
    );

    let diagnostics = solver.diagnostics.into_vec();
    assert_eq!(diagnostics.len(), 1);

    assert_eq!(
        diagnostics[0].category,
        TypeCheckDiagnosticCategory::BoundConstraintViolation
    );
}

#[test]
fn solve_constraints_with_incompatible_equality() {
    let heap = Heap::new();
    let bump = Bump::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let hole = HoleId::new(0);
    let string = primitive!(env, PrimitiveType::String);
    let number = primitive!(env, PrimitiveType::Number);

    let var = Variable::synthetic(VariableKind::Hole(hole));

    // Create incompatible equality and lower bound
    let mut applied_constraints = FastHashMap::default();
    let vc = VariableConstraint {
        equal: Some(string),
        lower: SmallVec::from_slice_copy(&[number]),
        upper: SmallVec::new(),
        satisfiability: VariableConstraintSatisfiability::default(),
    };
    applied_constraints.insert(var.kind, (var, vc));

    let mut solver = InferenceSolver::new(InferenceEnvironment::new(&env).with_constraints([]));
    solver.unification.upsert_variable(VariableKind::Hole(hole));

    let graph = Graph::new(&mut solver.unification);

    let mut substitutions = FastHashMap::default();
    solver.solve_constraints(
        &graph,
        &bump,
        &applied_constraints,
        &mut substitutions,
        &mut Vec::new_in(&bump),
    );

    let diagnostics = solver.diagnostics.into_vec();
    assert_eq!(diagnostics.len(), 1);
    assert_eq!(
        diagnostics[0].category,
        TypeCheckDiagnosticCategory::IncompatibleLowerEqualConstraint
    );
}

#[test]
fn solve_constraints_with_incompatible_upper_equal_constraint() {
    let heap = Heap::new();
    let bump = Bump::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let hole = HoleId::new(0);
    let string = primitive!(env, PrimitiveType::String);
    let number = primitive!(env, PrimitiveType::Number);

    let var = Variable::synthetic(VariableKind::Hole(hole));

    // Create constraints where the equality is not a subtype of the upper bound
    // String is not a subtype of Number, so this should fail
    let mut applied_constraints = FastHashMap::default();
    let vc = VariableConstraint {
        equal: Some(string),
        lower: SmallVec::new(),
        upper: SmallVec::from_slice_copy(&[number]),
        satisfiability: VariableConstraintSatisfiability::default(),
    };
    applied_constraints.insert(var.kind, (var, vc));

    let mut solver = InferenceSolver::new(InferenceEnvironment::new(&env).with_constraints([]));
    solver.unification.upsert_variable(VariableKind::Hole(hole));

    let graph = Graph::new(&mut solver.unification);

    // This should exercise lines 916-929
    let mut substitutions = FastHashMap::default();
    solver.solve_constraints(
        &graph,
        &bump,
        &applied_constraints,
        &mut substitutions,
        &mut Vec::new_in(&bump),
    );

    // Should have a diagnostic for incompatible upper equal constraint
    let diagnostics = solver.diagnostics.into_vec();
    assert_eq!(diagnostics.len(), 1);
    assert_eq!(
        diagnostics[0].category,
        TypeCheckDiagnosticCategory::IncompatibleUpperEqualConstraint
    );
}

#[test]
fn simplify_substitutions() {
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let hole = HoleId::new(0);

    // We'll need to create a type that can be simplified
    // For testing, we could use a union type with duplicates
    // that would simplify to a simpler type
    let string = primitive!(env, PrimitiveType::String);
    let variable = VariableKind::Hole(hole);

    let mut solver = InferenceSolver::new(InferenceEnvironment::new(&env).with_constraints([]));
    solver.unification.upsert_variable(variable);

    // Create a substitution map
    let mut substitutions = FastHashMap::default();
    substitutions.insert(variable, union!(env, [string, string]));
    let lookup = solver.unification.lookup();

    // Call simplify_substitutions
    solver.simplify_substitutions(lookup, &mut substitutions);

    assert_eq!(substitutions.len(), 1);
    assert_eq!(substitutions[&variable], string);
}

// =============== EDGE CASES ===============

#[test]
fn empty_constraint_set() {
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let hole = HoleId::new(0);

    let mut solver = InferenceSolver::new(InferenceEnvironment::new(&env).with_constraints([]));
    solver.unification.upsert_variable(VariableKind::Hole(hole));

    let diagnostics = solver.solve().expect_err("solver should error out");

    let diagnostics = diagnostics.into_issues().into_vec();
    assert_eq!(diagnostics.len(), 1);
    assert_eq!(
        diagnostics[0].category,
        TypeCheckDiagnosticCategory::UnconstrainedTypeVariable
    );
}

#[test]
fn redundant_constraints() {
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let hole = HoleId::new(0);
    let string = primitive!(env, PrimitiveType::String);

    let variable = Variable::synthetic(VariableKind::Hole(hole));

    // Add the same constraint multiple times
    let constraints = [
        Constraint::Equals {
            variable,
            r#type: string,
        },
        Constraint::Equals {
            variable,
            r#type: string,
        },
    ];

    let mut solver =
        InferenceSolver::new(InferenceEnvironment::new(&env).with_constraints(constraints));

    let mut graph = Graph::new(&mut solver.unification);
    let bump = Bump::new();
    solver.upsert_variables(&mut graph);
    solver.solve_anti_symmetry(&mut graph, &mut FastHashMap::default(), &bump);
    solver.lattice.set_variables(solver.unification.lookup());

    let mut variables = FastHashMap::default();

    // Apply the constraints
    solver.apply_constraints(&graph, &bump, &mut variables, &mut Vec::new());

    // Despite having duplicate constraints, there should be one entry with one equality
    assert_eq!(variables.len(), 1);
    let (_, (_, constraint)) = variables.iter().next().expect("Should have one constraint");
    assert_eq!(constraint.equal, Some(string));
}

#[test]
fn cyclic_ordering_constraints() {
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let hole1 = HoleId::new(1);
    let hole2 = HoleId::new(2);
    let hole3 = HoleId::new(3);

    let variable1 = Variable::synthetic(VariableKind::Hole(hole1));
    let variable2 = Variable::synthetic(VariableKind::Hole(hole2));
    let variable3 = Variable::synthetic(VariableKind::Hole(hole3));

    // Create a cycle
    let constraints = [
        Constraint::Ordering {
            lower: variable1,
            upper: variable2,
        },
        Constraint::Ordering {
            lower: variable2,
            upper: variable3,
        },
        Constraint::Ordering {
            lower: variable3,
            upper: variable1,
        },
    ];

    let mut solver =
        InferenceSolver::new(InferenceEnvironment::new(&env).with_constraints(constraints));

    // Directly call the anti-symmetry solver
    let mut graph = Graph::new(&mut solver.unification);
    let bump = Bump::new();
    solver.upsert_variables(&mut graph);
    solver.solve_anti_symmetry(&mut graph, &mut FastHashMap::default(), &bump);

    // Verify all variables are unified
    assert!(
        solver
            .unification
            .is_unioned(variable1.kind, variable2.kind)
    );
    assert!(
        solver
            .unification
            .is_unioned(variable2.kind, variable3.kind)
    );
}

#[test]
fn bounds_at_lattice_extremes() {
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let unknown = instantiate(&env, TypeKind::Unknown);
    let never = instantiate(&env, TypeKind::Never);

    let hole = HoleId::new(0);
    let variable = Variable::synthetic(VariableKind::Hole(hole));

    // Test with Any as upper bound and Never as lower bound
    let constraints = [
        Constraint::LowerBound {
            variable,
            bound: never,
        },
        Constraint::UpperBound {
            variable,
            bound: unknown,
        },
    ];

    let mut solver =
        InferenceSolver::new(InferenceEnvironment::new(&env).with_constraints(constraints));

    let mut graph = Graph::new(&mut solver.unification);
    let bump = Bump::new();
    solver.upsert_variables(&mut graph);
    solver.solve_anti_symmetry(&mut graph, &mut FastHashMap::default(), &bump);
    solver.lattice.set_variables(solver.unification.lookup());

    // Apply the constraints
    let mut variables = FastHashMap::default();
    solver.apply_constraints(&graph, &bump, &mut variables, &mut Vec::new());

    assert_eq!(variables.len(), 1);
    let (_, (_, constraint)) = variables.iter().next().expect("Should have one constraint");
    assert_eq!(constraint.lower, [never]);
    assert_eq!(constraint.upper, [unknown]);

    // These bounds should be compatible
    let mut substitutions = FastHashMap::default();
    solver.solve_constraints(
        &graph,
        &bump,
        &variables,
        &mut substitutions,
        &mut Vec::new_in(&bump),
    );
    assert!(solver.diagnostics.is_empty());

    // The variable should be inferred to the lower bound (Never)
    assert_eq!(substitutions[&variable.kind], never);
}

#[test]
fn collect_constraints_with_structural_edge() {
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let hole1 = HoleId::new(1);
    let hole2 = HoleId::new(2);

    let var1 = Variable::synthetic(VariableKind::Hole(hole1));
    let var2 = Variable::synthetic(VariableKind::Hole(hole2));

    // Create a structural edge constraint
    let constraints = [Constraint::Dependency {
        source: var1,
        target: var2,
    }];

    let mut solver =
        InferenceSolver::new(InferenceEnvironment::new(&env).with_constraints(constraints));

    // This should exercise lines 410-418
    let mut variables = FastHashMap::default();
    solver.collect_constraints(&mut variables, &mut Vec::new());

    // Both variables should be in the map even though they don't have direct bounds
    assert!(variables.contains_key(&var1.kind));
    assert!(variables.contains_key(&var2.kind));

    // They should have default constraint values (all None/empty)
    let (_, var1_constraints) = &variables[&var1.kind];
    assert!(var1_constraints.equal.is_none());
    assert!(var1_constraints.lower.is_empty());
    assert!(var1_constraints.upper.is_empty());

    let (_, var2_constraints) = &variables[&var2.kind];
    assert!(var2_constraints.equal.is_none());
    assert!(var2_constraints.lower.is_empty());
    assert!(var2_constraints.upper.is_empty());
}

#[test]
fn collect_constraints_skip_alias() {
    scaffold!(heap, env, _builder);

    let hole1 = HoleId::new(1);
    let variable = Variable::synthetic(VariableKind::Hole(hole1));

    // Create a structural edge constraint
    let constraints = [
        Constraint::LowerBound {
            variable,
            bound: variable.into_type(&env).id,
        },
        Constraint::UpperBound {
            variable,
            bound: variable.into_type(&env).id,
        },
        Constraint::Equals {
            variable,
            r#type: variable.into_type(&env).id,
        },
    ];

    let mut solver =
        InferenceSolver::new(InferenceEnvironment::new(&env).with_constraints(constraints));
    let mut graph = Graph::new(&mut solver.unification);
    solver.upsert_variables(&mut graph);

    let lookup = solver.unification.lookup();
    solver.lattice.set_variables(lookup);

    let mut constraints = FastHashMap::default();
    solver.collect_constraints(&mut constraints, &mut Vec::new());

    assert!(!constraints.contains_key(&variable.kind));
}

// =============== INTEGRATION TESTS ===============

#[test]
fn simple_equality_constraint() {
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let hole = HoleId::new(0);
    let string = primitive!(env, PrimitiveType::String);

    let constraints = [Constraint::Equals {
        variable: Variable::synthetic(VariableKind::Hole(hole)),
        r#type: string,
    }];

    let solver =
        InferenceSolver::new(InferenceEnvironment::new(&env).with_constraints(constraints));
    let Success {
        value: substitution,
        advisories,
    } = solver.solve().expect("should have solved");
    assert!(advisories.is_empty());

    let inferred_type = substitution.infer(hole).expect("should have inferred type");
    assert_equiv!(env, [inferred_type], [string]);
}

#[test]
fn anti_symmetry_integration() {
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let hole1 = HoleId::new(1);
    let hole2 = HoleId::new(2);
    let string = primitive!(env, PrimitiveType::String);

    let variable1 = Variable::synthetic(VariableKind::Hole(hole1));
    let variable2 = Variable::synthetic(VariableKind::Hole(hole2));

    let constraints = [
        // X <: Y and Y <: X means X ≡ Y
        Constraint::Ordering {
            lower: variable1,
            upper: variable2,
        },
        Constraint::Ordering {
            lower: variable2,
            upper: variable1,
        },
        // Add concrete type for one of them
        Constraint::Equals {
            variable: variable1,
            r#type: string,
        },
    ];

    let solver =
        InferenceSolver::new(InferenceEnvironment::new(&env).with_constraints(constraints));
    let Success {
        value: substitution,
        advisories,
    } = solver.solve().expect("should have solved");
    assert!(advisories.is_empty());

    // Both variables should be inferred to the same type
    let type1 = substitution
        .infer(hole1)
        .expect("should have inferred type for hole1");
    let type2 = substitution
        .infer(hole2)
        .expect("should have inferred type for hole2");

    assert_equiv!(env, [type1], [type2]);
    assert_equiv!(env, [type1], [string]);
}

#[test]
fn conflicting_equality_constraints() {
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let hole = HoleId::new(0);
    let string = primitive!(env, PrimitiveType::String);
    let number = primitive!(env, PrimitiveType::Number);

    let constraints = [
        Constraint::Equals {
            variable: Variable::synthetic(VariableKind::Hole(hole)),
            r#type: string,
        },
        Constraint::Equals {
            variable: Variable::synthetic(VariableKind::Hole(hole)),
            r#type: number,
        },
    ];

    let solver =
        InferenceSolver::new(InferenceEnvironment::new(&env).with_constraints(constraints));
    let diagnostics = solver.solve().expect_err("solver should error out");

    let diagnostics = diagnostics.into_issues().into_vec();
    assert_eq!(diagnostics.len(), 1);
    assert_eq!(
        diagnostics[0].category,
        TypeCheckDiagnosticCategory::ConflictingEqualityConstraints
    );
}

#[test]
fn disconnected_constraint_graphs() {
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let hole1 = HoleId::new(1);
    let hole2 = HoleId::new(2);
    let hole3 = HoleId::new(3);
    let hole4 = HoleId::new(4);

    let string = primitive!(env, PrimitiveType::String);
    let number = primitive!(env, PrimitiveType::Number);

    let variable1 = Variable::synthetic(VariableKind::Hole(hole1));
    let variable2 = Variable::synthetic(VariableKind::Hole(hole2));
    let variable3 = Variable::synthetic(VariableKind::Hole(hole3));
    let variable4 = Variable::synthetic(VariableKind::Hole(hole4));

    let constraints = [
        // Group 1: holes 1 and 2
        Constraint::Ordering {
            lower: variable1,
            upper: variable2,
        },
        Constraint::Equals {
            variable: variable1,
            r#type: string,
        },
        // Group 2: holes 3 and 4
        Constraint::Ordering {
            lower: variable3,
            upper: variable4,
        },
        Constraint::Equals {
            variable: variable4,
            r#type: number,
        },
    ];

    let solver =
        InferenceSolver::new(InferenceEnvironment::new(&env).with_constraints(constraints));
    let Success {
        value: substitution,
        advisories,
    } = solver.solve().expect("should have solved");
    assert!(advisories.is_empty());

    // Group 1 should be resolved to string
    let type1 = substitution
        .infer(hole1)
        .expect("should have inferred type for hole1");
    let type2 = substitution
        .infer(hole2)
        .expect("should have inferred type for hole2");
    assert_equiv!(env, [type1], [string], substitution.clone());
    assert_equiv!(env, [type2], [string], substitution.clone());

    // Group 2 should be resolved to number
    let type3 = substitution
        .infer(hole3)
        .expect("should have inferred type for hole3");
    let type4 = substitution
        .infer(hole4)
        .expect("should have inferred type for hole4");
    assert_equiv!(env, [type3], [number], substitution.clone());
    assert_equiv!(env, [type4], [number], substitution);
}

#[test]
fn propagate() {
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let hole1 = HoleId::new(1);
    let hole2 = HoleId::new(2);
    let hole3 = HoleId::new(3);
    let hole4 = HoleId::new(4);

    let string = primitive!(env, PrimitiveType::String);
    let number = primitive!(env, PrimitiveType::Number);

    let variable1 = Variable::synthetic(VariableKind::Hole(hole1));
    let variable2 = Variable::synthetic(VariableKind::Hole(hole2));
    let variable3 = Variable::synthetic(VariableKind::Hole(hole3));
    let variable4 = Variable::synthetic(VariableKind::Hole(hole4));

    let constraints = [
        // Group 1: holes 1 and 2
        Constraint::Ordering {
            lower: variable1,
            upper: variable2,
        },
        Constraint::UpperBound {
            variable: variable2,
            bound: string,
        },
        // Group 2: holes 3 and 4
        Constraint::Ordering {
            lower: variable3,
            upper: variable4,
        },
        Constraint::LowerBound {
            variable: variable3,
            bound: number,
        },
    ];

    let solver =
        InferenceSolver::new(InferenceEnvironment::new(&env).with_constraints(constraints));
    let Success {
        value: substitution,
        advisories,
    } = solver.solve().expect("should have solved");
    assert!(advisories.is_empty());

    // Group 1 should be resolved to string
    let type1 = substitution
        .infer(hole1)
        .expect("should have inferred type for hole1");
    let type2 = substitution
        .infer(hole2)
        .expect("should have inferred type for hole2");
    assert_equiv!(env, [type1], [string], substitution.clone());
    assert_equiv!(env, [type2], [string], substitution.clone());

    // Group 2 should be resolved to number
    let type3 = substitution
        .infer(hole3)
        .expect("should have inferred type for hole3");
    let type4 = substitution
        .infer(hole4)
        .expect("should have inferred type for hole4");
    assert_equiv!(env, [type3], [number], substitution.clone());
    assert_equiv!(env, [type4], [number], substitution);
}

#[test]
fn contract() {
    let heap = Heap::new();
    let mut env = Environment::new(SpanId::SYNTHETIC, &heap);

    // check if `_1 <: (name: _2)`, `_2 <: (name: _1)` yields `_1 = (name: _1)`
    let hole1 = HoleId::new(1);
    let hole2 = HoleId::new(2);

    let variable1 = Variable::synthetic(VariableKind::Hole(hole1));
    let variable2 = Variable::synthetic(VariableKind::Hole(hole2));

    let person1 = r#struct!(
        env,
        [struct_field!(env, "name", instantiate_infer(&env, hole2))]
    );

    let person2 = r#struct!(
        env,
        [struct_field!(env, "name", instantiate_infer(&env, hole1))]
    );

    let constraints = [
        Constraint::UpperBound {
            variable: variable1,
            bound: person1,
        },
        Constraint::UpperBound {
            variable: variable2,
            bound: person2,
        },
    ];

    let solver =
        InferenceSolver::new(InferenceEnvironment::new(&env).with_constraints(constraints));
    let Success {
        value: substitution,
        advisories,
    } = solver.solve().expect("should have solved");
    assert!(advisories.is_empty());

    env.substitution = substitution.clone();

    let expected = env
        .types
        .intern(|id| PartialType {
            span: SpanId::SYNTHETIC,
            kind: env.intern_kind(TypeKind::Struct(StructType {
                fields: env
                    .intern_struct_fields(&mut [StructField {
                        name: env.heap.intern_symbol("name"),
                        value: id.value(),
                    }])
                    .expect("should be unique"),
            })),
        })
        .id;

    let actual = substitution
        .infer(hole1)
        .expect("should have unified hole 1");

    assert_equiv!(env, [actual], [expected], substitution);
}

#[test]
fn do_not_double_emit_on_unconstrained_variables() {
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let hole1 = HoleId::new(1);
    let hole2 = HoleId::new(2);

    let variable1 = Variable::synthetic(VariableKind::Hole(hole1));
    let variable2 = Variable::synthetic(VariableKind::Hole(hole2));

    let constraints = [Constraint::Ordering {
        lower: variable1,
        upper: variable2,
    }];

    let solver =
        InferenceSolver::new(InferenceEnvironment::new(&env).with_constraints(constraints));
    let diagnostics = solver.solve().expect_err("solver should error out");
    let diagnostics = diagnostics.into_issues().into_vec();

    assert_eq!(diagnostics.len(), 2);

    assert_eq!(
        diagnostics[0].category,
        TypeCheckDiagnosticCategory::UnconstrainedTypeVariable
    );
    assert_eq!(
        diagnostics[1].category,
        TypeCheckDiagnosticCategory::UnconstrainedTypeVariable
    );
}

#[test]
fn pipeline_environment_to_solver() {
    // (_1 | String) <: Number
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let hole1 = HoleId::new(1);

    let union = union!(
        env,
        [
            instantiate_infer(&env, hole1),
            primitive!(env, PrimitiveType::String)
        ]
    );

    let number = primitive!(env, PrimitiveType::Number);

    let mut environment = InferenceEnvironment::new(&env);
    environment.collect_constraints(Variance::Covariant, union, number);

    let solver = environment.into_solver();
    let Success {
        value: substitution,
        advisories,
    } = solver.solve().expect("should have solved");
    assert!(advisories.is_empty());

    assert_equiv!(
        env,
        [substitution
            .infer(hole1)
            .expect("should have inferred hole")],
        [number]
    );
}

#[test]
fn single_projection() {
    // given: `T = (a: String)`
    // do: `T.a`
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let r#struct = r#struct!(
        env,
        [struct_field!(
            env,
            "a",
            primitive!(env, PrimitiveType::String)
        )]
    );

    let mut environment = InferenceEnvironment::new(&env);
    let variable = environment.add_projection(
        SpanId::SYNTHETIC,
        r#struct,
        Ident::synthetic(heap.intern_symbol("a")),
    );

    let solver = environment.into_solver();
    let Success {
        value: substitution,
        advisories,
    } = solver.solve().expect("should have solved");
    assert!(advisories.is_empty());

    assert_equiv!(
        env,
        [substitution
            .infer(variable.kind.hole().expect("variable should be hole"))
            .expect("should have inferred variable")],
        [primitive!(env, PrimitiveType::String)]
    );
}

#[test]
fn multi_projection() {
    // given: `T = (a: (b: String))`
    // do: `T.a.b`
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let r#struct = r#struct!(
        env,
        [struct_field!(
            env,
            "a",
            r#struct!(
                env,
                [struct_field!(
                    env,
                    "b",
                    primitive!(env, PrimitiveType::String)
                )]
            )
        )]
    );

    let mut environment = InferenceEnvironment::new(&env);
    let variable = environment.add_projection(
        SpanId::SYNTHETIC,
        r#struct,
        Ident::synthetic(heap.intern_symbol("a")),
    );
    let variable = environment.add_projection(
        SpanId::SYNTHETIC,
        variable.into_type(&env).id,
        Ident::synthetic(heap.intern_symbol("b")),
    );

    let solver = environment.into_solver();
    let Success {
        value: substitution,
        advisories,
    } = solver.solve().expect("should have solved");
    assert!(advisories.is_empty());

    assert_equiv!(
        env,
        [substitution
            .infer(variable.kind.hole().expect("variable should be hole"))
            .expect("should have inferred variable")],
        [primitive!(env, PrimitiveType::String)]
    );
}

#[test]
fn early_projection() {
    // given:
    //  T = _1
    //  _1 = (a: String)
    //  T.a
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let hole = env.counter.hole.next();
    let variable = instantiate_infer(&env, hole);

    let mut environment = InferenceEnvironment::new(&env);

    environment.collect_constraints(
        Variance::Covariant,
        variable,
        r#struct!(
            env,
            [struct_field!(
                env,
                "a",
                primitive!(env, PrimitiveType::String)
            )]
        ),
    );

    let variable = environment.add_projection(
        SpanId::SYNTHETIC,
        variable,
        Ident::synthetic(heap.intern_symbol("a")),
    );

    let solver = environment.into_solver();
    let Success {
        value: substitution,
        advisories,
    } = solver.solve().expect("should have solved");
    assert!(advisories.is_empty());

    assert_equiv!(
        env,
        [substitution
            .infer(variable.kind.hole().expect("variable should be hole"))
            .expect("should have inferred variable")],
        [primitive!(env, PrimitiveType::String)]
    );
}

#[test]
fn late_projection() {
    // given:
    //  T = _1
    //  T.a
    //  _1 = (a: String)
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let hole = env.counter.hole.next();
    let variable = instantiate_infer(&env, hole);

    let mut environment = InferenceEnvironment::new(&env);

    let access = environment.add_projection(
        SpanId::SYNTHETIC,
        variable,
        Ident::synthetic(heap.intern_symbol("a")),
    );

    environment.collect_constraints(
        Variance::Covariant,
        variable,
        r#struct!(
            env,
            [struct_field!(
                env,
                "a",
                primitive!(env, PrimitiveType::String)
            )]
        ),
    );

    let solver = environment.into_solver();
    let Success {
        value: substitution,
        advisories,
    } = solver.solve().expect("should have solved");
    assert!(advisories.is_empty());

    assert_equiv!(
        env,
        [substitution
            .infer(access.kind.hole().expect("variable should be hole"))
            .expect("should have inferred variable")],
        [primitive!(env, PrimitiveType::String)]
    );
}

#[test]
fn unconstrained_projection() {
    // given:
    // T = _1
    // T.a
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let hole = env.counter.hole.next();
    let variable = instantiate_infer(&env, hole);

    let mut environment = InferenceEnvironment::new(&env);

    environment.add_projection(
        SpanId::SYNTHETIC,
        variable,
        Ident::synthetic(heap.intern_symbol("a")),
    );

    let solver = environment.into_solver();
    let diagnostics = solver.solve().expect_err("solver should error out");
    let diagnostics = diagnostics.into_issues();
    assert_eq!(diagnostics.len(), 2);

    let diagnostics = diagnostics.into_vec();
    // First one is for the variable `_1` which is unconstrained
    assert_eq!(
        diagnostics[0].category,
        TypeCheckDiagnosticCategory::UnconstrainedTypeVariable
    );
    // ... second one is for `_1.a` which is subsequently also unconstrained
    assert_eq!(
        diagnostics[1].category,
        TypeCheckDiagnosticCategory::UnresolvedSelectionConstraint
    );
}

#[test]
fn recursive_projection() {
    // given:
    // T = T
    // T.a
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let circular = env.types.intern(|id| PartialType {
        span: SpanId::SYNTHETIC,
        kind: env.intern_kind(TypeKind::Opaque(OpaqueType {
            name: heap.intern_symbol("example"),
            repr: id.value(),
        })),
    });

    let mut environment = InferenceEnvironment::new(&env);

    environment.add_projection(
        SpanId::SYNTHETIC,
        circular.id,
        Ident::synthetic(heap.intern_symbol("a")),
    );

    let solver = environment.into_solver();
    let diagnostics = solver.solve().expect_err("solver should error out");
    let diagnostics = diagnostics.into_issues();
    assert_eq!(diagnostics.len(), 2);

    let diagnostics = diagnostics.into_vec();
    // The variable we've chosen for the projection
    assert_eq!(
        diagnostics[0].category,
        TypeCheckDiagnosticCategory::UnconstrainedTypeVariable
    );
    // ... and the circular type it's referencing
    assert_eq!(
        diagnostics[1].category,
        TypeCheckDiagnosticCategory::RecursiveTypeProjection
    );
}

#[test]
fn projection_equality_constraint() {
    // T = (a: _1)
    // T.a
    // _2 = String
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let hole1 = env.counter.hole.next();
    let hole1_type = instantiate_infer(&env, hole1);

    let r#struct = r#struct!(env, [struct_field!(env, "a", hole1_type)]);

    let mut environment = InferenceEnvironment::new(&env);

    let variable = environment.add_projection(
        SpanId::SYNTHETIC,
        r#struct,
        Ident::synthetic(heap.intern_symbol("a")),
    );

    environment.collect_constraints(
        Variance::Covariant,
        variable.into_type(&env).id,
        primitive!(env, PrimitiveType::String),
    );

    let solver = environment.into_solver();
    let Success {
        value: substitution,
        advisories,
    } = solver.solve().expect("should have solved");
    assert!(advisories.is_empty());

    assert_equiv!(
        env,
        [substitution
            .infer(hole1)
            .expect("should have inferred variable")],
        [primitive!(env, PrimitiveType::String)]
    );
}

#[test]
fn projection_unify_variables_lower() {
    // T = (a: _1)
    // _1 <: Number
    // T.a (_2)
    // _2 <: Integer
    // `_1 = _2 = Integer`
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let hole1 = env.counter.hole.next();
    let hole1_type = instantiate_infer(&env, hole1);

    let r#struct = r#struct!(env, [struct_field!(env, "a", hole1_type)]);

    let mut environment = InferenceEnvironment::new(&env);
    environment.collect_constraints(
        Variance::Covariant,
        hole1_type,
        primitive!(env, PrimitiveType::Number),
    );

    let variable = environment.add_projection(
        SpanId::SYNTHETIC,
        r#struct,
        Ident::synthetic(heap.intern_symbol("a")),
    );

    environment.collect_constraints(
        Variance::Covariant,
        variable.into_type(&env).id,
        primitive!(env, PrimitiveType::Integer),
    );

    let solver = environment.into_solver();
    let Success {
        value: substitution,
        advisories,
    } = solver.solve().expect("should have solved");
    assert!(advisories.is_empty());

    assert_equiv!(
        env,
        [substitution
            .infer(hole1)
            .expect("should have inferred variable")],
        [primitive!(env, PrimitiveType::Integer)]
    );
}

#[test]
fn projection_unify_variables_upper() {
    // T = (a: _1)
    // Number <: _1
    // T.a (_2)
    // Integer <: _2
    // `_1 = _2 = Number`
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let hole1 = env.counter.hole.next();
    let hole1_type = instantiate_infer(&env, hole1);

    let r#struct = r#struct!(env, [struct_field!(env, "a", hole1_type)]);

    let mut environment = InferenceEnvironment::new(&env);
    environment.collect_constraints(
        Variance::Covariant,
        primitive!(env, PrimitiveType::Number),
        hole1_type,
    );

    let variable = environment.add_projection(
        SpanId::SYNTHETIC,
        r#struct,
        Ident::synthetic(heap.intern_symbol("a")),
    );

    environment.collect_constraints(
        Variance::Covariant,
        primitive!(env, PrimitiveType::Integer),
        variable.into_type(&env).id,
    );

    let solver = environment.into_solver();
    let Success {
        value: substitution,
        advisories,
    } = solver.solve().expect("should have solved");
    assert!(advisories.is_empty());

    assert_equiv!(
        env,
        [substitution
            .infer(hole1)
            .expect("should have inferred variable")],
        [primitive!(env, PrimitiveType::Number)]
    );
}

#[test]
fn projection_unify_variables_equal_is_equivalent() {
    // T = (a: _1)
    // Number = _1
    // T.a (_2)
    // Number = _2
    // `_1 = _2 = Number`
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let hole1 = env.counter.hole.next();
    let hole1_type = instantiate_infer(&env, hole1);

    let r#struct = r#struct!(env, [struct_field!(env, "a", hole1_type)]);

    let mut environment = InferenceEnvironment::new(&env);
    environment.add_constraint(Constraint::Equals {
        variable: Variable {
            span: SpanId::SYNTHETIC,
            kind: VariableKind::Hole(hole1),
        },
        r#type: primitive!(env, PrimitiveType::Number),
    });

    let variable = environment.add_projection(
        SpanId::SYNTHETIC,
        r#struct,
        Ident::synthetic(heap.intern_symbol("a")),
    );

    environment.add_constraint(Constraint::Equals {
        variable,
        r#type: primitive!(env, PrimitiveType::Number),
    });

    let solver = environment.into_solver();
    let Success {
        value: substitution,
        advisories,
    } = solver.solve().expect("should have solved");
    assert!(advisories.is_empty());

    assert_equiv!(
        env,
        [substitution
            .infer(hole1)
            .expect("should have inferred variable")],
        [primitive!(env, PrimitiveType::Number)]
    );
}

#[test]
fn projection_unify_variables_equal_is_not_equivalent() {
    // T = (a: _1)
    // Number = _1
    // T.a (_2)
    // Integer = _2
    // `_1 = _2 != Number`
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let hole1 = env.counter.hole.next();
    let hole1_type = instantiate_infer(&env, hole1);

    let r#struct = r#struct!(env, [struct_field!(env, "a", hole1_type)]);

    let mut environment = InferenceEnvironment::new(&env);
    environment.add_constraint(Constraint::Equals {
        variable: Variable {
            span: SpanId::SYNTHETIC,
            kind: VariableKind::Hole(hole1),
        },
        r#type: primitive!(env, PrimitiveType::Number),
    });

    let variable = environment.add_projection(
        SpanId::SYNTHETIC,
        r#struct,
        Ident::synthetic(heap.intern_symbol("a")),
    );

    environment.add_constraint(Constraint::Equals {
        variable,
        r#type: primitive!(env, PrimitiveType::Integer),
    });

    let solver = environment.into_solver();
    let diagnostics = solver.solve().expect_err("solver should error out");

    let diagnostics = diagnostics.into_issues().into_vec();

    assert_eq!(diagnostics.len(), 1);
    assert_eq!(
        diagnostics[0].category,
        TypeCheckDiagnosticCategory::ConflictingEqualityConstraints
    );
}

#[test]
fn projection_simplify() {
    // T = ((a: String) | Null) & (a: String)
    // T.a
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let r#struct = r#struct!(
        env,
        [struct_field!(
            env,
            "a",
            primitive!(env, PrimitiveType::String)
        )]
    );

    let union = union!(env, [r#struct, primitive!(env, PrimitiveType::Null)]);
    let intersection = intersection!(env, [union, r#struct]);

    let mut environment = InferenceEnvironment::new(&env);

    let variable = environment.add_projection(
        SpanId::SYNTHETIC,
        intersection,
        Ident::synthetic(heap.intern_symbol("a")),
    );

    let solver = environment.into_solver();
    let Success {
        value: substitution,
        advisories,
    } = solver.solve().expect("should have solved");
    assert!(advisories.is_empty());

    assert_equiv!(
        env,
        [substitution
            .infer(variable.kind.hole().expect("should be hole"))
            .expect("should have inferred variable")],
        [primitive!(env, PrimitiveType::String)]
    );
}

#[test]
fn single_subscript() {
    // T = Number[]
    // T[0]
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let list = list!(env, primitive!(env, PrimitiveType::Number));

    let mut environment = InferenceEnvironment::new(&env);
    let variable = environment.add_subscript(
        SpanId::SYNTHETIC,
        list,
        primitive!(env, PrimitiveType::Integer),
    );

    let solver = environment.into_solver();
    let Success {
        value: substitution,
        advisories,
    } = solver.solve().expect("should have solved");
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
                primitive!(env, PrimitiveType::Number)
            ]
        )]
    );
}

#[test]
fn multi_subscript() {
    // given:
    // T = List<List<String>>
    // T[0]?[0]
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let list = list!(env, list!(env, primitive!(env, PrimitiveType::String)));

    let mut environment = InferenceEnvironment::new(&env);

    let first = environment.add_subscript(
        SpanId::SYNTHETIC,
        list,
        primitive!(env, PrimitiveType::Integer),
    );

    // remove `Null` from the first union
    let second = environment.add_subscript(
        SpanId::SYNTHETIC,
        intersection!(
            env,
            [
                first.into_type(&env).id,
                list!(env, primitive!(env, PrimitiveType::String))
            ]
        ),
        primitive!(env, PrimitiveType::Integer),
    );

    let solver = environment.into_solver();
    let Success {
        value: substitution,
        advisories,
    } = solver.solve().expect("should have solved");
    assert!(advisories.is_empty());

    assert_equiv!(
        env,
        [substitution
            .infer(second.kind.hole().expect("variable should be hole"))
            .expect("should have inferred variable")],
        [union!(
            env,
            [
                primitive!(env, PrimitiveType::String),
                primitive!(env, PrimitiveType::Null)
            ]
        )]
    );
}

#[test]
fn early_subscript() {
    // given:
    //  T = _1
    //  _1 = List<String>
    //  T[0]
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let hole = env.counter.hole.next();
    let variable = instantiate_infer(&env, hole);

    let mut environment = InferenceEnvironment::new(&env);

    environment.collect_constraints(
        Variance::Covariant,
        variable,
        list!(env, primitive!(env, PrimitiveType::String)),
    );

    let variable = environment.add_subscript(
        SpanId::SYNTHETIC,
        variable,
        primitive!(env, PrimitiveType::Integer),
    );

    let solver = environment.into_solver();
    let Success {
        value: substitution,
        advisories,
    } = solver.solve().expect("should have solved");
    assert!(advisories.is_empty());

    assert_equiv!(
        env,
        [substitution
            .infer(variable.kind.hole().expect("variable should be hole"))
            .expect("should have inferred variable")],
        [union!(
            env,
            [
                primitive!(env, PrimitiveType::String),
                primitive!(env, PrimitiveType::Null)
            ]
        )]
    );
}

#[test]
fn late_subscript() {
    // given:
    //  T = _1
    //  T[0]
    //  _1 = List<String>
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let hole = env.counter.hole.next();
    let hole_type = instantiate_infer(&env, hole);

    let mut environment = InferenceEnvironment::new(&env);

    let variable = environment.add_subscript(
        SpanId::SYNTHETIC,
        hole_type,
        primitive!(env, PrimitiveType::Integer),
    );

    environment.collect_constraints(
        Variance::Covariant,
        hole_type,
        list!(env, primitive!(env, PrimitiveType::String)),
    );

    let solver = environment.into_solver();
    let Success {
        value: substitution,
        advisories,
    } = solver.solve().expect("should have solved");
    assert!(advisories.is_empty());

    assert_equiv!(
        env,
        [substitution
            .infer(variable.kind.hole().expect("variable should be hole"))
            .expect("should have inferred variable")],
        [union!(
            env,
            [
                primitive!(env, PrimitiveType::String),
                primitive!(env, PrimitiveType::Null)
            ]
        )]
    );
}

#[test]
fn recursive_subscript() {
    // given:
    // T = T
    // T[0]
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let circular = env.types.intern(|id| PartialType {
        span: SpanId::SYNTHETIC,
        kind: env.intern_kind(TypeKind::Opaque(OpaqueType {
            name: heap.intern_symbol("example"),
            repr: id.value(),
        })),
    });

    let mut environment = InferenceEnvironment::new(&env);

    environment.add_subscript(
        SpanId::SYNTHETIC,
        circular.id,
        primitive!(env, PrimitiveType::Integer),
    );

    let solver = environment.into_solver();
    let diagnostics = solver.solve().expect_err("solver should error out");
    let diagnostics = diagnostics.into_issues();
    assert_eq!(diagnostics.len(), 2);

    let diagnostics = diagnostics.into_vec();
    // The variable we've chosen for the projection
    assert_eq!(
        diagnostics[0].category,
        TypeCheckDiagnosticCategory::UnconstrainedTypeVariable
    );
    // ... and the circular type it's referencing
    assert_eq!(
        diagnostics[1].category,
        TypeCheckDiagnosticCategory::RecursiveTypeSubscript
    );
}

#[test]
fn unconstrained_element_subscript() {
    // T = _1
    // T[0]
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let hole = env.counter.hole.next();

    let mut environment = InferenceEnvironment::new(&env);

    environment.add_subscript(
        SpanId::SYNTHETIC,
        instantiate_infer(&env, hole),
        primitive!(env, PrimitiveType::Integer),
    );

    let solver = environment.into_solver();
    let diagnostics = solver.solve().expect_err("solver should error out");
    let diagnostics = diagnostics.into_issues();

    assert_eq!(diagnostics.len(), 2);
    let diagnostics = diagnostics.into_vec();

    assert_eq!(
        diagnostics[0].category,
        TypeCheckDiagnosticCategory::UnconstrainedTypeVariable
    );
    assert_eq!(
        diagnostics[1].category,
        TypeCheckDiagnosticCategory::UnresolvedSelectionConstraint
    );
}

#[test]
fn discharged_element_subscript() {
    // T = _1[]
    // _1 <: String
    // T[0]
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let hole = env.counter.hole.next();

    let list = list!(env, instantiate_infer(&env, hole));

    let mut environment = InferenceEnvironment::new(&env);

    environment.collect_constraints(
        Variance::Covariant,
        instantiate_infer(&env, hole),
        primitive!(env, PrimitiveType::String),
    );

    let variable = environment.add_subscript(
        SpanId::SYNTHETIC,
        list,
        primitive!(env, PrimitiveType::Integer),
    );

    let solver = environment.into_solver();
    let Success {
        value: substitution,
        advisories,
    } = solver.solve().expect("should have solved");
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
fn discharged_index_subscript() {
    // T = Number[]
    // T[_1]
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let hole = env.counter.hole.next();

    let list = list!(env, primitive!(env, PrimitiveType::Number));

    let mut environment = InferenceEnvironment::new(&env);
    let variable =
        environment.add_subscript(SpanId::SYNTHETIC, list, instantiate_infer(&env, hole));

    let solver = environment.into_solver();
    let Success {
        value: substitution,
        advisories,
    } = solver.solve().expect("should have solved");
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
                primitive!(env, PrimitiveType::Number)
            ]
        )]
    );
    assert_equiv!(
        env,
        [substitution
            .infer(hole)
            .expect("should have inferred variable")],
        [primitive!(env, PrimitiveType::Integer)]
    );
}

#[test]
fn multiple_upper_bounds() {
    // T <: Number
    // T <: Integer
    // then T should be `Integer`
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let hole = env.counter.hole.next();
    let variable = Variable::synthetic(VariableKind::Hole(hole));

    let number = primitive!(env, PrimitiveType::Number);
    let integer = primitive!(env, PrimitiveType::Integer);

    let mut inference = InferenceEnvironment::new(&env);
    inference.add_constraint(Constraint::UpperBound {
        variable,
        bound: number,
    });
    inference.add_constraint(Constraint::UpperBound {
        variable,
        bound: integer,
    });

    let Success {
        value: substitution,
        advisories,
    } = inference.into_solver().solve().expect("should have solved");
    assert!(advisories.is_empty());

    assert_equiv!(
        env,
        [substitution.infer(hole).expect("should've been inferred")],
        [integer]
    );
}

#[test]
fn multiple_lower_bounds() {
    // Number <: T
    // Integer <: T
    // then T should be `Number`
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let hole = env.counter.hole.next();
    let variable = Variable::synthetic(VariableKind::Hole(hole));

    let number = primitive!(env, PrimitiveType::Number);
    let integer = primitive!(env, PrimitiveType::Integer);

    let mut inference = InferenceEnvironment::new(&env);
    inference.add_constraint(Constraint::LowerBound {
        variable,
        bound: number,
    });
    inference.add_constraint(Constraint::LowerBound {
        variable,
        bound: integer,
    });

    let Success {
        value: substitution,
        advisories,
    } = inference.into_solver().solve().expect("should have solved");
    assert!(advisories.is_empty());

    assert_equiv!(
        env,
        [substitution.infer(hole).expect("should've been inferred")],
        [number]
    );
}

#[test]
fn unconstrained_hole() {
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let hole = env.counter.hole.next();
    let variable = Variable::synthetic(VariableKind::Hole(hole));

    let mut inference = InferenceEnvironment::new(&env);
    inference.add_constraint(Constraint::Unify {
        lhs: variable,
        rhs: variable,
    });

    let solver = inference.into_solver();
    let diagnostics = solver.solve().expect_err("solver should error out");
    let diagnostics = diagnostics.into_issues();
    assert_eq!(diagnostics.len(), 1);
    let diagnostics = diagnostics.into_vec();
    assert_eq!(
        diagnostics[0].category,
        TypeCheckDiagnosticCategory::UnconstrainedTypeVariable
    );
}

#[test]
fn unconstrained_generic() {
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let generic = env.counter.generic_argument.next();
    let variable = Variable::synthetic(VariableKind::Generic(generic));

    let mut inference = InferenceEnvironment::new(&env);
    inference.add_constraint(Constraint::Unify {
        lhs: variable,
        rhs: variable,
    });

    let solver = inference.into_solver();
    let Success {
        value: _substitution,
        advisories,
    } = solver.solve().expect("should have solved");
    assert!(advisories.is_empty());
}

// If we have two different incompatible upper constraints the user should be notified.
#[test]
fn incompatible_upper_constraints() {
    scaffold!(heap, env, builder);

    let hole = env.counter.hole.next();
    let variable = Variable::synthetic(VariableKind::Hole(hole));

    let string = builder.string();
    let integer = builder.integer();

    let mut inference = InferenceEnvironment::new(&env);
    inference.add_constraint(Constraint::UpperBound {
        variable,
        bound: string,
    });
    inference.add_constraint(Constraint::UpperBound {
        variable,
        bound: integer,
    });

    let solver = inference.into_solver();
    let diagnostics = solver.solve().expect_err("solver should error out");
    let diagnostics = diagnostics.into_issues();
    assert_eq!(diagnostics.len(), 1);
    let diagnostics = diagnostics.into_vec();
    assert_eq!(
        diagnostics[0].category,
        TypeCheckDiagnosticCategory::UnsatisfiableUpperConstraint
    );
}

// but if the variable is just `!`, that's fine
#[test]
fn never_upper_constraints() {
    scaffold!(heap, env, builder);

    let hole = env.counter.hole.next();
    let variable = Variable::synthetic(VariableKind::Hole(hole));

    let never = builder.never();

    let mut inference = InferenceEnvironment::new(&env);
    inference.add_constraint(Constraint::UpperBound {
        variable,
        bound: never,
    });
    inference.add_constraint(Constraint::UpperBound {
        variable,
        bound: never,
    });

    let solver = inference.into_solver();
    let Success {
        value: _substitution,
        advisories,
    } = solver.solve().expect("should have solved");
    assert!(advisories.is_empty());
}

#[test]
fn deferred_lower_constraint() {
    // ?1 <: ?2
    // Number <: ?2
    // -> ?1 = Number
    scaffold!(heap, env, builder);

    let hole1 = builder.fresh_hole();
    let variable1 = Variable::synthetic(VariableKind::Hole(hole1));

    let hole2 = builder.fresh_hole();
    let variable2 = Variable::synthetic(VariableKind::Hole(hole2));

    let number = builder.number();

    let mut inference = InferenceEnvironment::new(&env);
    inference.add_constraint(Constraint::Ordering {
        lower: variable1,
        upper: variable2,
    });
    inference.add_constraint(Constraint::LowerBound {
        bound: number,
        variable: variable2,
    });

    let solver = inference.into_solver();
    let Success {
        value: substitution,
        advisories,
    } = solver.solve().expect("should have solved");
    assert!(advisories.is_empty());

    assert_equivalent(
        &env,
        substitution.infer(hole1).expect("should be resolved"),
        number,
    );
}

#[test]
fn deferred_upper_constraint() {
    // ?1 <: ?2
    // ?1 <: Number
    // -> ?2 = Number
    scaffold!(heap, env, builder);

    let hole1 = builder.fresh_hole();
    let variable1 = Variable::synthetic(VariableKind::Hole(hole1));

    let hole2 = builder.fresh_hole();
    let variable2 = Variable::synthetic(VariableKind::Hole(hole2));

    let number = builder.number();

    let mut inference = InferenceEnvironment::new(&env);
    inference.add_constraint(Constraint::Ordering {
        lower: variable1,
        upper: variable2,
    });
    inference.add_constraint(Constraint::UpperBound {
        variable: variable1,
        bound: number,
    });

    let solver = inference.into_solver();
    let Success {
        value: substitution,
        advisories,
    } = solver.solve().expect("should have solved");
    assert!(advisories.is_empty());

    assert_equivalent(
        &env,
        substitution.infer(hole2).expect("should be resolved"),
        number,
    );
}

// The problem that we currently have is that when we have a nested inference constraint we do
// **not** "freeze" a variable in place when we've already determined it's type. We require doing
// so, so that we can propagate the type.
#[test]
fn nested_inference_constraints() {
    // List<?1> <: ?2
    // ?2 <: List<String>
    // -> ?1 <: String
    // -> ?1 = String
    scaffold!(heap, env, builder);

    let hole1 = builder.fresh_hole();

    let hole2 = builder.fresh_hole();

    let string = builder.string();

    let mut inference = InferenceEnvironment::new(&env);
    inference.collect_constraints(
        Variance::Covariant,
        builder.list(builder.infer(hole1)),
        builder.infer(hole2),
    );
    inference.collect_constraints(
        Variance::Covariant,
        builder.infer(hole2),
        builder.list(string),
    );

    let solver = inference.into_solver();
    let Success {
        value: substitution,
        advisories,
    } = solver.solve().expect("should have solved");
    assert!(advisories.is_empty());

    assert_equivalent(
        &env,
        substitution.infer(hole1).expect("should be resolved"),
        string,
    );
}
