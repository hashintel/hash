use super::{Type, TypeId, TypeKind, error::TypeCheckDiagnostic};
use crate::{arena::Arena, span::SpanId};

pub struct UnificationContext {
    pub source: SpanId,
    pub arena: Arena<Type>,
    pub diagnostics: Vec<TypeCheckDiagnostic>,
}

impl UnificationContext {
    pub(crate) fn mark_error(&mut self, id: TypeId) {
        self.arena
            .update_with(id, |r#type| r#type.kind = TypeKind::Error);
    }
}
