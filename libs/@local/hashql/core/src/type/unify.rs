use super::{Type, error::TypeCheckDiagnostic};
use crate::{arena::Arena, span::SpanId};

pub struct UnificationContext {
    pub source: SpanId,
    pub arena: Arena<Type>,
    pub diagnostics: Vec<TypeCheckDiagnostic>,
}
