use core::ops::Index;

use ecow::EcoString;
use pretty::RcDoc;

use super::{
    Type, TypeId,
    environment::{StructuralEquivalenceEnvironment, UnificationEnvironment},
    generic_argument::GenericArguments,
    pretty_print::PrettyPrint,
    recursion::RecursionDepthBoundary,
};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct OpaqueType {
    // Absolute and unique name of the type
    pub name: EcoString,
    pub r#type: TypeId,

    pub arguments: GenericArguments,
}

impl OpaqueType {
    pub(crate) fn structurally_equivalent(
        &self,
        other: &Self,
        env: &mut StructuralEquivalenceEnvironment,
    ) -> bool {
        // We do not check if the inner type is equivalent because opaque types are nominal
        self.name == other.name
            && self
                .arguments
                .structurally_equivalent(&other.arguments, env)
    }
}

impl PrettyPrint for OpaqueType {
    fn pretty<'a>(
        &'a self,
        arena: &'a impl Index<TypeId, Output = Type>,
        limit: RecursionDepthBoundary,
    ) -> pretty::RcDoc<'a, anstyle::Style> {
        RcDoc::text(self.name.as_str())
            .append(self.arguments.pretty(arena, limit))
            .append(RcDoc::text("["))
            .append(limit.pretty(&arena[self.r#type], arena).nest(1).group())
            .append(RcDoc::text("]"))
            .group()
    }
}

/// Unifies opaque types
///
/// Opaque types implement nominal typing, meaning:
/// - Types must have the same name to be compatible
/// - Underlying types must be compatible according to variance rules
/// - For generics, each type parameter follows its own variance rules
pub(crate) fn unify_opaque(
    env: &mut UnificationEnvironment,
    lhs: &Type<OpaqueType>,
    rhs: &Type<OpaqueType>,
) {
    // Opaque types require the same name - this is core to nominal typing
    // Names must match exactly, regardless of variance context
    if lhs.kind.name != rhs.kind.name {
        let diagnostic = super::error::opaque_type_name_mismatch(
            env.source,
            lhs,
            rhs,
            &lhs.kind.name,
            &rhs.kind.name,
        );

        env.record_diagnostic(diagnostic);

        return;
    }

    // Enter generic argument scope for both opaque types
    lhs.kind.arguments.enter_scope(env);
    rhs.kind.arguments.enter_scope(env);

    // Unify the underlying types with the current variance context
    // Typically opaque types are invariant over their wrapped type
    // but we're respecting the enclosing context here for flexibility
    env.unify_type(lhs.kind.r#type, rhs.kind.r#type);

    // Exit generic argument scope
    rhs.kind.arguments.exit_scope(env);
    lhs.kind.arguments.exit_scope(env);

    // In a strictly variance-aware system, we do NOT modify the opaque types
    // Each opaque type maintains its own identity and wrapped type
}

#[cfg(test)]
mod tests {

    use super::OpaqueType;
    use crate::{
        span::SpanId,
        r#type::{
            Type, TypeId, TypeKind,
            environment::UnificationEnvironment,
            generic_argument::GenericArguments,
            opaque::unify_opaque,
            primitive::PrimitiveType,
            test::{instantiate, setup_unify},
        },
    };

    // Helper to create an opaque type for testing
    fn create_opaque_type(
        env: &mut UnificationEnvironment,
        name: &str,
        underlying_type: TypeId,
    ) -> Type<OpaqueType> {
        let id = env.arena.push_with(|id| Type {
            id,
            span: SpanId::SYNTHETIC,
            kind: TypeKind::Opaque(OpaqueType {
                name: name.into(),
                r#type: underlying_type,
                arguments: GenericArguments::default(),
            }),
        });

        env.arena[id]
            .clone()
            .map(|kind| kind.into_opaque().expect("should be opaque type"))
    }

    #[test]
    fn unify_same_name_opaque_types() {
        setup_unify!(env);

        // Create two opaque types with the same name
        let int1 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Integer));
        let int2 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Integer));

        let user_id1 = create_opaque_type(&mut env, "UserId", int1);
        let user_id2 = create_opaque_type(&mut env, "UserId", int2);

        // Should unify successfully
        unify_opaque(&mut env, &user_id1, &user_id2);

        // No errors should be reported
        let diagnostics = env.take_diagnostics();
        assert!(
            diagnostics.is_empty(),
            "Expected no diagnostics, got: {diagnostics:?}"
        );
    }

    #[test]
    fn unify_different_name_opaque_types() {
        setup_unify!(env);

        // Create two opaque types with different names but same underlying type
        let int = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Integer));

        let user_id = create_opaque_type(&mut env, "UserId", int);
        let post_id = create_opaque_type(&mut env, "PostId", int);

        // Should report an error - different names shouldn't unify
        unify_opaque(&mut env, &user_id, &post_id);

        // Check error diagnostics
        let diagnostics = env.take_diagnostics();
        assert_eq!(
            diagnostics.len(),
            1,
            "Expected one diagnostic, got: {}",
            diagnostics.len()
        );
    }

    #[test]
    fn unify_opaque_with_incompatible_underlying_types() {
        setup_unify!(env);

        // Create two opaque types with same name but incompatible underlying types
        let int = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Integer));
        let string = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String));

        let user_id1 = create_opaque_type(&mut env, "UserId", int);
        let user_id2 = create_opaque_type(&mut env, "UserId", string);

        // Should try to unify the underlying types, which will report errors
        unify_opaque(&mut env, &user_id1, &user_id2);

        // Check for errors from the underlying type mismatch
        let diagnostics = env.take_diagnostics();
        assert!(!diagnostics.is_empty(), "Expected at least one diagnostic");
    }

    #[test]
    fn unify_nested_opaque_types() {
        setup_unify!(env);

        // Create opaque types that wrap other opaque types
        let int = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Integer));

        // Create inner opaque types
        let inner1 = create_opaque_type(&mut env, "Base", int);
        let inner2 = create_opaque_type(&mut env, "Base", int);

        // Create outer opaque types wrapping the inner ones
        let outer1 = create_opaque_type(&mut env, "Wrapper", inner1.id);
        let outer2 = create_opaque_type(&mut env, "Wrapper", inner2.id);

        // Should unify successfully
        unify_opaque(&mut env, &outer1, &outer2);

        // No errors should be reported
        let diagnostics = env.take_diagnostics();
        assert!(
            diagnostics.is_empty(),
            "Expected no diagnostics, got: {diagnostics:?}"
        );
    }
}
