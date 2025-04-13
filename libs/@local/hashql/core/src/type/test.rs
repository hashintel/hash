use super::{Type, TypeId, TypeKind, unify::UnificationContext};
use crate::{
    arena::Arena,
    span::SpanId,
    symbol::{Ident, IdentKind, Symbol},
    r#type::{primitive::PrimitiveType, unify_type},
};

pub(crate) fn setup() -> UnificationContext {
    UnificationContext::new(SpanId::SYNTHETIC, Arena::new())
}

pub(crate) fn instantiate(context: &mut UnificationContext, kind: TypeKind) -> TypeId {
    context.arena.push_with(|id| Type {
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
    let mut context = setup();

    let never1 = instantiate(&mut context, TypeKind::Never);
    let never2 = instantiate(&mut context, TypeKind::Never);

    unify_type(&mut context, never1, never2);

    assert!(matches!(context.arena[never1].kind, TypeKind::Never));
    assert!(matches!(context.arena[never2].kind, TypeKind::Never));
}

#[test]
fn never_with_other_type() {
    let mut context = setup();

    let never = instantiate(&mut context, TypeKind::Never);
    let other = instantiate(&mut context, TypeKind::Unknown);

    unify_type(&mut context, never, other);

    // Never stays the same, but the other type becomes Error since it should have been Never
    assert!(matches!(context.arena[never].kind, TypeKind::Never));
    assert!(matches!(context.arena[other].kind, TypeKind::Error));
}

#[test]
fn unify_unknown_types() {
    let mut context = setup();

    let unknown1 = instantiate(&mut context, TypeKind::Unknown);
    let unknown2 = instantiate(&mut context, TypeKind::Unknown);

    unify_type(&mut context, unknown1, unknown2);

    assert!(matches!(context.arena[unknown1].kind, TypeKind::Unknown));
    assert!(matches!(context.arena[unknown2].kind, TypeKind::Unknown));
}

#[test]
fn unknown_with_other_type() {
    let mut context = setup();

    let unknown = instantiate(&mut context, TypeKind::Unknown);
    let never = instantiate(&mut context, TypeKind::Never);

    unify_type(&mut context, unknown, never);

    // Unknown becomes Error when unified with Never, since it's expected to be Never
    assert!(matches!(context.arena[unknown].kind, TypeKind::Error));
}

#[test]
fn unify_infer_types() {
    let mut context = setup();

    let infer1 = instantiate(&mut context, TypeKind::Infer);
    let infer2 = instantiate(&mut context, TypeKind::Infer);

    unify_type(&mut context, infer1, infer2);

    // One should link to the other
    if let TypeKind::Link(target) = context.arena[infer1].kind {
        assert_eq!(target, infer2);
    } else {
        panic!("Expected infer1 to link to infer2");
    }
}

#[test]
fn infer_with_concrete_type() {
    let mut context = setup();

    let infer = instantiate(&mut context, TypeKind::Infer);
    let never = instantiate(&mut context, TypeKind::Never);

    unify_type(&mut context, infer, never);

    // Infer should become the concrete type
    assert!(matches!(context.arena[infer].kind, TypeKind::Never));
}

#[test]
fn error_propagates() {
    let mut context = setup();

    let error = instantiate(&mut context, TypeKind::Error);
    let other = instantiate(&mut context, TypeKind::Never);

    unify_type(&mut context, error, other);

    // Error should propagate to both types
    assert!(matches!(context.arena[error].kind, TypeKind::Error));
    assert!(matches!(context.arena[other].kind, TypeKind::Error));
}

#[test]
fn link_resolves_to_target() {
    let mut context = setup();

    // Create a chain: link1 -> link2 -> never
    let never = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number));
    let link2 = instantiate(&mut context, TypeKind::Link(never));
    let link1 = instantiate(&mut context, TypeKind::Link(link2));

    let other = instantiate(&mut context, TypeKind::Unknown);

    unify_type(&mut context, link1, other);

    // Should follow links and resolve to Never
    assert!(matches!(
        context.arena[other].kind,
        TypeKind::Primitive(PrimitiveType::Number)
    ));
}

#[test]
fn complex_link_chain_resolution() {
    let mut context = setup();

    // Create a complex chain with multiple links
    let concrete = instantiate(&mut context, TypeKind::Unknown);
    let link1 = instantiate(&mut context, TypeKind::Link(concrete));
    let link2 = instantiate(&mut context, TypeKind::Link(link1));
    let link3 = instantiate(&mut context, TypeKind::Link(link2));

    // Create another chain
    let other_concrete = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number));
    let other_link = instantiate(&mut context, TypeKind::Link(other_concrete));

    // Unify the heads of both chains
    unify_type(&mut context, link3, other_link);

    // The full chain should resolve to Never
    assert!(matches!(
        context.arena[concrete].kind,
        TypeKind::Primitive(PrimitiveType::Number)
    ));

    // Links should still point in the same direction
    if let TypeKind::Link(target) = context.arena[link3].kind {
        assert_eq!(target, link2);
    } else {
        panic!("Expected link3 to still be a Link");
    }
}

#[test]
fn unknown_and_infer_interaction() {
    let mut context = setup();

    // Test interaction between Unknown and Infer
    let unknown = instantiate(&mut context, TypeKind::Unknown);
    let infer = instantiate(&mut context, TypeKind::Infer);

    unify_type(&mut context, unknown, infer);

    // Infer should become Unknown (top type)
    assert!(matches!(context.arena[infer].kind, TypeKind::Unknown));
}

#[test]
fn never_and_infer_interaction() {
    let mut context = setup();

    // Test interaction between Never and Infer
    let never = instantiate(&mut context, TypeKind::Never);
    let infer = instantiate(&mut context, TypeKind::Infer);

    unify_type(&mut context, never, infer);

    // Infer should become Never (bottom type)
    assert!(matches!(context.arena[infer].kind, TypeKind::Never));
}

#[test]
fn error_with_link_chain() {
    let mut context = setup();

    // Create a chain with an Error in the middle
    let concrete = instantiate(&mut context, TypeKind::Unknown);
    let error = instantiate(&mut context, TypeKind::Error);
    let link1 = instantiate(&mut context, TypeKind::Link(error));
    let link2 = instantiate(&mut context, TypeKind::Link(link1));

    // Unify the head of the chain with a concrete type
    unify_type(&mut context, link2, concrete);

    // Error should propagate through the chain
    assert!(matches!(context.arena[concrete].kind, TypeKind::Error));
}

#[test]
fn mixed_special_types_unification() {
    let mut context = setup();

    // Create a complex scenario with multiple special types
    let never = instantiate(&mut context, TypeKind::Never);
    let infer1 = instantiate(&mut context, TypeKind::Infer);
    let infer2 = instantiate(&mut context, TypeKind::Infer);
    let unknown = instantiate(&mut context, TypeKind::Unknown);

    // First unify infer1 and infer2 to create a link
    unify_type(&mut context, infer1, infer2);

    // Then unify the link with Never
    unify_type(&mut context, infer2, never);

    // Finally unify with Unknown (Unknown becomes Error as it needs to be Never)
    unify_type(&mut context, infer1, unknown);

    // Check the final state
    assert!(
        matches!(context.arena[infer1].kind, TypeKind::Never)
            || matches!(context.arena[infer1].kind, TypeKind::Link(_))
    );
    assert!(matches!(context.arena[infer2].kind, TypeKind::Never));
    assert!(matches!(context.arena[never].kind, TypeKind::Never));
    assert!(matches!(context.arena[unknown].kind, TypeKind::Error));
}

#[test]
fn error_propagation_through_mixed_types() {
    let mut context = setup();

    // Start with different special types
    let error = instantiate(&mut context, TypeKind::Error);
    let never = instantiate(&mut context, TypeKind::Never);
    let unknown = instantiate(&mut context, TypeKind::Unknown);
    let infer = instantiate(&mut context, TypeKind::Infer);

    // Create sequence: error -> never -> unknown -> infer
    // Each step will mark the types as Error due to propagation
    unify_type(&mut context, error, never);
    unify_type(&mut context, never, unknown);
    unify_type(&mut context, unknown, infer);

    // Error should propagate to all types
    assert!(matches!(context.arena[error].kind, TypeKind::Error));
    assert!(matches!(context.arena[never].kind, TypeKind::Error));
    assert!(matches!(context.arena[unknown].kind, TypeKind::Error));
    assert!(matches!(context.arena[infer].kind, TypeKind::Error));
}

#[test]
fn link_to_self_detection() {
    let mut context = setup();

    // Create a type that would link to itself
    let id = instantiate(&mut context, TypeKind::Infer);

    // Create a Link that would point to itself
    context.arena.update(
        id,
        Type {
            id,
            span: SpanId::SYNTHETIC,
            kind: TypeKind::Link(id),
        },
    );

    // Create a concrete type to unify with
    let concrete = instantiate(&mut context, TypeKind::Unknown);

    // This should detect the circular link
    unify_type(&mut context, id, concrete);

    // The system should handle this gracefully (not crash)
    // Either by propagating an error or breaking the cycle
    // But at minimum it shouldn't panic or overflow stack
}

#[test]
fn direct_circular_reference() {
    let mut context = setup();

    // Create two types that refer to each other
    let id1 = instantiate(&mut context, TypeKind::Infer);
    let id2 = instantiate(&mut context, TypeKind::Infer);

    // Make them refer to each other
    context.arena.update(
        id1,
        Type {
            id: id1,
            span: SpanId::SYNTHETIC,
            kind: TypeKind::Link(id2),
        },
    );

    context.arena.update(
        id2,
        Type {
            id: id2,
            span: SpanId::SYNTHETIC,
            kind: TypeKind::Link(id1),
        },
    );

    // Try to unify with a concrete type
    let concrete = instantiate(&mut context, TypeKind::Unknown);
    unify_type(&mut context, id1, concrete);

    // Check if this was detected as circular
    assert!(
        !context.take_diagnostics().is_empty(),
        "Circular reference not detected"
    );
}

#[test]
fn indirect_circular_reference() {
    let mut context = setup();

    // Create a cycle: A → B → C → A
    let id_a = instantiate(&mut context, TypeKind::Infer);
    let id_b = instantiate(&mut context, TypeKind::Infer);
    let id_c = instantiate(&mut context, TypeKind::Infer);

    context.arena.update(
        id_a,
        Type {
            id: id_a,
            span: SpanId::SYNTHETIC,
            kind: TypeKind::Link(id_b),
        },
    );

    context.arena.update(
        id_b,
        Type {
            id: id_b,
            span: SpanId::SYNTHETIC,
            kind: TypeKind::Link(id_c),
        },
    );

    context.arena.update(
        id_c,
        Type {
            id: id_c,
            span: SpanId::SYNTHETIC,
            kind: TypeKind::Link(id_a),
        },
    );

    // Try to unify with a concrete type
    let concrete = instantiate(&mut context, TypeKind::Unknown);
    unify_type(&mut context, id_a, concrete);

    // Check if this more complex cycle was detected
    assert!(
        !context.take_diagnostics().is_empty(),
        "Indirect circular reference not detected"
    );
}

#[test]
fn alternating_direction_cycle() {
    let mut context = setup();

    // Create types that will form a cycle but with alternating directions
    let id_a = instantiate(&mut context, TypeKind::Infer);
    let id_b = instantiate(&mut context, TypeKind::Infer);
    let id_c = instantiate(&mut context, TypeKind::Infer);

    // Create initial links
    context.arena.update(
        id_a,
        Type {
            id: id_a,
            span: SpanId::SYNTHETIC,
            kind: TypeKind::Link(id_b),
        },
    );

    // Unify B with C
    unify_type(&mut context, id_b, id_c);

    // Now make C link back to A, completing the cycle
    context.arena.update(
        id_c,
        Type {
            id: id_c,
            span: SpanId::SYNTHETIC,
            kind: TypeKind::Link(id_a),
        },
    );

    // Try to resolve the whole chain
    let concrete = instantiate(&mut context, TypeKind::Unknown);
    unify_type(&mut context, id_a, concrete);

    // Check if this directionally varied cycle was detected
    // This is the test most likely to expose if the approach is too conservative
    assert!(
        !context.take_diagnostics().is_empty(),
        "Alternating direction cycle not detected"
    );
}
