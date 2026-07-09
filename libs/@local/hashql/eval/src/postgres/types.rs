use core::ops::ControlFlow;

use hashql_core::{
    debug_panic,
    symbol::Symbol,
    r#type::{
        TypeId,
        environment::Environment,
        kind::{Apply, Generic, OpaqueType, PrimitiveType, TypeKind},
    },
};
use hashql_mir::body::{Body, operand::Operand};

/// Recursively navigates a type structure following a sequence of struct field names.
///
/// Returns `Continue(Some(id))` when the path resolves to a concrete type,
/// `Continue(None)` when the current branch has no match (e.g. a union variant
/// without the field), or `Break(())` when union variants disagree on the resolved type.
fn traverse_struct_impl(
    env: &Environment<'_>,
    vertex: TypeId,
    fields: &[Symbol<'_>],
    depth: usize,
) -> ControlFlow<(), Option<TypeId>> {
    let r#type = env.r#type(vertex);

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
                let field = r#struct.fields.iter().find(|field| field.name == *name);

                field.map_or(ControlFlow::Continue(None), |field| {
                    traverse_struct_impl(env, field.value, rest, depth + 1)
                })
            } else {
                // field is empty
                ControlFlow::Continue(Some(vertex))
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
        | TypeKind::Unknown => ControlFlow::Continue(fields.is_empty().then_some(vertex)),
    }
}

/// Resolves a sequence of struct field names within a type, returning the final field's
/// [`TypeId`].
///
/// For unions, all variants must agree on the resolved type — returns [`None`] if they
/// disagree. When `fields` is empty, returns the type as-is (preserving opaque wrappers).
pub(crate) fn traverse_struct(
    env: &Environment<'_>,
    vertex: TypeId,
    fields: &[Symbol<'_>],
) -> Option<TypeId> {
    match traverse_struct_impl(env, vertex, fields, 0) {
        ControlFlow::Continue(value) => value,
        ControlFlow::Break(()) => {
            debug_panic!("traverse_struct_impl broke without a value");

            None
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub(crate) enum IntegerType {
    Boolean,
    Integer,
}

pub(crate) fn integer_type<'heap>(
    env: &Environment<'heap>,
    body: &Body<'heap>,
    operand: &Operand<'heap>,
) -> Option<IntegerType> {
    match operand {
        Operand::Place(place) => {
            let r#type = place.type_id(&body.local_decls);
            match env.r#type(r#type).kind.primitive()? {
                PrimitiveType::Boolean => Some(IntegerType::Boolean),
                PrimitiveType::Integer => Some(IntegerType::Integer),
                PrimitiveType::Number | PrimitiveType::String | PrimitiveType::Null => None,
            }
        }
        Operand::Constant(hashql_mir::body::constant::Constant::Int(value)) => {
            if value.is_bool() {
                Some(IntegerType::Boolean)
            } else {
                Some(IntegerType::Integer)
            }
        }
        Operand::Constant(hashql_mir::body::constant::Constant::Primitive(
            hashql_core::value::Primitive::Boolean(_),
        )) => Some(IntegerType::Boolean),
        Operand::Constant(hashql_mir::body::constant::Constant::Primitive(
            hashql_core::value::Primitive::Integer(_),
        )) => Some(IntegerType::Integer),
        Operand::Constant(
            hashql_mir::body::constant::Constant::Primitive(
                hashql_core::value::Primitive::Float(_)
                | hashql_core::value::Primitive::String(_)
                | hashql_core::value::Primitive::Null,
            )
            | hashql_mir::body::constant::Constant::FnPtr(_)
            | hashql_mir::body::constant::Constant::Unit,
        ) => None,
    }
}
