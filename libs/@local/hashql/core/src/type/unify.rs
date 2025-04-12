use super::{Type, TypeKind, error::TypeCheckDiagnostic};
use crate::{arena::Arena, span::SpanId};

pub struct UnificationContext {
    pub source: SpanId,
    pub arena: Arena<Type>,
    pub diagnostics: Vec<TypeCheckDiagnostic>,
}

impl UnificationContext {
    pub(crate) fn mark_error<K>(&mut self, r#type: Type<K>) {
        self.arena
            .update(r#type.id, r#type.map(|_| TypeKind::Error));
    }
}
