use super::{Type, TypeId, TypeKind, unify::UnificationContext};
use crate::{arena::Arena, span::SpanId};

pub(crate) fn setup() -> UnificationContext {
    UnificationContext {
        source: SpanId::SYNTHETIC,
        arena: Arena::new(),
        diagnostics: Vec::new(),
    }
}

pub(crate) fn instantiate(context: &mut UnificationContext, kind: TypeKind) -> TypeId {
    context.arena.push_with(|id| Type {
        id,
        span: SpanId::SYNTHETIC,
        kind,
    })
}
