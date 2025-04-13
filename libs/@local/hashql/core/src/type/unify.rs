use std::collections::{HashMap, HashSet};

use super::{
    Type, TypeId, TypeKind, error::TypeCheckDiagnostic, generic_argument::GenericArgumentId,
};
use crate::{arena::Arena, span::SpanId};

pub struct UnificationContext {
    pub source: SpanId,
    pub arena: Arena<Type>,

    variance_context: Variance,

    pub(super) diagnostics: Vec<TypeCheckDiagnostic>,
    visited: HashSet<(TypeId, TypeId), foldhash::fast::RandomState>,

    // The arguments currently in scope
    arguments: HashMap<GenericArgumentId, TypeId, foldhash::fast::RandomState>,
}

impl UnificationContext {
    #[must_use]
    pub fn new(source: SpanId, arena: Arena<Type>) -> Self {
        Self {
            source,
            arena,
            variance_context: Variance::default(),
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

    pub fn visit(&mut self, lhs: TypeId, rhs: TypeId) -> bool {
        !self.visited.insert((lhs, rhs))
    }

    pub fn leave(&mut self, lhs: TypeId, rhs: TypeId) {
        self.visited.remove(&(lhs, rhs));
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

    pub(crate) const fn variance_context(&self) -> Variance {
        self.variance_context
    }

    pub fn with_variance<T>(&mut self, variance: Variance, f: impl FnOnce(&mut Self) -> T) -> T {
        let old_variance = self.variance_context;

        // Apply variance composition rules
        self.variance_context = match (old_variance, variance) {
            // When going from covariant to contravariant context or vice versa, flip to
            // contravariant
            (Variance::Covariant, Variance::Contravariant)
            | (Variance::Contravariant, Variance::Covariant) => Variance::Contravariant,

            // When either context is invariant, the result is invariant
            (Variance::Invariant, _) | (_, Variance::Invariant) => Variance::Invariant,

            // Otherwise preserve the context
            _ => variance,
        };

        let result = f(self);
        self.variance_context = old_variance;
        result
    }

    // Helper methods
    pub fn in_contravariant<T>(&mut self, closure: impl FnOnce(&mut Self) -> T) -> T {
        self.with_variance(Variance::Contravariant, closure)
    }

    pub fn in_covariant<T>(&mut self, closure: impl FnOnce(&mut Self) -> T) -> T {
        self.with_variance(Variance::Covariant, closure)
    }

    pub fn in_invariant<T>(&mut self, closure: impl FnOnce(&mut Self) -> T) -> T {
        self.with_variance(Variance::Invariant, closure)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Default)]
pub enum Variance {
    #[default]
    Covariant, // Same direction
    Contravariant, // Opposite direction
    Invariant,     // Exact match
}
