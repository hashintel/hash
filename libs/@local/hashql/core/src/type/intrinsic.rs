use pretty::RcDoc;

use super::{
    Type, TypeId,
    error::type_mismatch,
    pretty_print::{PrettyPrint, RecursionLimit},
    unify::UnificationContext,
    unify_type,
};
use crate::arena::Arena;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct ListType {
    element: TypeId,
}

impl PrettyPrint for ListType {
    fn pretty<'a>(
        &'a self,
        arena: &'a Arena<Type>,
        limit: RecursionLimit,
    ) -> pretty::RcDoc<'a, anstyle::Style> {
        RcDoc::text("List")
            .append(RcDoc::text("<"))
            .append(limit.pretty(&arena[self.element], arena))
            .append(RcDoc::text(">"))
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct DictType {
    key: TypeId,
    value: TypeId,
}

impl PrettyPrint for DictType {
    fn pretty<'a>(
        &'a self,
        arena: &'a Arena<Type>,
        limit: RecursionLimit,
    ) -> pretty::RcDoc<'a, anstyle::Style> {
        RcDoc::text("Dict")
            .append(RcDoc::text("<"))
            .append(
                RcDoc::intersperse(
                    [self.key, self.value]
                        .into_iter()
                        .map(|id| limit.pretty(&arena[id], arena)),
                    RcDoc::text(",").append(RcDoc::line()),
                )
                .nest(1)
                .group(),
            )
            .append(RcDoc::text(">"))
    }
}

// Intrinsics are "magical" types in the HashQL language that have no "substance", in the sense that
// there's no way to define them in terms of HashQL itself.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum IntrinsicType {
    List(ListType),
    Dict(DictType),
}

impl PrettyPrint for IntrinsicType {
    fn pretty<'a>(
        &'a self,
        arena: &'a Arena<Type>,
        recursion: RecursionLimit,
    ) -> RcDoc<'a, anstyle::Style> {
        match self {
            Self::List(list) => list.pretty(arena, recursion),
            Self::Dict(dict) => dict.pretty(arena, recursion),
        }
    }
}

pub(crate) fn unify_intrinsic(
    context: &mut UnificationContext,
    lhs: Type<IntrinsicType>,
    rhs: Type<IntrinsicType>,
) {
    if lhs.kind == rhs.kind {
        return;
    }

    match (lhs.kind, rhs.kind) {
        (
            IntrinsicType::List(ListType {
                element: element_lhs,
            }),
            IntrinsicType::List(ListType {
                element: element_rhs,
            }),
        ) => {
            unify_type(context, element_lhs, element_rhs);
        }
        (
            IntrinsicType::Dict(DictType {
                key: key_lhs,
                value: value_lhs,
            }),
            IntrinsicType::Dict(DictType {
                key: key_rhs,
                value: value_rhs,
            }),
        ) => {
            unify_type(context, key_lhs, key_rhs);
            unify_type(context, value_lhs, value_rhs);
        }
        _ => {
            let help = match (&lhs.kind, &rhs.kind) {
                (IntrinsicType::List(_), IntrinsicType::Dict(..)) => Some(
                    "Cannot convert a List to a Dict. Consider using a List of key-value pairs \
                     instead",
                ),
                (IntrinsicType::Dict(..), IntrinsicType::List(_)) => Some(
                    "Cannot convert a Dict to a List. Consider using Dict.values() or Dict.keys() \
                     to get a List",
                ),
                _ => None,
            };

            context.diagnostics.push(type_mismatch(
                context.source,
                &context.arena,
                &lhs,
                &rhs,
                help,
            ));
        }
    }
}
