use core::ops::Deref;

use smallvec::SmallVec;

use super::{AnalysisEnvironment, Diagnostics, Environment};
use crate::r#type::{
    Type, TypeId,
    inference::{Substitution, VariableKind, VariableLookup},
    lattice::Lattice as _,
    recursion::RecursionBoundary,
};

pub struct SimplifyEnvironment<'env, 'heap> {
    pub environment: &'env Environment<'heap>,
    boundary: RecursionBoundary,

    analysis: AnalysisEnvironment<'env, 'heap>,
}

impl<'env, 'heap> SimplifyEnvironment<'env, 'heap> {
    pub fn new(environment: &'env Environment<'heap>) -> Self {
        Self {
            environment,
            boundary: RecursionBoundary::new(),
            analysis: AnalysisEnvironment::new(environment),
        }
    }

    #[inline]
    pub(crate) fn set_variables(&mut self, variables: VariableLookup) {
        self.analysis.set_variables(variables);
    }

    #[inline]
    pub(crate) fn set_substitution(&mut self, substitution: Substitution) {
        self.analysis.set_substitution(substitution);
    }

    #[inline]
    pub(crate) fn clear_substitution(&mut self) {
        self.analysis.clear_substitution();
    }

    #[inline]
    pub(crate) const fn substitution_mut(&mut self) -> Option<&mut Substitution> {
        self.analysis.substitution_mut()
    }

    #[inline]
    pub(crate) fn contains_substitution(&self, kind: VariableKind) -> bool {
        self.analysis.contains_substitution(kind)
    }

    pub(crate) fn take_diagnostics(&mut self) -> Option<Diagnostics> {
        self.analysis.take_diagnostics()
    }

    #[inline]
    pub(crate) fn resolve_type(&self, r#type: Type<'heap>) -> Option<Type<'heap>> {
        self.analysis.resolve_type(r#type)
    }

    #[inline]
    pub fn is_equivalent(&mut self, lhs: TypeId, rhs: TypeId) -> bool {
        self.analysis.is_equivalent(lhs, rhs)
    }

    #[inline]
    pub fn is_subtype_of(&mut self, subtype: TypeId, supertype: TypeId) -> bool {
        self.analysis.is_subtype_of(subtype, supertype)
    }

    // Two types are disjoint if neither is a subtype of the other
    // This means they share no common values and their intersection is empty
    #[inline]
    pub fn is_disjoint(&mut self, lhs: TypeId, rhs: TypeId) -> bool {
        self.analysis.is_disjoint(lhs, rhs)
    }

    #[inline]
    pub fn is_bottom(&mut self, id: TypeId) -> bool {
        self.analysis.is_bottom(id)
    }

    #[inline]
    pub fn is_top(&mut self, id: TypeId) -> bool {
        self.analysis.is_top(id)
    }

    #[inline]
    pub fn is_concrete(&mut self, id: TypeId) -> bool {
        self.analysis.is_concrete(id)
    }

    #[inline]
    pub fn distribute_union(&mut self, id: TypeId) -> SmallVec<TypeId, 16> {
        self.analysis.distribute_union(id)
    }

    #[inline]
    pub fn distribute_intersection(&mut self, id: TypeId) -> SmallVec<TypeId, 16> {
        self.analysis.distribute_intersection(id)
    }

    pub fn simplify(&mut self, id: TypeId) -> TypeId {
        if !self.boundary.enter(id, id) {
            // We have discovered a recursive type, as such we stop simplification
            return id;
        }

        let r#type = self.environment.types[id].copied();
        let result = r#type.simplify(self);

        self.boundary.exit(id, id);
        result
    }
}

// We usually try to avoid `Deref` and `DerefMut`, but it makes sense in this case.
// As the unification environment is just a wrapper around the environment with an additional guard.
impl<'heap> Deref for SimplifyEnvironment<'_, 'heap> {
    type Target = Environment<'heap>;

    fn deref(&self) -> &Self::Target {
        self.environment
    }
}
