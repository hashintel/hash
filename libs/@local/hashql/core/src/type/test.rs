use super::{Type, TypeId, TypeKind, unify::UnificationContext};
use crate::{
    arena::Arena,
    span::SpanId,
    symbol::{Ident, IdentKind, Symbol},
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
