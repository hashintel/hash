use core::iter;

use hashql_core::r#type::{
    Type, TypeId,
    environment::Environment,
    kind::{self, ClosureType, TypeKind},
};

/// Recursively unwraps union types to yield their constituent concrete types.
///
/// This function flattens nested union types and unwraps type wrappers (Apply, Generic, Opaque)
/// to reveal the underlying concrete types. It handles the complex type hierarchy by maintaining
/// a stack of types to process and yielding concrete types as they are discovered.
///
/// # Type Unwrapping Process
///
/// 1. **Wrapper removal**: Apply, Generic, and Opaque types are unwrapped to their base types
/// 2. **Union flattening**: Union types are expanded into their constituent variants
/// 3. **Concrete yielding**: Primitive, Struct, Tuple, Closure, and other concrete types are
///    returned
///
/// # Parameters
///
/// - `type_id`: The type to unwrap and analyze
/// - `env`: Type environment containing type definitions
///
/// # Returns
///
/// An iterator over the concrete types found within the union structure.
/// For non-union types, yields a single concrete type.
///
/// # Invariants
///
/// The returned iterator is guaranteed to yield at least one type, as empty unions
/// are not valid in the type system after simplification.
pub(super) fn unwrap_union_type<'heap>(
    type_id: TypeId,
    env: &Environment<'heap>,
) -> impl IntoIterator<Item = Type<'heap>> {
    let mut stack = vec![type_id];
    iter::from_fn(move || {
        while let Some(current) = stack.pop() {
            let r#type = env.r#type(current);

            match r#type.kind {
                // ignore apply / generic / opaque wrappers
                TypeKind::Apply(kind::Apply {
                    base,
                    substitutions: _,
                })
                | TypeKind::Generic(kind::Generic { base, arguments: _ })
                | TypeKind::Opaque(kind::OpaqueType {
                    name: _,
                    repr: base,
                }) => stack.push(*base),
                // Unions are automatically flattened, order of unions does not matter, so are added
                // to the back
                TypeKind::Union(kind::UnionType { variants }) => stack.extend_from_slice(variants),

                TypeKind::Primitive(_)
                | TypeKind::Intrinsic(_)
                | TypeKind::Struct(_)
                | TypeKind::Tuple(_)
                | TypeKind::Intersection(_)
                | TypeKind::Closure(_)
                | TypeKind::Param(_)
                | TypeKind::Infer(_)
                | TypeKind::Never
                | TypeKind::Unknown => {
                    return Some(r#type);
                }
            }
        }

        None
    })
}

/// Extracts closure type information from a potentially wrapped type.
///
/// This function unwraps union types and type wrappers to find the underlying closure type.
/// It assumes the type system has already validated that the given type is indeed a closure,
/// making this extraction safe.
///
/// # Parameters
///
/// - `type_id`: The type that should resolve to a closure
/// - `env`: Type environment for type lookup
///
/// # Returns
///
/// The closure type information including parameters and return type.
///
/// # Panics
///
/// This function will panic if:
/// - The union type is empty (which should never happen when a union has been simplified)
/// - The unwrapped type is not a closure (indicates a type system bug)
///
/// Both panic conditions represent internal compiler errors that should be caught earlier in the
/// compilation pipeline.
pub(super) fn unwrap_closure_type<'heap>(
    type_id: TypeId,
    env: &Environment<'heap>,
) -> ClosureType<'heap> {
    let closure_type = unwrap_union_type(type_id, env)
        .into_iter()
        .next()
        .unwrap_or_else(|| {
            unreachable!("simplified unions are guaranteed to have at least one variant")
        });

    let TypeKind::Closure(closure) = closure_type.kind else {
        unreachable!("the unwrapped type must be a closure");
    };

    *closure
}
