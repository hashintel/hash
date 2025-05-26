use bumpalo::Bump;

use super::{Constraint, InferenceSolver, VariableConstraint};
use crate::{
    collection::{FastHashMap, SmallVec},
    heap::Heap,
    pretty::PrettyPrint as _,
    span::SpanId,
    symbol::Ident,
    r#type::{
        PartialType,
        environment::{AnalysisEnvironment, Environment, InferenceEnvironment},
        error::TypeCheckDiagnosticCategory,
        inference::{
            Variable, VariableKind,
            solver::{Unification, graph::Graph},
        },
        kind::{
            OpaqueType, PrimitiveType, StructType, TypeKind, UnionType,
            infer::HoleId,
            r#struct::StructField,
            test::{assert_equiv, primitive, r#struct, struct_field, union},
        },
        test::{instantiate, instantiate_infer},
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

    let constraints = vec![
        Constraint::Ordering {
            lower: kind1,
            upper: kind2,
        },
        Constraint::Ordering {
            lower: kind2,
            upper: kind1,
        },
    ];

    let mut solver = InferenceSolver::new(&env, Unification::new(), constraints);

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

    let constraints = vec![
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

    let mut solver = InferenceSolver::new(&env, Unification::new(), constraints);

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

    let constraints = vec![
        Constraint::LowerBound {
            variable,
            bound: string,
        },
        Constraint::UpperBound {
            variable,
            bound: number,
        },
    ];

    let mut solver = InferenceSolver::new(&env, Unification::new(), constraints);

    let mut graph = Graph::new(&mut solver.unification);
    let bump = Bump::new();
    solver.upsert_variables(&mut graph);
    solver.solve_anti_symmetry(&mut graph, &mut FastHashMap::default(), &bump);

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

    let constraints = vec![Constraint::Equals {
        variable,
        r#type: string,
    }];

    let mut solver = InferenceSolver::new(&env, Unification::new(), constraints);

    let mut graph = Graph::new(&mut solver.unification);
    let bump = Bump::new();
    solver.upsert_variables(&mut graph);
    solver.solve_anti_symmetry(&mut graph, &mut FastHashMap::default(), &bump);

    let mut variables = FastHashMap::default();
    solver.apply_constraints(&graph, &bump, &mut variables, &mut Vec::new());

    assert_eq!(variables.len(), 1);
    let (_, (_, constraint)) = variables.iter().next().expect("Should have one constraint");

    assert_eq!(
        *constraint,
        VariableConstraint {
            equal: Some(string),
            lower: SmallVec::new(),
            upper: SmallVec::new()
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

    let constraints = vec![
        Constraint::Equals {
            variable: var1,
            r#type: string,
        },
        Constraint::UpperBound {
            variable: var2,
            bound: number,
        },
    ];

    let mut unification = Unification::new();
    unification.unify(var1.kind, var2.kind);

    let mut solver = InferenceSolver::new(&env, unification, constraints);

    let mut graph = Graph::new(&mut solver.unification);
    let bump = Bump::new();
    solver.upsert_variables(&mut graph);
    solver.solve_anti_symmetry(&mut graph, &mut FastHashMap::default(), &bump);

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
            upper: SmallVec::from_slice(&[number]),
        }
    );
}

#[test]
fn solve_constraints() {
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let hole = HoleId::new(0);
    let string = primitive!(env, PrimitiveType::String);
    let unknown = instantiate(&env, TypeKind::Unknown);

    let variable = Variable::synthetic(VariableKind::Hole(hole));

    // Create a valid constraint set with lower bound and upper bound
    let mut applied_constraints = FastHashMap::default();
    let constraint = VariableConstraint {
        equal: None,
        lower: SmallVec::from_slice(&[string]),
        upper: SmallVec::from_slice(&[unknown]),
    };
    applied_constraints.insert(variable.kind, (variable, constraint));

    let mut solver = InferenceSolver::new(&env, Unification::new(), vec![]);

    // Directly call solve_constraints
    let mut substitutions = FastHashMap::default();
    solver.solve_constraints(&applied_constraints, &mut substitutions);

    // Verify the substitution
    assert_eq!(substitutions.len(), 1);
    assert_eq!(substitutions[&variable.kind], string);
}

#[test]
fn solve_constraints_with_equality() {
    let heap = Heap::new();
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
    };
    applied_constraints.insert(var.kind, (var, vc));

    let mut solver = InferenceSolver::new(&env, Unification::new(), vec![]);

    let mut substitutions = FastHashMap::default();
    solver.solve_constraints(&applied_constraints, &mut substitutions);

    assert_eq!(substitutions.len(), 1);
    assert_eq!(substitutions[&var.kind], string);
}

#[test]
fn solve_constraints_with_incompatible_bounds() {
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let hole = HoleId::new(0);
    let string = primitive!(env, PrimitiveType::String);
    let number = primitive!(env, PrimitiveType::Number);

    let var = Variable::synthetic(VariableKind::Hole(hole));

    // Create incompatible bounds
    let mut applied_constraints = FastHashMap::default();
    let vc = VariableConstraint {
        equal: None,
        lower: SmallVec::from_slice(&[string]),
        upper: SmallVec::from_slice(&[number]),
    };
    applied_constraints.insert(var.kind, (var, vc));

    let mut solver = InferenceSolver::new(&env, Unification::new(), vec![]);

    // These bounds are incompatible, so a diagnostic should be created
    let mut substitutions = FastHashMap::default();
    solver.solve_constraints(&applied_constraints, &mut substitutions);

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
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let hole = HoleId::new(0);
    let string = primitive!(env, PrimitiveType::String);
    let number = primitive!(env, PrimitiveType::Number);

    let var = Variable::synthetic(VariableKind::Hole(hole));

    // Create incompatible equality and lower bound
    let mut applied_constraints = FastHashMap::default();
    let vc = VariableConstraint {
        equal: Some(string),
        lower: SmallVec::from_slice(&[number]),
        upper: SmallVec::new(),
    };
    applied_constraints.insert(var.kind, (var, vc));

    let mut solver = InferenceSolver::new(&env, Unification::new(), vec![]);

    let mut substitutions = FastHashMap::default();
    solver.solve_constraints(&applied_constraints, &mut substitutions);

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
        upper: SmallVec::from_slice(&[number]),
    };
    applied_constraints.insert(var.kind, (var, vc));

    let mut solver = InferenceSolver::new(&env, Unification::new(), vec![]);

    // This should exercise lines 916-929
    let mut substitutions = FastHashMap::default();
    solver.solve_constraints(&applied_constraints, &mut substitutions);

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
    let mut unification = Unification::new();
    let var_kind = VariableKind::Hole(hole);
    unification.upsert_variable(var_kind);

    let mut solver = InferenceSolver::new(&env, unification, vec![]);

    // Create a substitution map
    let mut substitutions = FastHashMap::default();
    substitutions.insert(var_kind, union!(env, [string, string]));
    let lookup = solver.unification.lookup();

    // Call simplify_substitutions
    solver.simplify_substitutions(lookup, &mut substitutions);

    assert_eq!(substitutions.len(), 1);
    assert_eq!(substitutions[&var_kind], string);
}

// =============== EDGE CASES ===============

#[test]
fn empty_constraint_set() {
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let hole = HoleId::new(0);
    let mut unification = Unification::new();
    unification.upsert_variable(VariableKind::Hole(hole));

    let solver = InferenceSolver::new(&env, unification, vec![]);
    let (_, diagnostics) = solver.solve();

    let diagnostics = diagnostics.into_vec();
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
    let constraints = vec![
        Constraint::Equals {
            variable,
            r#type: string,
        },
        Constraint::Equals {
            variable,
            r#type: string,
        },
    ];

    let mut solver = InferenceSolver::new(&env, Unification::new(), constraints);

    let mut graph = Graph::new(&mut solver.unification);
    let bump = Bump::new();
    solver.upsert_variables(&mut graph);
    solver.solve_anti_symmetry(&mut graph, &mut FastHashMap::default(), &bump);

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
    let constraints = vec![
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

    let mut solver = InferenceSolver::new(&env, Unification::new(), constraints);

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
fn cyclic_structural_edges_constraints() {
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let hole1 = HoleId::new(1);
    let hole2 = HoleId::new(2);
    let hole3 = HoleId::new(3);

    let variable1 = Variable::synthetic(VariableKind::Hole(hole1));
    let variable2 = Variable::synthetic(VariableKind::Hole(hole2));
    let variable3 = Variable::synthetic(VariableKind::Hole(hole3));

    // Create a cycle
    let constraints = vec![
        Constraint::StructuralEdge {
            source: variable1,
            target: variable2,
        },
        Constraint::StructuralEdge {
            source: variable2,
            target: variable3,
        },
        Constraint::StructuralEdge {
            source: variable3,
            target: variable1,
        },
    ];

    let mut solver = InferenceSolver::new(&env, Unification::new(), constraints);

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
    let constraints = vec![
        Constraint::LowerBound {
            variable,
            bound: never,
        },
        Constraint::UpperBound {
            variable,
            bound: unknown,
        },
    ];

    let mut solver = InferenceSolver::new(&env, Unification::new(), constraints);

    let mut graph = Graph::new(&mut solver.unification);
    let bump = Bump::new();
    solver.upsert_variables(&mut graph);
    solver.solve_anti_symmetry(&mut graph, &mut FastHashMap::default(), &bump);

    // Apply the constraints
    let mut variables = FastHashMap::default();
    solver.apply_constraints(&graph, &bump, &mut variables, &mut Vec::new());

    assert_eq!(variables.len(), 1);
    let (_, (_, constraint)) = variables.iter().next().expect("Should have one constraint");
    assert_eq!(constraint.lower, [never]);
    assert_eq!(constraint.upper, [unknown]);

    // These bounds should be compatible
    let mut substitutions = FastHashMap::default();
    solver.solve_constraints(&variables, &mut substitutions);
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
    let constraints = vec![Constraint::StructuralEdge {
        source: var1,
        target: var2,
    }];

    let mut solver = InferenceSolver::new(&env, Unification::new(), constraints);

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

// =============== INTEGRATION TESTS ===============

#[test]
fn simple_equality_constraint() {
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let hole = HoleId::new(0);
    let string = primitive!(env, PrimitiveType::String);

    let constraints = vec![Constraint::Equals {
        variable: Variable::synthetic(VariableKind::Hole(hole)),
        r#type: string,
    }];

    let solver = InferenceSolver::new(&env, Unification::new(), constraints);
    let (substitution, diagnostics) = solver.solve();
    assert!(diagnostics.is_empty());

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

    let constraints = vec![
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

    let solver = InferenceSolver::new(&env, Unification::new(), constraints);
    let (substitution, diagnostics) = solver.solve();
    assert!(diagnostics.is_empty());

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

    let constraints = vec![
        Constraint::Equals {
            variable: Variable::synthetic(VariableKind::Hole(hole)),
            r#type: string,
        },
        Constraint::Equals {
            variable: Variable::synthetic(VariableKind::Hole(hole)),
            r#type: number,
        },
    ];

    let solver = InferenceSolver::new(&env, Unification::new(), constraints);
    let (_, diagnostics) = solver.solve();

    let diagnostics = diagnostics.into_vec();
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

    let constraints = vec![
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

    let solver = InferenceSolver::new(&env, Unification::new(), constraints);
    let (substitution, diagnostics) = solver.solve();
    assert!(diagnostics.is_empty());

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

    let constraints = vec![
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

    let solver = InferenceSolver::new(&env, Unification::new(), constraints);
    let (substitution, diagnostics) = solver.solve();
    assert!(diagnostics.is_empty());

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

    let constraints = vec![
        Constraint::UpperBound {
            variable: variable1,
            bound: person1,
        },
        Constraint::UpperBound {
            variable: variable2,
            bound: person2,
        },
    ];

    let solver = InferenceSolver::new(&env, Unification::new(), constraints);
    let (substitution, diagnostics) = solver.solve();
    assert!(diagnostics.is_empty());

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

    let constraints = vec![Constraint::Ordering {
        lower: variable1,
        upper: variable2,
    }];

    let solver = InferenceSolver::new(&env, Unification::new(), constraints);
    let (_, diagnostics) = solver.solve();
    let diagnostics = diagnostics.into_vec();

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
    environment.collect_constraints(union, number);

    let solver = environment.into_solver();
    let (substitution, diagnostics) = solver.solve();
    assert!(diagnostics.is_empty());

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
    let (substitution, diagnostics) = solver.solve();
    assert!(diagnostics.is_empty());

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
    let (substitution, diagnostics) = solver.solve();
    assert!(diagnostics.is_empty());

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
    let (substitution, diagnostics) = solver.solve();
    assert!(diagnostics.is_empty());

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
    let (substitution, diagnostics) = solver.solve();
    assert!(diagnostics.is_empty());

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
    let (_substitution, diagnostics) = solver.solve();
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
    let (_substitution, diagnostics) = solver.solve();
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
        variable.into_type(&env).id,
        primitive!(env, PrimitiveType::String),
    );

    let solver = environment.into_solver();
    let (substitution, diagnostics) = solver.solve();
    assert!(diagnostics.is_empty());

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
    environment.collect_constraints(hole1_type, primitive!(env, PrimitiveType::Number));

    let variable = environment.add_projection(
        SpanId::SYNTHETIC,
        r#struct,
        Ident::synthetic(heap.intern_symbol("a")),
    );

    environment.collect_constraints(
        variable.into_type(&env).id,
        primitive!(env, PrimitiveType::Integer),
    );

    let solver = environment.into_solver();
    let (substitution, diagnostics) = solver.solve();
    assert!(diagnostics.is_empty());

    assert_equiv!(
        env,
        [substitution
            .infer(hole1)
            .expect("should have inferred variable")],
        [primitive!(env, PrimitiveType::Number)]
    );
}

#[test]
fn projection_unify_variables_upper() {
    // T = (a: _1)
    // Number <: _1
    // T.a (_2)
    // Integer <: _2
    // `_1 = _2 = Integer`
    let heap = Heap::new();
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let hole1 = env.counter.hole.next();
    let hole1_type = instantiate_infer(&env, hole1);

    let r#struct = r#struct!(env, [struct_field!(env, "a", hole1_type)]);

    let mut environment = InferenceEnvironment::new(&env);
    environment.collect_constraints(primitive!(env, PrimitiveType::Number), hole1_type);

    let variable = environment.add_projection(
        SpanId::SYNTHETIC,
        r#struct,
        Ident::synthetic(heap.intern_symbol("a")),
    );

    environment.collect_constraints(
        primitive!(env, PrimitiveType::Integer),
        variable.into_type(&env).id,
    );

    let solver = environment.into_solver();
    let (substitution, diagnostics) = solver.solve();
    assert!(diagnostics.is_empty());

    assert_equiv!(
        env,
        [substitution
            .infer(hole1)
            .expect("should have inferred variable")],
        [primitive!(env, PrimitiveType::Integer)]
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
    let (substitution, diagnostics) = solver.solve();
    assert!(diagnostics.is_empty());

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
    let (_substitution, diagnostics) = solver.solve();

    let diagnostics = diagnostics.into_vec();

    assert_eq!(diagnostics.len(), 1);
    assert_eq!(
        diagnostics[0].category,
        TypeCheckDiagnosticCategory::ConflictingEqualityConstraints
    );
}
