use core::assert_matches::assert_matches;

use super::{
    Type, TypeId, TypeKind,
    environment::{Environment, UnificationEnvironment},
};
use crate::{
    heap::Heap,
    span::SpanId,
    symbol::{Ident, IdentKind, Symbol},
    r#type::{intersection_type, kind::primitive::PrimitiveType},
};

pub(crate) macro setup_unify($name:ident) {
    let heap = Heap::new();
    let environment = Environment::new(SpanId::SYNTHETIC, &heap);

    let mut $name = UnificationEnvironment::new(&environment);
}

pub(crate) fn instantiate(env: &mut Environment, kind: TypeKind) -> TypeId {
    let kind = env.intern(kind);

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
    setup_unify!(env);

    let never1 = instantiate(&mut env, TypeKind::Never);
    let never2 = instantiate(&mut env, TypeKind::Never);

    env.unify_type(never1, never2);

    assert!(matches!(env.types[never1].copied().kind, TypeKind::Never));
    assert!(matches!(env.types[never2].copied().kind, TypeKind::Never));
}

#[test]
fn never_with_other_type() {
    setup_unify!(env);

    let never = instantiate(&mut env, TypeKind::Never);
    let other = instantiate(&mut env, TypeKind::Unknown);

    env.unify_type(never, other);

    assert!(
        !env.diagnostics.take().is_empty(),
        "There should be an error during unification"
    );

    assert!(matches!(env.types[never].copied().kind, TypeKind::Never));
    assert!(matches!(env.types[other].copied().kind, TypeKind::Unknown));
}

#[test]
fn unify_unknown_types() {
    setup_unify!(env);

    let unknown1 = instantiate(&mut env, TypeKind::Unknown);
    let unknown2 = instantiate(&mut env, TypeKind::Unknown);

    env.unify_type(unknown1, unknown2);

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
    setup_unify!(env);

    let unknown = instantiate(&mut env, TypeKind::Unknown);
    let never = instantiate(&mut env, TypeKind::Never);

    env.unify_type(unknown, never);

    assert!(env.diagnostics.take().is_empty());

    assert!(matches!(
        env.types[unknown].copied().kind,
        TypeKind::Unknown
    ));
}

#[test]
fn direct_circular_reference() {
    setup_unify!(env);

    todo!()
}

#[test]
fn indirect_circular_reference() {
    setup_unify!(env);

    // Create a cycle: A → B → C → A
    todo!()
}

#[test]
fn alternating_direction_cycle() {
    setup_unify!(env);

    // Create types that will form a cycle but with alternating directions
    todo!()
}

#[test]
fn recursive_type_equivalence() {
    setup_unify!(env);

    // Create two recursive types (e.g., linked list nodes)
    todo!()
}
