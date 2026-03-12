use core::ops::ControlFlow;

use hashql_core::{
    debug_panic,
    symbol::ConstantSymbol,
    r#type::{
        TypeId,
        environment::Environment,
        kind::{Apply, Generic, OpaqueType, TypeKind},
    },
};

/// Recursively navigates a type structure following a sequence of struct field names.
///
/// Returns `Continue(Some(id))` when the path resolves to a concrete type,
/// `Continue(None)` when the current branch has no match (e.g. a union variant
/// without the field), or `Break(())` when union variants disagree on the resolved type.
fn traverse_struct_impl(
    env: &Environment<'_>,
    id: TypeId,
    fields: &[ConstantSymbol],
    depth: usize,
) -> ControlFlow<(), Option<TypeId>> {
    let r#type = env.r#type(id);

    // We don't need a sophisticated cycle detection algorithm here, the only reason a cycle could
    // occur here is if apply and generic substitutions are the only members in a cycle, haven't
    // been resolved and simplified away. Which should've created a type error earlier anyway.
    if depth > 32 {
        debug_panic!("maximum opaque type recursion depth exceeded");

        return ControlFlow::Continue(None);
    }

    match r#type.kind {
        &TypeKind::Generic(Generic { base, arguments: _ })
        | &TypeKind::Apply(Apply {
            base,
            substitutions: _,
        }) => traverse_struct_impl(env, base, fields, depth + 1),
        TypeKind::Union(union_type) => {
            let mut value = None;

            for &variant in union_type.variants {
                let variant_value = traverse_struct_impl(env, variant, fields, depth + 1)?;

                match (value, variant_value) {
                    (None, _) => value = variant_value,
                    (Some(existing), Some(variant)) => {
                        if existing != variant {
                            debug_panic!(
                                "union variant mismatch: existing={:?} variant={:?}",
                                existing,
                                variant
                            );

                            return ControlFlow::Break(());
                        }
                    }
                    (Some(_), None) => {}
                }
            }

            ControlFlow::Continue(value)
        }

        TypeKind::Struct(r#struct) => {
            if let [name, rest @ ..] = fields {
                let field = r#struct
                    .fields
                    .iter()
                    .find(|field| field.name.as_constant() == Some(*name));

                field.map_or(ControlFlow::Continue(None), |field| {
                    traverse_struct_impl(env, field.value, rest, depth + 1)
                })
            } else {
                // field is empty
                ControlFlow::Continue(Some(id))
            }
        }

        &TypeKind::Opaque(OpaqueType {
            name: _,
            repr: base,
        }) if !fields.is_empty() => traverse_struct_impl(env, base, fields, depth + 1),

        // We cannot traverse into intersection types, because we don't know which variant to
        // choose.
        TypeKind::Opaque(_)
        | TypeKind::Intersection(_)
        | TypeKind::Primitive(_)
        | TypeKind::Intrinsic(_)
        | TypeKind::Tuple(_)
        | TypeKind::Closure(_)
        | TypeKind::Param(_)
        | TypeKind::Infer(_)
        | TypeKind::Never
        | TypeKind::Unknown => ControlFlow::Continue(fields.is_empty().then_some(id)),
    }
}

/// Resolves a sequence of struct field names within a type, returning the final field's
/// [`TypeId`].
///
/// For unions, all variants must agree on the resolved type — returns [`None`] if they
/// disagree. When `fields` is empty, returns the type as-is (preserving opaque wrappers).
pub(crate) fn traverse_struct(
    env: &Environment<'_>,
    id: TypeId,
    fields: &[ConstantSymbol],
) -> Option<TypeId> {
    match traverse_struct_impl(env, id, fields, 0) {
        ControlFlow::Continue(value) => value,
        ControlFlow::Break(()) => {
            debug_panic!("traverse_struct_impl broke without a value");

            None
        }
    }
}
