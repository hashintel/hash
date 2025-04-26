use super::{Constraint, InferenceSolver, VariableConstraint};
use crate::{
    heap::Heap,
    span::SpanId,
    r#type::{
        Type,
        collection::FastHashMap,
        environment::{AnalysisEnvironment, Environment},
        error::TypeCheckDiagnosticCategory,
        inference::{Variable, VariableKind, solver::Unification},
        kind::{
            PrimitiveType, StructType, TypeKind,
            infer::HoleId,
            r#struct::StructField,
            test::{assert_equiv, primitive, r#struct, struct_field},
        },
        pretty_print::PrettyPrint as _,
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

    solver.upsert_variables();
    solver.solve_anti_symmetry();

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

    solver.upsert_variables();
    solver.solve_anti_symmetry();

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

    let applied_constraints = solver.apply_constraints();

    assert_eq!(applied_constraints.len(), 1);
    let (_, (_, constraint)) = applied_constraints
        .iter()
        .next()
        .expect("Should have one constraint");

    // Check that the constraint has the correct bounds
    assert_eq!(constraint.lower, Some(string));
    assert_eq!(constraint.upper, Some(number));
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

    let applied_constraints = solver.apply_constraints();

    assert_eq!(applied_constraints.len(), 1);
    let (_, (_, constraint)) = applied_constraints
        .iter()
        .next()
        .expect("Should have one constraint");

    assert_eq!(
        *constraint,
        VariableConstraint {
            equal: Some(string),
            lower: None,
            upper: None
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

    let variable1 = Variable::synthetic(VariableKind::Hole(hole1));
    let variable2 = Variable::synthetic(VariableKind::Hole(hole2));

    let constraints = vec![
        Constraint::Equals {
            variable: variable1,
            r#type: string,
        },
        Constraint::UpperBound {
            variable: variable2,
            bound: number,
        },
    ];

    let mut unification = Unification::new();
    unification.unify(variable1.kind, variable2.kind);

    let mut solver = InferenceSolver::new(&env, unification, constraints);

    let applied_constraints = solver.apply_constraints();

    // Only one entry since the variables are unified
    assert_eq!(applied_constraints.len(), 1);
    let (_, (_, constraint)) = applied_constraints
        .iter()
        .next()
        .expect("Expected a constraint");

    // Both constraints should be applied to the root variable
    assert_eq!(
        *constraint,
        VariableConstraint {
            equal: Some(string),
            lower: None,
            upper: Some(number),
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
        lower: Some(string),
        upper: Some(unknown),
    };
    applied_constraints.insert(variable.kind, (variable, constraint));

    let mut solver = InferenceSolver::new(&env, Unification::new(), vec![]);

    // Directly call solve_constraints
    let substitutions = solver.solve_constraints(applied_constraints);

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
        lower: None,
        upper: None,
    };
    applied_constraints.insert(var.kind, (var, vc));

    let mut solver = InferenceSolver::new(&env, Unification::new(), vec![]);

    let substitutions = solver.solve_constraints(applied_constraints);

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
        lower: Some(string),
        upper: Some(number),
    };
    applied_constraints.insert(var.kind, (var, vc));

    let mut solver = InferenceSolver::new(&env, Unification::new(), vec![]);

    // These bounds are incompatible, so a diagnostic should be created
    solver.solve_constraints(applied_constraints);

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
        lower: Some(number),
        upper: None,
    };
    applied_constraints.insert(var.kind, (var, vc));

    let mut solver = InferenceSolver::new(&env, Unification::new(), vec![]);

    solver.solve_constraints(applied_constraints);

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
        lower: None,
        upper: Some(number),
    };
    applied_constraints.insert(var.kind, (var, vc));

    let mut solver = InferenceSolver::new(&env, Unification::new(), vec![]);

    // This should exercise lines 916-929
    solver.solve_constraints(applied_constraints);

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
    substitutions.insert(var_kind, string);
    let lookup = solver.unification.lookup();

    // Call simplify_substitutions
    let simplified = solver.simplify_substitutions(lookup, substitutions);

    // The simplification might not actually change anything in this simple case,
    // but we can verify it contains the right data
    assert_eq!(simplified.len(), 1);
    assert_eq!(simplified[&var_kind], string);
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

    // Apply the constraints
    let applied = solver.apply_constraints();

    // Despite having duplicate constraints, there should be one entry with one equality
    assert_eq!(applied.len(), 1);
    let (_, (_, constraint)) = applied.iter().next().expect("Should have one constraint");
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
    solver.upsert_variables();
    solver.solve_anti_symmetry();

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
    solver.upsert_variables();
    solver.solve_anti_symmetry();

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

    // Apply the constraints
    let applied = solver.apply_constraints();

    assert_eq!(applied.len(), 1);
    let (_, (_, constraint)) = applied.iter().next().expect("Should have one constraint");
    assert_eq!(constraint.lower, Some(never));
    assert_eq!(constraint.upper, Some(unknown));

    // These bounds should be compatible
    let substitutions = solver.solve_constraints(applied);
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

    let variable1 = Variable::synthetic(VariableKind::Hole(hole1));
    let variable2 = Variable::synthetic(VariableKind::Hole(hole2));

    // Create a structural edge constraint
    let constraints = vec![Constraint::StructuralEdge {
        source: variable1,
        target: variable2,
    }];

    let mut solver = InferenceSolver::new(&env, Unification::new(), constraints);

    // This should exercise lines 410-418
    let collected = solver.collect_constraints();

    // Both variables should be in the map even though they don't have direct bounds
    assert!(collected.contains_key(&variable1.kind));
    assert!(collected.contains_key(&variable2.kind));

    // They should have default constraint values (all None/empty)
    let (_, var1_constraints) = &collected[&variable1.kind];
    assert!(var1_constraints.equal.is_none());
    assert!(var1_constraints.lower.is_empty());
    assert!(var1_constraints.upper.is_empty());

    let (_, var2_constraints) = &collected[&variable2.kind];
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
        [],
        [struct_field!(env, "name", instantiate_infer(&env, hole2))]
    );

    let person2 = r#struct!(
        env,
        [],
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

    let expected = env.alloc(|id| Type {
        id,
        span: SpanId::SYNTHETIC,
        kind: env.intern_kind(TypeKind::Struct(StructType {
            fields: env
                .intern_struct_fields(&mut [StructField {
                    name: env.heap.intern_symbol("name"),
                    value: id,
                }])
                .expect("should be uniq"),
            arguments: env.intern_generic_arguments(&mut []),
        })),
    });

    let actual = substitution
        .infer(hole1)
        .expect("should have unified hole 1");

    assert_equiv!(env, [actual], [expected], substitution);
}
