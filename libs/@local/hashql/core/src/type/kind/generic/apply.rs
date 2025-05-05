use core::ops::Deref;

use pretty::RcDoc;

use super::GenericArgumentId;
use crate::{
    intern::Interned,
    r#type::{
        Type, TypeId,
        environment::{AnalysisEnvironment, Environment, LatticeEnvironment},
        lattice::Lattice,
        pretty_print::{ORANGE, PrettyPrint, RED},
        recursion::RecursionDepthBoundary,
    },
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct GenericSubstitution {
    pub argument: GenericArgumentId,
    pub value: TypeId,
}

impl PrettyPrint for GenericSubstitution {
    fn pretty<'env>(
        &self,
        env: &'env Environment,
        limit: RecursionDepthBoundary,
    ) -> RcDoc<'env, anstyle::Style> {
        let name = format!("?{}", self.argument);

        RcDoc::text(name)
            .annotate(ORANGE)
            .append(RcDoc::line())
            .append("=")
            .append(RcDoc::line())
            .append(limit.pretty(env, self.value))
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct GenericSubstitutions<'heap>(Option<Interned<'heap, [GenericSubstitution]>>);

impl<'heap> GenericSubstitutions<'heap> {
    #[must_use]
    pub const fn empty() -> Self {
        Self(None)
    }

    /// Create a new `GenericSubstitutions` from a slice of `GenericSubstitution`s.
    ///
    /// The caller must ensure that the slice is sorted by argument ID and contains no duplicates.
    ///
    /// You should probably use `Environment::intern_generic_substitutions` instead.
    #[must_use]
    pub const fn from_slice_unchecked(slice: Interned<'heap, [GenericSubstitution]>) -> Self {
        Self(Some(slice))
    }

    #[must_use]
    pub const fn as_slice(&self) -> &[GenericSubstitution] {
        match self.0 {
            Some(Interned(slice, _)) => slice,
            None => &[] as &[GenericSubstitution],
        }
    }

    #[must_use]
    pub const fn len(&self) -> usize {
        self.as_slice().len()
    }

    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.as_slice().is_empty()
    }

    #[must_use]
    pub fn merge(&self, other: &Self, env: &Environment<'heap>) -> Self {
        // We can merge without de-duplication, because every argument has a unique ID.
        // What we need to do tho, is to re-sort them, so that the invariants are maintained.
        let mut vec = Vec::with_capacity(self.len() + other.len());

        vec.extend_from_slice(self.as_slice());
        vec.extend_from_slice(other.as_slice());

        env.intern_generic_substitutions(&mut vec)
    }
}

impl AsRef<[GenericSubstitution]> for GenericSubstitutions<'_> {
    fn as_ref(&self) -> &[GenericSubstitution] {
        self.as_slice()
    }
}

impl Deref for GenericSubstitutions<'_> {
    type Target = [GenericSubstitution];

    fn deref(&self) -> &Self::Target {
        self.as_slice()
    }
}

impl PrettyPrint for GenericSubstitutions<'_> {
    fn pretty<'env>(
        &self,
        env: &'env Environment,
        limit: RecursionDepthBoundary,
    ) -> RcDoc<'env, anstyle::Style> {
        match self.as_slice() {
            [] => RcDoc::nil(),
            slice => RcDoc::text("<")
                .append(
                    RcDoc::intersperse(
                        slice
                            .iter()
                            .map(|substitution| substitution.pretty(env, limit)),
                        RcDoc::text(",").append(RcDoc::line()),
                    )
                    .nest(1)
                    .group(),
                )
                .append(RcDoc::text(">")),
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Apply<'heap> {
    pub base: TypeId,
    pub substitutions: GenericSubstitutions<'heap>,
}

impl<'heap> Lattice<'heap> for Apply<'heap> {
    fn join(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> smallvec::SmallVec<TypeId, 4> {
        todo!()
    }

    fn meet(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> smallvec::SmallVec<TypeId, 4> {
        todo!()
    }

    fn is_bottom(self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        todo!()
    }

    fn is_top(self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        todo!()
    }

    fn is_concrete(self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        todo!()
    }

    fn is_recursive(self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        todo!()
    }

    fn distribute_union(
        self: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> smallvec::SmallVec<TypeId, 16> {
        todo!()
    }

    fn distribute_intersection(
        self: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> smallvec::SmallVec<TypeId, 16> {
        todo!()
    }

    fn is_subtype_of(
        self: Type<'heap, Self>,
        supertype: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        todo!()
    }

    fn simplify(
        self: Type<'heap, Self>,
        env: &mut crate::r#type::environment::SimplifyEnvironment<'_, 'heap>,
    ) -> TypeId {
        todo!()
    }
}

impl PrettyPrint for Apply<'_> {
    fn pretty<'env>(
        &self,
        env: &'env Environment,
        limit: RecursionDepthBoundary,
    ) -> RcDoc<'env, anstyle::Style> {
        limit.pretty(env, self.base).append(
            RcDoc::line()
                .append(RcDoc::text("where").annotate(RED))
                .append(self.substitutions.pretty(env, limit))
                .group()
                .nest(1),
        )
    }
}
