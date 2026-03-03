use alloc::rc::Rc;
use core::ops::Deref;

use smallvec::SmallVec;

use super::{
    AnalysisEnvironment, Environment, Variance, analysis::AnalysisEnvironmentSkeleton,
    context::provision::ProvisionedGuard,
};
use crate::{
    intern::Provisioned,
    pretty::{Formatter, RenderOptions},
    r#type::{
        PartialType, Type, TypeId,
        error::TypeCheckDiagnosticIssues,
        inference::{Substitution, VariableKind, VariableLookup},
        lattice::Lattice as _,
        pretty::{TypeFormatter, TypeFormatterOptions},
        recursion::RecursionBoundary,
    },
};

#[derive(Debug)]
#[expect(
    dead_code,
    reason = "used during benchmarking to delay signficiant drop"
)]
pub struct SimplifyEnvironmentSkeleton<'heap> {
    boundary: RecursionBoundary<'heap>,
    analysis: AnalysisEnvironmentSkeleton<'heap>,
}

#[derive(Debug)]
pub struct SimplifyEnvironment<'env, 'heap> {
    pub environment: &'env Environment<'heap>,
    boundary: RecursionBoundary<'heap>,

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

    #[must_use]
    pub fn into_skeleton(self) -> SimplifyEnvironmentSkeleton<'heap> {
        SimplifyEnvironmentSkeleton {
            boundary: self.boundary,
            analysis: self.analysis.into_skeleton(),
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

    #[inline]
    pub fn take_diagnostics(&mut self) -> Option<TypeCheckDiagnosticIssues> {
        self.analysis.take_diagnostics()
    }

    #[inline]
    pub fn clear_diagnostics(&mut self) {
        self.analysis.clear_diagnostics();
    }

    #[inline]
    pub(crate) fn resolve_substitution(&self, r#type: Type<'heap>) -> Option<TypeId> {
        self.analysis.resolve_substitution(r#type)
    }

    #[inline]
    pub(crate) fn resolve_type(&self, r#type: Type<'heap>) -> Option<Type<'heap>> {
        self.analysis.resolve_type(r#type)
    }

    #[inline]
    pub(crate) fn is_alias(&mut self, id: TypeId, kind: VariableKind) -> bool {
        self.analysis.is_alias(id, kind)
    }

    #[inline]
    pub fn is_equivalent(&mut self, lhs: TypeId, rhs: TypeId) -> bool {
        self.analysis.is_equivalent(lhs, rhs)
    }

    #[inline]
    pub fn is_subtype_of(
        &mut self,
        variance: Variance,
        subtype: TypeId,
        supertype: TypeId,
    ) -> bool {
        self.analysis.is_subtype_of(variance, subtype, supertype)
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
    pub fn is_recursive(&mut self, id: TypeId) -> bool {
        self.analysis.is_recursive(id)
    }

    #[inline]
    pub fn distribute_union(&mut self, id: TypeId) -> SmallVec<TypeId, 16> {
        self.analysis.distribute_union(id)
    }

    #[inline]
    pub fn distribute_intersection(&mut self, id: TypeId) -> SmallVec<TypeId, 16> {
        self.analysis.distribute_intersection(id)
    }

    /// Simplifies the given type ID.
    ///
    /// # Panics
    ///
    /// In debug builds, this function will panic if a type should have been provisioned but wasn't.
    pub fn simplify(&mut self, id: TypeId) -> TypeId {
        let r#type = self.environment.r#type(id);

        if self.boundary.enter(r#type, r#type).is_break() {
            // See if the type has been substituted
            if let Some(substitution) = self.analysis.provisioned.get_substitution(id) {
                return substitution;
            }

            if cfg!(debug_assertions) {
                let formatter = Formatter::new(self.heap);
                let mut formatter = TypeFormatter::new(
                    &formatter,
                    self.environment,
                    TypeFormatterOptions::default(),
                );

                panic!(
                    "type id {id} should have been provisioned, but wasn't.\n{}",
                    formatter.render_type(r#type, RenderOptions::default())
                );
            }

            // in debug builds this panics if the type should have been provisioned but wasn't, as
            // we can recover from this error (we simply return the original - unsimplified - type
            // id) we do not need to panic here in release builds.
            return id;
        }

        let result = r#type.simplify(self);

        self.boundary.exit(r#type, r#type);
        result
    }

    #[expect(
        clippy::needless_pass_by_ref_mut,
        reason = "prove ownership of environment, so that we can borrow safely"
    )]
    pub fn provision(&mut self, id: TypeId) -> (ProvisionedGuard<TypeId>, Provisioned<TypeId>) {
        let provisioned = self.environment.types.provision();
        let guard = Rc::clone(&self.analysis.provisioned).enter(id, provisioned);

        (guard, provisioned)
    }

    #[must_use]
    pub fn intern_provisioned(
        &self,
        id: Provisioned<TypeId>,
        r#type: PartialType<'heap>,
    ) -> TypeId {
        self.environment.types.intern_provisioned(id, r#type).id
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
