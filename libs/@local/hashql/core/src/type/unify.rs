use std::collections::{HashMap, HashSet};

use super::{
    Type, TypeId, TypeKind, error::TypeCheckDiagnostic, generic_argument::GenericArgumentId,
};
use crate::{arena::Arena, span::SpanId};

pub struct UnificationContext {
    pub source: SpanId,
    pub arena: Arena<Type>,

    diagnostics: Vec<TypeCheckDiagnostic>,
    visited: HashSet<TypeId, foldhash::fast::RandomState>,

    // The arguments currently in scope
    arguments: HashMap<GenericArgumentId, TypeId, foldhash::fast::RandomState>,
}

impl UnificationContext {
    #[must_use]
    pub fn new(source: SpanId, arena: Arena<Type>) -> Self {
        Self {
            source,
            arena,
            diagnostics: Vec::new(),
            visited: HashSet::default(),
            arguments: HashMap::default(),
        }
    }

    pub const fn arena_mut(&mut self) -> &mut Arena<Type> {
        &mut self.arena
    }

    pub fn take_diagnostics(&mut self) -> Vec<TypeCheckDiagnostic> {
        core::mem::take(&mut self.diagnostics)
    }

    pub fn visit(&mut self, id: TypeId) -> bool {
        !self.visited.insert(id)
    }

    pub fn leave(&mut self, id: TypeId) {
        self.visited.remove(&id);
    }

    pub(crate) fn record_diagnostic(&mut self, diagnostic: TypeCheckDiagnostic) {
        self.diagnostics.push(diagnostic);
    }

    pub(crate) fn mark_error(&mut self, id: TypeId) {
        self.arena
            .update_with(id, |r#type| r#type.kind = TypeKind::Error);
    }

    pub(crate) fn enter_generic_argument_scope(&mut self, id: GenericArgumentId, r#type: TypeId) {
        self.arguments.insert(id, r#type);
    }

    pub(crate) fn exit_generic_argument_scope(&mut self, id: GenericArgumentId) {
        self.arguments.remove(&id);
    }

    pub(crate) fn generic_argument(&self, id: GenericArgumentId) -> Option<TypeId> {
        self.arguments.get(&id).copied()
    }
}
