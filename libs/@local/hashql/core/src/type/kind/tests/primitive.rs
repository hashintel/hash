#![expect(clippy::min_ident_chars)]
use rstest::rstest;

use crate::{
    heap::Heap,
    symbol::Ident,
    r#type::{
        environment::{
            AnalysisEnvironment, Environment, InferenceEnvironment, LatticeEnvironment,
            SimplifyEnvironment,
        },
        error::TypeCheckDiagnosticCategory,
        kind::{
            PrimitiveType, TypeKind,
            test::{assert_kind, primitive},
        },
        lattice::{Lattice as _, Projection, Subscript, test::assert_lattice_laws},
        tests::instantiate,
    },
};

#[rstest]
#[case(PrimitiveType::Number)]
#[case(PrimitiveType::Integer)]
#[case(PrimitiveType::String)]
#[case(PrimitiveType::Boolean)]
#[case(PrimitiveType::Null)]
fn join_identical_primitives(#[case] primitive: PrimitiveType) {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    primitive!(env, a, primitive);
    primitive!(env, b, primitive);

    let mut lattice_env = LatticeEnvironment::new(&env);

    let output = a.join(b, &mut lattice_env);
    assert_eq!(output.len(), 1);

    let id = output[0];
    let r#type = env.r#type(id);

    assert_eq!(*r#type.kind, TypeKind::Primitive(primitive));
}

#[rstest]
#[case(PrimitiveType::Number)]
#[case(PrimitiveType::Integer)]
#[case(PrimitiveType::String)]
#[case(PrimitiveType::Boolean)]
#[case(PrimitiveType::Null)]
fn meet_identical_primitives(#[case] primitive: PrimitiveType) {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    primitive!(env, a, primitive);
    primitive!(env, b, primitive);

    let mut lattice_env = LatticeEnvironment::new(&env);

    let output = a.meet(b, &mut lattice_env);
    assert_eq!(output.len(), 1);

    let id = output[0];
    let r#type = env.r#type(id);

    assert_eq!(*r#type.kind, TypeKind::Primitive(primitive));
}

#[test]
fn join_integer_number_subtyping() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    primitive!(env, number, PrimitiveType::Number);
    primitive!(env, integer, PrimitiveType::Integer);

    let mut lattice_env = LatticeEnvironment::new(&env);

    // Number ⊔ Integer = Number
    assert_kind!(
        lattice_env,
        number.join(integer, &mut lattice_env),
        [TypeKind::Primitive(PrimitiveType::Number)]
    );

    // Integer ⊔ Number = Number
    assert_kind!(
        lattice_env,
        integer.join(number, &mut lattice_env),
        [TypeKind::Primitive(PrimitiveType::Number)]
    );
}

#[test]
fn meet_integer_number_subtyping() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    primitive!(env, number, PrimitiveType::Number);
    primitive!(env, integer, PrimitiveType::Integer);

    let mut lattice_env = LatticeEnvironment::new(&env);

    // Number ⊓ Integer = Integer
    assert_kind!(
        lattice_env,
        number.meet(integer, &mut lattice_env),
        [TypeKind::Primitive(PrimitiveType::Integer)]
    );

    // Integer ⊓ Number = Integer
    assert_kind!(
        lattice_env,
        integer.meet(number, &mut lattice_env),
        [TypeKind::Primitive(PrimitiveType::Integer)]
    );
}

#[test]
fn join_unrelated_primitives() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    primitive!(env, string, PrimitiveType::String);
    primitive!(env, boolean, PrimitiveType::Boolean);
    primitive!(env, null, PrimitiveType::Null);

    let mut lattice_env = LatticeEnvironment::new(&env);

    // String ⊔ Boolean = String | Boolean
    assert_kind!(
        lattice_env,
        string.join(boolean, &mut lattice_env),
        [
            TypeKind::Primitive(PrimitiveType::String),
            TypeKind::Primitive(PrimitiveType::Boolean)
        ]
    );

    // Boolean ⊔ Null = Boolean | Null
    assert_kind!(
        lattice_env,
        boolean.join(null, &mut lattice_env),
        [
            TypeKind::Primitive(PrimitiveType::Boolean),
            TypeKind::Primitive(PrimitiveType::Null)
        ]
    );

    // String ⊔ Null = String | Null
    assert_kind!(
        lattice_env,
        string.join(null, &mut lattice_env),
        [
            TypeKind::Primitive(PrimitiveType::String),
            TypeKind::Primitive(PrimitiveType::Null)
        ]
    );
}

#[test]
fn meet_unrelated_primitives() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    primitive!(env, string, PrimitiveType::String);
    primitive!(env, boolean, PrimitiveType::Boolean);
    primitive!(env, null, PrimitiveType::Null);

    let mut lattice_env = LatticeEnvironment::new(&env);

    // String ⊓ Boolean = String & Boolean
    assert_kind!(
        lattice_env,
        string.meet(boolean, &mut lattice_env),
        [
            TypeKind::Primitive(PrimitiveType::String),
            TypeKind::Primitive(PrimitiveType::Boolean)
        ]
    );

    // Boolean ⊓ Null = Boolean & Null
    assert_kind!(
        lattice_env,
        boolean.meet(null, &mut lattice_env),
        [
            TypeKind::Primitive(PrimitiveType::Boolean),
            TypeKind::Primitive(PrimitiveType::Null)
        ]
    );

    // String ⊓ Null = String & Null
    assert_kind!(
        lattice_env,
        string.meet(null, &mut lattice_env),
        [
            TypeKind::Primitive(PrimitiveType::String),
            TypeKind::Primitive(PrimitiveType::Null)
        ]
    );
}

#[test]
fn bottom() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    primitive!(env, number, PrimitiveType::Number);
    primitive!(env, string, PrimitiveType::String);
    primitive!(env, boolean, PrimitiveType::Boolean);
    primitive!(env, null, PrimitiveType::Null);
    primitive!(env, integer, PrimitiveType::Integer);

    let mut analysis_env = AnalysisEnvironment::new(&env);

    // No primitive types are uninhabited
    assert!(!number.is_bottom(&mut analysis_env));
    assert!(!string.is_bottom(&mut analysis_env));
    assert!(!boolean.is_bottom(&mut analysis_env));
    assert!(!null.is_bottom(&mut analysis_env));
    assert!(!integer.is_bottom(&mut analysis_env));
}

#[test]
fn top() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    primitive!(env, number, PrimitiveType::Number);
    primitive!(env, string, PrimitiveType::String);
    primitive!(env, boolean, PrimitiveType::Boolean);
    primitive!(env, null, PrimitiveType::Null);
    primitive!(env, integer, PrimitiveType::Integer);

    let mut analysis_env = AnalysisEnvironment::new(&env);

    // No primitive types are uninhabited
    assert!(!number.is_top(&mut analysis_env));
    assert!(!string.is_top(&mut analysis_env));
    assert!(!boolean.is_top(&mut analysis_env));
    assert!(!null.is_top(&mut analysis_env));
    assert!(!integer.is_top(&mut analysis_env));
}

#[test]
fn equivalent() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    primitive!(env, number, PrimitiveType::Number);
    primitive!(env, number2, PrimitiveType::Number); // Second Number type
    primitive!(env, string, PrimitiveType::String);
    primitive!(env, boolean, PrimitiveType::Boolean);
    primitive!(env, null, PrimitiveType::Null);
    primitive!(env, integer, PrimitiveType::Integer);

    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Same primitive types should be equivalent
    assert!(number.is_equivalent(number2, &mut analysis_env));

    // Different primitive types should not be equivalent
    assert!(!number.is_equivalent(string, &mut analysis_env));
    assert!(!number.is_equivalent(boolean, &mut analysis_env));
    assert!(!number.is_equivalent(null, &mut analysis_env));
    assert!(!number.is_equivalent(integer, &mut analysis_env));
    assert!(!string.is_equivalent(boolean, &mut analysis_env));
}

#[test]
fn subtype_relationship() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    primitive!(env, number, PrimitiveType::Number);
    primitive!(env, integer, PrimitiveType::Integer);
    primitive!(env, string, PrimitiveType::String);
    primitive!(env, boolean, PrimitiveType::Boolean);
    primitive!(env, null, PrimitiveType::Null);

    let mut analysis_env = AnalysisEnvironment::new(&env);

    // Every type is a subtype of itself (reflexivity)
    assert!(number.is_subtype_of(number, &mut analysis_env));
    assert!(integer.is_subtype_of(integer, &mut analysis_env));
    assert!(string.is_subtype_of(string, &mut analysis_env));
    assert!(boolean.is_subtype_of(boolean, &mut analysis_env));
    assert!(null.is_subtype_of(null, &mut analysis_env));

    // Integer is a subtype of Number (Integer <: Number)
    assert!(integer.is_subtype_of(number, &mut analysis_env));

    // Number is not a subtype of Integer (!(Number <: Integer))
    assert!(!number.is_subtype_of(integer, &mut analysis_env));

    // No other subtyping relationships between primitive types
    assert!(!number.is_subtype_of(string, &mut analysis_env));
    assert!(!number.is_subtype_of(boolean, &mut analysis_env));
    assert!(!number.is_subtype_of(null, &mut analysis_env));

    assert!(!string.is_subtype_of(number, &mut analysis_env));
    assert!(!string.is_subtype_of(boolean, &mut analysis_env));
    assert!(!string.is_subtype_of(null, &mut analysis_env));

    assert!(!boolean.is_subtype_of(number, &mut analysis_env));
    assert!(!boolean.is_subtype_of(string, &mut analysis_env));
    assert!(!boolean.is_subtype_of(null, &mut analysis_env));

    assert!(!null.is_subtype_of(number, &mut analysis_env));
    assert!(!null.is_subtype_of(string, &mut analysis_env));
    assert!(!null.is_subtype_of(boolean, &mut analysis_env));
}

#[rstest]
#[case(PrimitiveType::Number)]
#[case(PrimitiveType::Integer)]
#[case(PrimitiveType::String)]
#[case(PrimitiveType::Boolean)]
#[case(PrimitiveType::Null)]
fn simplify(#[case] primitive: PrimitiveType) {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    primitive!(env, a, primitive);

    let mut simplify_env = SimplifyEnvironment::new(&env);

    // Primitive types should simplify to themselves
    let result = a.simplify(&mut simplify_env);
    let result_type = env.r#type(result);

    assert_eq!(*result_type.kind, TypeKind::Primitive(primitive));
}

#[test]
fn lattice_laws() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    primitive!(env, number, PrimitiveType::Number);
    primitive!(env, string, PrimitiveType::String);
    primitive!(env, boolean, PrimitiveType::Boolean);

    assert_lattice_laws(&env, number.id, string.id, boolean.id);
}

#[test]
fn is_concrete() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let mut analysis_env = AnalysisEnvironment::new(&env);

    // All primitive types should be concrete
    primitive!(env, number, PrimitiveType::Number);
    primitive!(env, string, PrimitiveType::String);
    primitive!(env, boolean, PrimitiveType::Boolean);
    primitive!(env, null, PrimitiveType::Null);

    assert!(number.is_concrete(&mut analysis_env));
    assert!(string.is_concrete(&mut analysis_env));
    assert!(boolean.is_concrete(&mut analysis_env));
    assert!(null.is_concrete(&mut analysis_env));
}

#[test]
fn projection() {
    let heap = Heap::new();
    let env = Environment::new(&heap);

    let mut lattice = LatticeEnvironment::new(&env);

    let result = lattice.projection(
        primitive!(env, PrimitiveType::String),
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
        primitive!(env, PrimitiveType::String),
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
