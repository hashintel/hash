use hashql_core::{
    debug_panic,
    symbol::sym,
    r#type::{
        TypeId,
        environment::Environment,
        kind::{OpaqueType, TypeKind},
    },
};

use crate::body::local::LocalDecl;

fn peel<'heap>(
    env: &Environment<'heap>,
    id: TypeId,
    depth: usize,
) -> Option<&'heap OpaqueType<'heap>> {
    let r#type = env.r#type(id);

    // We don't need a sophisticated cycle detection algorithm here, the only reason a cycle could
    // occur here is if apply and generic substitutions are the only members in a cycle, haven't
    // been resolved and simplified away. Which should've created a type error earlier anyway.
    if depth > 32 {
        debug_panic!("maximum opaque type recursion depth exceeded");

        return None;
    }

    match r#type.kind {
        TypeKind::Opaque(opaque_type) => Some(opaque_type),
        TypeKind::Apply(apply) => peel(env, apply.base, depth + 1),
        TypeKind::Generic(generic) => peel(env, generic.base, depth + 1),
        TypeKind::Primitive(_)
        | TypeKind::Intrinsic(_)
        | TypeKind::Struct(_)
        | TypeKind::Tuple(_)
        | TypeKind::Union(_)
        | TypeKind::Intersection(_)
        | TypeKind::Closure(_)
        | TypeKind::Never
        | TypeKind::Unknown
        | TypeKind::Param(_)
        | TypeKind::Infer(_) => None,
    }
}

/// The vertex type of a [`GraphReadFilter`] body's vertex argument.
///
/// [`GraphReadFilter`]: crate::body::Source::GraphReadFilter
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum VertexType {
    Entity,
}

impl VertexType {
    /// Classifies a local declaration as a vertex type based on its opaque type name.
    ///
    /// Returns `None` if the declaration's type is not an opaque type or not a recognized vertex
    /// type.
    pub fn from_local(env: &Environment<'_>, decl: &LocalDecl<'_>) -> Option<Self> {
        let opaque = peel(env, decl.r#type, 0)?;

        match opaque.name.as_constant()? {
            sym::path::Entity::CONST => Some(Self::Entity),
            _ => None,
        }
    }
}
