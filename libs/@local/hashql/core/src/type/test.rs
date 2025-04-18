use super::{
    Type, TypeId, TypeKind,
    environment::{Environment, TypeAnalysisEnvironment},
};
use crate::{
    heap::Heap,
    span::SpanId,
    symbol::{Ident, IdentKind, Symbol},
};

pub(crate) macro setup_analysis($name:ident) {
    let heap = Heap::new();
    let environment = Environment::new(SpanId::SYNTHETIC, &heap);

    let mut $name = TypeAnalysisEnvironment::new(&environment);
    $name.with_diagnostics();
}

pub(crate) fn instantiate<'heap>(env: &Environment<'heap>, kind: TypeKind<'heap>) -> TypeId {
    let kind = env.intern_kind(kind);

    env.alloc(|id| Type {
        id,
        span: SpanId::SYNTHETIC,
        kind,
    })
}

pub(crate) fn ident(value: &str) -> Ident {
    Ident {
        span: SpanId::SYNTHETIC,
        value: Symbol::new(value),
        kind: IdentKind::Lexical,
    }
}

#[test]
fn unify_never_types() {
    setup_analysis!(env);

    let never1 = instantiate(&env, TypeKind::Never);
    let never2 = instantiate(&env, TypeKind::Never);

    env.is_subtype_of(never1, never2);

    assert!(matches!(env.types[never1].copied().kind, TypeKind::Never));
    assert!(matches!(env.types[never2].copied().kind, TypeKind::Never));
}

#[test]
fn never_with_other_type() {
    setup_analysis!(env);

    let never = instantiate(&env, TypeKind::Never);
    let other = instantiate(&env, TypeKind::Unknown);

    env.is_subtype_of(never, other);

    assert!(
        !env.take_diagnostics().is_empty(),
        "There should be an error during unification"
    );

    assert!(matches!(env.types[never].copied().kind, TypeKind::Never));
    assert!(matches!(env.types[other].copied().kind, TypeKind::Unknown));
}

#[test]
fn unify_unknown_types() {
    setup_analysis!(env);

    let unknown1 = instantiate(&env, TypeKind::Unknown);
    let unknown2 = instantiate(&env, TypeKind::Unknown);

    env.is_subtype_of(unknown1, unknown2);

    assert!(matches!(
        env.types[unknown1].copied().kind,
        TypeKind::Unknown
    ));
    assert!(matches!(
        env.types[unknown2].copied().kind,
        TypeKind::Unknown
    ));
}

#[test]
fn unknown_with_other_type() {
    setup_analysis!(env);

    let unknown = instantiate(&env, TypeKind::Unknown);
    let never = instantiate(&env, TypeKind::Never);

    env.is_subtype_of(unknown, never);

    assert!(env.take_diagnostics().is_empty());

    assert!(matches!(
        env.types[unknown].copied().kind,
        TypeKind::Unknown
    ));
}

#[test]
fn direct_circular_reference() {
    setup_analysis!(env);

    todo!()
}

#[test]
fn indirect_circular_reference() {
    setup_analysis!(env);

    // Create a cycle: A → B → C → A
    todo!()
}

#[test]
fn alternating_direction_cycle() {
    setup_analysis!(env);

    // Create types that will form a cycle but with alternating directions
    todo!()
}

#[test]
fn recursive_type_equivalence() {
    setup_analysis!(env);

    // Create two recursive types (e.g., linked list nodes)
    todo!()
}
