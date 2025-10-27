use core::iter;

use hashql_core::r#type::{
    Type, TypeId,
    environment::Environment,
    kind::{self, ClosureType, TypeKind},
};

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

pub(super) fn unwrap_closure_type<'heap>(
    type_id: TypeId,
    env: &Environment<'heap>,
) -> ClosureType<'heap> {
    let closure_type = unwrap_union_type(type_id, env)
        .into_iter()
        .next()
        .unwrap_or_else(|| unreachable!("There must be a least one item present"));

    let TypeKind::Closure(closure) = closure_type.kind else {
        unreachable!("type must be a closure");
    };

    *closure
}
