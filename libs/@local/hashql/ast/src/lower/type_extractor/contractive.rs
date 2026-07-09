use hashql_core::{
    collections::{FastHashSet, fast_hash_set_with_capacity},
    intern::Interned,
    span::SpanId,
    r#type::{
        TypeId,
        environment::Environment,
        kind::{Apply, Generic, IntersectionType, TypeKind, UnionType},
    },
};

fn is_contractive_type<'heap>(
    env: &Environment<'heap>,
    root: Interned<'heap, TypeKind<'heap>>,
    r#type: TypeId,
    visited: &mut FastHashSet<Interned<'heap, TypeKind<'heap>>>,
) -> Result<(), SpanId> {
    let partial = env.types.index_partial(r#type);

    if root == partial.kind {
        return Err(partial.span);
    }

    is_contractive_kind(env, root, partial.kind, visited)
}

fn is_contractive_kind<'heap>(
    env: &Environment<'heap>,
    root: Interned<'heap, TypeKind<'heap>>,
    kind: Interned<'heap, TypeKind<'heap>>,
    visited: &mut FastHashSet<Interned<'heap, TypeKind<'heap>>>,
) -> Result<(), SpanId> {
    if !visited.insert(kind) {
        return Ok(()); // We're inside of a recursive type that isn't *us*
    }

    let result = match &*kind {
        // Contractive if any of it's variants are contractive
        TypeKind::Union(UnionType { variants })
        | TypeKind::Intersection(IntersectionType { variants }) => {
            let mut result = Ok(());

            for &variant in variants {
                match is_contractive_type(env, root, variant, visited) {
                    Ok(()) => return Ok(()), // Found at least one contractive variant
                    Err(span) => result = Err(span),
                }
            }

            // Empty unions/intersections are contractive
            result
        }
        &TypeKind::Generic(Generic { base, arguments: _ })
        | &TypeKind::Apply(Apply {
            base,
            substitutions: _,
        }) => is_contractive_type(env, root, base, visited),
        TypeKind::Opaque(_)
        | TypeKind::Primitive(_)
        | TypeKind::Intrinsic(_)
        | TypeKind::Struct(_)
        | TypeKind::Tuple(_)
        | TypeKind::Param(_)
        | TypeKind::Infer(_)
        | TypeKind::Closure(_)
        | TypeKind::Never
        | TypeKind::Unknown => Ok(()),
    };

    visited.remove(&kind);

    result
}

// Contractive guard as defined by 10.3233/FI-1998-33401 (Coinductive axiomatization of recursive
// type equality and subtyping) to ensure termination of type checking.
// A recursive type is contractive, if it is contained under at least a single constructor.
/// Checks if a recursive type satisfies the contractive constraint.
///
/// A recursive type is contractive if every occurrence of the recursive variable is protected by
/// at least one type constructor (struct, tuple, opaque type, etc.). This constraint ensures
/// termination of coinductive type checking by preventing infinite unfolding during subtyping.
///
/// # Arguments
///
/// * `env` - The type environment containing type definitions
/// * `root` - The kind of the recursive type variable being checked
/// * `kind` - The type kind to check for contractive occurrences of `root`
///
/// # Returns
///
/// * `Ok(())` if the type is contractive (safe for recursive definition)
/// * `Err(span)` if non-contractive, with the span of the problematic recursive reference
///
/// # Examples
///
/// Contractive types (allowed):
/// - `μα. Some<α> | None` - recursive reference protected by `Some` constructor
/// - `μα. { value: α }` - recursive reference protected by struct constructor
/// - `μα. (α, Int)` - recursive reference protected by tuple constructor
///
/// Non-contractive types (rejected):
/// - `μα. α` - direct self-reference without protection
/// - `μα. α | α` - all union variants are unprotected recursive references
///
/// # References
///
/// Based on the contractive constraint from Brandt & Henglein's "Coinductive axiomatization
/// of recursive type equality and subtyping" (10.3233/FI-1998-33401).
pub(crate) fn is_contractive<'heap>(
    env: &Environment<'heap>,
    root: Interned<'heap, TypeKind<'heap>>,
) -> Result<(), SpanId> {
    // if this ever becomes a bottleneck, consider using the temporary heap
    let mut visited = fast_hash_set_with_capacity(4);

    is_contractive_kind(env, root, root, &mut visited)
}
