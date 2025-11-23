use core::ops::Deref;

use super::{GenericArgumentId, Param};
use crate::{
    collections::SmallVec,
    intern::Interned,
    span::SpanId,
    symbol::Ident,
    r#type::{
        PartialType, Type, TypeId,
        environment::{
            AnalysisEnvironment, Environment, InferenceEnvironment, LatticeEnvironment,
            SimplifyEnvironment, Variance,
            instantiate::{InstantiateEnvironment, SubstitutionState},
        },
        inference::Inference,
        kind::TypeKind,
        lattice::{Lattice, Projection, Subscript},
    },
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct GenericSubstitution {
    pub argument: GenericArgumentId,
    pub value: TypeId,
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
        let mut vec = SmallVec::with_capacity(self.len() + other.len());

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

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Apply<'heap> {
    pub base: TypeId,
    pub substitutions: GenericSubstitutions<'heap>,
}

impl<'heap> Apply<'heap> {
    fn wrap(
        span: SpanId,
        bases: smallvec::SmallVec<TypeId, 4>,
        substitutions: GenericSubstitutions<'heap>,
        env: &Environment<'heap>,
    ) -> smallvec::SmallVec<TypeId, 4> {
        bases
            .into_iter()
            .map(|base| {
                env.intern_type(PartialType {
                    span,
                    kind: env.intern_kind(TypeKind::Apply(Self {
                        base,
                        substitutions,
                    })),
                })
            })
            .collect()
    }

    pub fn join_base(
        self,
        other: Self,
        env: &mut LatticeEnvironment<'_, 'heap>,
        span: SpanId,
    ) -> smallvec::SmallVec<TypeId, 4> {
        // As we require to wrap the result in our own type, we call the function directly
        let self_base = env.r#type(self.base);
        let other_base = env.r#type(other.base);

        let bases = self_base.join(other_base, env);

        let substitutions = self.substitutions.merge(&other.substitutions, env);

        Self::wrap(span, bases, substitutions, env)
    }

    pub fn meet_base(
        self,
        other: Self,
        env: &mut LatticeEnvironment<'_, 'heap>,
        span: SpanId,
    ) -> smallvec::SmallVec<TypeId, 4> {
        // As we require to wrap the result in our own type, we call the function directly
        let self_base = env.r#type(self.base);
        let other_base = env.r#type(other.base);

        let bases = self_base.meet(other_base, env);

        let substitutions = self.substitutions.merge(&other.substitutions, env);

        Self::wrap(span, bases, substitutions, env)
    }
}

impl<'heap> Lattice<'heap> for Apply<'heap> {
    fn join(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> smallvec::SmallVec<TypeId, 4> {
        self.kind.join_base(*other.kind, env, self.span)
    }

    fn meet(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> smallvec::SmallVec<TypeId, 4> {
        self.kind.meet_base(*other.kind, env, self.span)
    }

    fn projection(
        self: Type<'heap, Self>,
        field: Ident<'heap>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> Projection {
        env.projection(self.kind.base, field)
    }

    fn subscript(
        self: Type<'heap, Self>,
        index: TypeId,
        env: &mut LatticeEnvironment<'_, 'heap>,
        infer: &mut InferenceEnvironment<'_, 'heap>,
    ) -> Subscript {
        env.subscript(self.kind.base, index, infer)
    }

    fn is_bottom(self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        env.is_bottom(self.kind.base)
    }

    fn is_top(self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        env.is_top(self.kind.base)
    }

    fn is_concrete(self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        env.is_concrete(self.kind.base)
    }

    fn is_recursive(self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        env.is_recursive(self.kind.base)
    }

    fn distribute_union(
        self: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> smallvec::SmallVec<TypeId, 16> {
        let base = env.distribute_union(self.kind.base);

        // Due to distribution rules, we know if there's a single element, it's the same as the
        // original type.
        if base.len() == 1 {
            return smallvec::SmallVec::from_slice_copy(&[self.id]);
        }

        base.into_iter()
            .map(|base| {
                env.intern_type(PartialType {
                    span: self.span,
                    kind: env.intern_kind(TypeKind::Apply(Apply {
                        base,
                        substitutions: self.kind.substitutions,
                    })),
                })
            })
            .collect()
    }

    fn distribute_intersection(
        self: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> smallvec::SmallVec<TypeId, 16> {
        let base = env.distribute_intersection(self.kind.base);

        // Due to distribution rules, we know if there's a single element, it's the same as the
        // original type.
        if base.len() == 1 {
            return smallvec::SmallVec::from_slice_copy(&[self.id]);
        }

        base.into_iter()
            .map(|base| {
                env.intern_type(PartialType {
                    span: self.span,
                    kind: env.intern_kind(TypeKind::Apply(Apply {
                        base,
                        substitutions: self.kind.substitutions,
                    })),
                })
            })
            .collect()
    }

    fn is_subtype_of(
        self: Type<'heap, Self>,
        supertype: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        env.is_subtype_of(Variance::Covariant, self.kind.base, supertype.kind.base)
    }

    fn is_equivalent(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        env.is_equivalent(self.kind.base, other.kind.base)
    }

    fn simplify(self: Type<'heap, Self>, env: &mut SimplifyEnvironment<'_, 'heap>) -> TypeId {
        let (guard, id) = env.provision(self.id);

        let base = env.simplify(self.kind.base);

        // We can only safely replace ourselves in the case that we're not referenced by anyone.
        // This is not the same as checking if the base type is recursive, while the base type might
        // be recursive, it doesn't guarantee that we're actually referenced in the recursive type.
        if env.is_concrete(base) && !guard.is_used() {
            // We cannot re-span ourselves here, because someone might have already referenced the
            // base type, therefore changing the `TypeId` here and removing it from the type-graph
            // would be invalid.
            return base;
        }

        env.intern_provisioned(
            id,
            PartialType {
                span: self.span,
                kind: env.intern_kind(TypeKind::Apply(Apply {
                    base,
                    substitutions: self.kind.substitutions,
                })),
            },
        )
    }
}

impl<'heap> Apply<'heap> {
    pub fn collect_substitution_constraints(
        self,
        span: SpanId,
        env: &mut InferenceEnvironment<'_, 'heap>,
    ) {
        for &substitution in &*self.substitutions {
            let param = env.intern_type(PartialType {
                span,
                kind: env.intern_kind(TypeKind::Param(Param {
                    argument: substitution.argument,
                })),
            });

            env.collect_constraints(Variance::Invariant, param, substitution.value);
        }
    }
}

impl<'heap> Inference<'heap> for Apply<'heap> {
    fn collect_constraints(
        self: Type<'heap, Self>,
        supertype: Type<'heap, Self>,
        env: &mut InferenceEnvironment<'_, 'heap>,
    ) {
        // We do not really care for the underlying type, we just want to collect our constraints
        self.kind.collect_substitution_constraints(self.span, env);
        supertype
            .kind
            .collect_substitution_constraints(supertype.span, env);

        env.collect_constraints(Variance::Covariant, self.kind.base, supertype.kind.base);
    }

    fn instantiate(self: Type<'heap, Self>, env: &mut InstantiateEnvironment<'_, 'heap>) -> TypeId {
        let (guard_id, id) = env.provision(self.id);
        let (_guard, substitutions, substitution_state) =
            env.instantiate_substitutions(self.kind.substitutions);

        if substitution_state == SubstitutionState::IdentitiesOnly || substitutions.is_empty() {
            // When we have only identity substitutions or no substitutions at all,
            // we can use regular instantiation for the base type because the result
            // won't be generic over the substitutions
            let base = env.instantiate(self.kind.base);

            // If there are no effective substitutions, this Apply is redundant and
            // can potentially be simplified to just the base type
            if guard_id.is_used() {
                // However, if the type is referenced elsewhere, we must preserve the ID
                // by closing the reference. We use an empty substitution map which is
                // semantically equivalent to having no substitutions
                return env.intern_provisioned(
                    id,
                    PartialType {
                        span: self.span,
                        kind: env.intern_kind(TypeKind::Apply(Self {
                            base,
                            substitutions: GenericSubstitutions::empty(),
                        })),
                    },
                );
            }

            return base;
        }

        // For non-identity substitutions, we force instantiation of the base type
        // to ensure we generate a new type instance rather than reusing an existing one
        let base = env.force_instantiate(self.kind.base);

        env.intern_provisioned(
            id,
            PartialType {
                span: self.span,
                kind: env.intern_kind(TypeKind::Apply(Self {
                    base,
                    substitutions,
                })),
            },
        )
    }
}
