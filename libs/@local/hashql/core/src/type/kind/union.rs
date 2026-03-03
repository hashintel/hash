use core::{debug_assert_matches, ops::ControlFlow};

use bitvec::bitvec;
use smallvec::SmallVec;

use super::TypeKind;
use crate::{
    intern::Interned,
    span::SpanId,
    symbol::Ident,
    r#type::{
        PartialType, Type, TypeId,
        collections::TypeIdSet,
        environment::{
            AnalysisEnvironment, Environment, InferenceEnvironment, LatticeEnvironment,
            SimplifyEnvironment, Variance, instantiate::InstantiateEnvironment,
        },
        error::{cannot_be_subtype_of_never, type_mismatch, union_variant_mismatch},
        inference::{Constraint, Inference, Variable},
        lattice::{Lattice, Projection, Subscript},
        pretty::{FormatType, TypeFormatter},
    },
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct UnionType<'heap> {
    pub variants: Interned<'heap, [TypeId]>,
}

impl<'heap> UnionType<'heap> {
    fn unnest_impl<'env>(
        self: Type<'heap, Self>,
        env: &'env Environment<'heap>,
        variants: &mut TypeIdSet<'env, 'heap, 16>,
        visited: &mut SmallVec<TypeId, 4>,
    ) -> ControlFlow<()> {
        if visited.contains(&self.id) {
            return ControlFlow::Break(());
        }

        visited.push(self.id);

        for &variant in self.kind.variants {
            let r#type = env.r#type(variant);

            if let Some(union) = r#type.kind.union() {
                r#type.with(union).unnest_impl(env, variants, visited)?;
            } else {
                variants.push(variant);
            }
        }

        visited.pop();

        ControlFlow::Continue(())
    }

    /// Flatten nested unions, collapsing any self-reference into ⊤.
    ///
    /// This function returns a de-duplicated, “one-level” list of variant `TypeId`s. However, if
    /// the union contains itself as a variant (i.e. an equation `μX.(… ∪ X ∪ …)`), then by
    /// coinductive (greatest-fixed-point) reasoning the union denotes the universal supertype
    /// (`⊤`). In that case we immediately return a singleton list containing only the `Unknown`
    /// kind, which we treat as `⊤`.
    pub(crate) fn unnest(
        self: Type<'heap, Self>,
        env: &Environment<'heap>,
    ) -> SmallVec<TypeId, 16> {
        let mut variants = TypeIdSet::with_capacity(env, self.kind.variants.len());
        let mut visited = SmallVec::new();

        if self
            .unnest_impl(env, &mut variants, &mut visited)
            .is_break()
        {
            SmallVec::from_slice_copy(&[env.intern_type(PartialType {
                span: self.span,
                kind: env.intern_kind(TypeKind::Unknown),
            })])
        } else {
            variants.finish()
        }
    }

    pub(crate) fn join_variants(
        lhs_variants: &[TypeId],
        rhs_variants: &[TypeId],
        env: &Environment,
    ) -> SmallVec<TypeId, 4> {
        if lhs_variants.is_empty() {
            return SmallVec::from_slice_copy(rhs_variants);
        }

        if rhs_variants.is_empty() {
            return SmallVec::from_slice_copy(lhs_variants);
        }

        let mut variants = TypeIdSet::with_capacity(env, lhs_variants.len() + rhs_variants.len());
        variants.extend_from_slice(lhs_variants);
        variants.extend_from_slice(rhs_variants);

        variants.finish()
    }

    pub(crate) fn meet_variants(
        lhs_span: SpanId,
        lhs_variants: &[TypeId],
        rhs_variants: &[TypeId],
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 4> {
        // `meet` over a union is a distribution, e.g.
        // (A ∪ B) ∧ (C ∪ D)
        // = (A ∧ C) ∪ (A ∧ D) ∪ (B ∧ C) ∪ (B ∧ D)
        let mut variants = TypeIdSet::<16>::with_capacity(
            env.environment,
            lhs_variants.len() * rhs_variants.len(),
        );

        for &lhs in lhs_variants {
            for &rhs in rhs_variants {
                variants.push(env.meet(lhs, rhs));
            }
        }

        let variants = variants.finish();

        // We need to wrap this in an explicit `Union`, as a `meet` with multiple returned values
        // turns into an intersection.
        let id = env.intern_type(PartialType {
            span: lhs_span,
            kind: env.intern_kind(TypeKind::Union(UnionType {
                variants: env.intern_type_ids(&variants),
            })),
        });

        SmallVec::from_slice_copy(&[id])
    }

    pub(crate) fn is_subtype_of_variants<'env, T, U>(
        actual: Type<'heap, T>,
        expected: Type<'heap, U>,
        self_variants: &[TypeId],
        super_variants: &[TypeId],
        env: &mut AnalysisEnvironment<'env, 'heap>,
    ) -> bool
    where
        for<'fmt> TypeFormatter<'fmt, 'env, 'heap>: FormatType<'fmt, T> + FormatType<'fmt, U>,
        T: Copy,
        U: Copy,
    {
        // Empty union (corresponds to the Never type) is a subtype of any union type
        if self_variants.is_empty() {
            return true;
        }

        // If the supertype is empty, only an empty subtype can be a subtype of it
        if super_variants.is_empty() {
            // We always fail-fast here
            let _: ControlFlow<()> =
                env.record_diagnostic(|env| cannot_be_subtype_of_never(env, actual, expected));

            return false;
        }

        let mut compatible = true;

        for &self_variant in self_variants {
            let found = super_variants.iter().any(|&super_variant| {
                env.is_subtype_of(Variance::Covariant, self_variant, super_variant)
            });

            if found {
                continue;
            }

            if env
                .record_diagnostic(|env| {
                    union_variant_mismatch(env, env.r#type(self_variant), expected)
                })
                .is_break()
            {
                return false;
            }

            compatible = false;
        }

        compatible
    }

    pub(crate) fn is_equivalent_variants<'env, T, U>(
        lhs: Type<'heap, T>,
        rhs: Type<'heap, U>,
        lhs_variants: &[TypeId],
        rhs_variants: &[TypeId],
        env: &mut AnalysisEnvironment<'env, 'heap>,
    ) -> bool
    where
        for<'fmt> TypeFormatter<'fmt, 'env, 'heap>: FormatType<'fmt, T> + FormatType<'fmt, U>,
        T: Copy,
        U: Copy,
    {
        // Empty unions are only equivalent to other empty unions
        // As an empty union corresponds to the `Never` type, therefore only `Never ≡ Never`
        if lhs_variants.is_empty() && rhs_variants.is_empty() {
            return true;
        }

        // Special case for empty unions (Never type)
        if lhs_variants.is_empty() || rhs_variants.is_empty() {
            // We always fail-fast here
            let _: ControlFlow<()> = env.record_diagnostic(|env| {
                let help = "The Never type (empty union) can only be equivalent to itself. A \
                            non-empty union cannot be equivalent to Never.";

                type_mismatch(env, lhs, rhs, Some(help))
            });

            return false;
        }

        let mut lhs_compatible = true;
        let mut rhs_compatible = true;

        let mut lhs_matched = bitvec![0; lhs_variants.len()];
        let mut rhs_matched = bitvec![0; rhs_variants.len()];

        // Find all matching pairs
        for (&lhs_variant, mut lhs_matched) in lhs_variants.iter().zip(lhs_matched.iter_mut()) {
            for (&rhs_variant, rhs_matched) in rhs_variants.iter().zip(rhs_matched.iter_mut()) {
                if env.is_equivalent(lhs_variant, rhs_variant) {
                    *lhs_matched = true;
                    rhs_matched.commit(true);
                }
            }
        }

        // Check if there are any lhs variants which weren't matched
        for index in lhs_matched.iter_zeros() {
            let lhs_variant = lhs_variants[index];

            if env
                .record_diagnostic(|env| union_variant_mismatch(env, env.r#type(lhs_variant), rhs))
                .is_break()
            {
                return false;
            }

            lhs_compatible = false;
        }

        // Check if there are any rhs variants which weren't matched
        for index in rhs_matched.iter_zeros() {
            let rhs_variant = rhs_variants[index];

            if env
                .record_diagnostic(|env| union_variant_mismatch(env, env.r#type(rhs_variant), lhs))
                .is_break()
            {
                return false;
            }

            rhs_compatible = false;
        }

        lhs_compatible && rhs_compatible
    }

    pub(crate) fn collect_constraints_variants(
        selftype: TypeId,
        supertype: TypeId,
        super_span: SpanId,
        self_variants: &[TypeId],
        super_variants: &[TypeId],
        env: &mut InferenceEnvironment<'_, 'heap>,
    ) {
        // (A | B) <: (C | D)
        // ≡ (A | B) <: C ∨ (A | B) <: D
        // ≡ (A <: C ∧ B <: C) ∨ (A <: D ∧ B <: D)
        // ≡ A <: (C | D) ∧ B <: (C | D)
        // ≡ (A <: C ∨ B <: C) ∧ (A <: D ∨ B <: D)
        let is_invariant = env.is_invariant();

        #[expect(clippy::match_same_arms, reason = "readability")]
        match (self_variants, super_variants) {
            ([], []) => {
                // Both sides are never
            }
            ([], _) => {
                // We do not record anything here, as `Never <: Union` trivially holds, and the case
                // would either way never emit a constraint.
            }
            (self_variants, []) => {
                let never = env.intern_type(PartialType {
                    span: super_span,
                    kind: env.intern_kind(TypeKind::Never),
                });

                for &self_variant in self_variants {
                    env.collect_constraints(Variance::Covariant, self_variant, never);
                }
            }
            (&[self_variant], &[super_variant]) => {
                // Not a union, proceed
                env.collect_constraints(Variance::Covariant, self_variant, super_variant);
            }
            (&[self_variant], _) => {
                // To be able to support recursing down union-right, we would need a fully fledged
                // inference engine that handles backtracking. In reality most inference engines do
                // not support this.
                // The downside of this approach is that the type generated is potentially less
                // precise than it could be (but still correct). This also means that inference on
                // the right side (the supertype) is not continued. Meaning that any inference
                // variable on the right side won't be constrained to the left side (the subtype).
                // This is deemed acceptable, as any type that isn't constrained enough on the right
                // side will be caught during type checking.
                let self_variant = env.r#type(self_variant);
                let Some(variable) = self_variant.kind.into_variable() else {
                    // There's no variable on the left, so nothing to constrain.
                    return;
                };

                // There are multiple variables, therefore the right side is guaranteed to be a
                // union
                debug_assert_matches!(env.r#type(supertype).kind, TypeKind::Union(_));

                env.add_constraint(Constraint::UpperBound {
                    variable: Variable {
                        span: self_variant.span,
                        kind: variable,
                    },
                    bound: supertype,
                });
            }
            (_, &[super_variant]) if is_invariant => {
                // Under invariance (A ≡ B means A <: B ∧ B <: A), we need to handle the reverse
                // direction (B <: A). With a single variant on the right containing a variable,
                // we can safely add a lower bound constraint. If it's not a variable, we can't
                // recurse because that would require union-right inference (handling disjunctions)
                let super_variant = env.r#type(super_variant);
                let Some(variable) = super_variant.kind.into_variable() else {
                    // There's no variable on the right, so nothing to constrain.
                    return;
                };

                // There are multiple variables, therefore the right side is guaranteed to be a
                // union
                debug_assert_matches!(env.r#type(selftype).kind, TypeKind::Union(_));

                env.add_constraint(Constraint::LowerBound {
                    variable: Variable {
                        span: super_variant.span,
                        kind: variable,
                    },
                    bound: selftype,
                });
            }

            (self_variants, &[super_variant]) => {
                // Single constraint, means we can actually recurse down
                for &self_variant in self_variants {
                    env.collect_constraints(Variance::Covariant, self_variant, super_variant);
                }
            }
            (_, _) if is_invariant => {
                // Multiple variants on both sides under invariance would require encoding
                // disjunctive constraints (OR relationships), which our inference engine
                // doesn't support. We must skip constraint generation to avoid over-constraining.
            }
            (self_variants, super_variants) => {
                for &self_variant in self_variants {
                    Self::collect_constraints_variants(
                        selftype,
                        supertype,
                        super_span,
                        &[self_variant],
                        super_variants,
                        env,
                    );
                }
            }
        }
    }
}

impl<'heap> Lattice<'heap> for UnionType<'heap> {
    fn join(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> smallvec::SmallVec<TypeId, 4> {
        let lhs_variants = self.unnest(env);
        let rhs_variants = other.unnest(env);

        Self::join_variants(&lhs_variants, &rhs_variants, env)
    }

    fn meet(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> smallvec::SmallVec<TypeId, 4> {
        let lhs_variants = self.unnest(env);
        let rhs_variants = other.unnest(env);

        Self::meet_variants(self.span, &lhs_variants, &rhs_variants, env)
    }

    fn projection(
        self: Type<'heap, Self>,
        field: Ident<'heap>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> Projection {
        let variants = self.unnest(env);

        let mut result = TypeIdSet::<16>::with_capacity(env.environment, variants.len());
        let mut has_error = false;

        for variant in variants {
            let projection = env.projection(variant, field);

            match projection {
                // We can fast-"fail" here, because pending means that we'll defer anyway
                Projection::Pending => return Projection::Pending,
                Projection::Error => has_error = true,
                Projection::Resolved(id) => result.push(id),
            }
        }

        if has_error {
            // We've already encountered an error, simply propagate it
            return Projection::Error;
        }

        match &*result.finish() {
            [] => {
                // Empty union is never, therefore defer to never
                env.projection(
                    env.intern_type(PartialType {
                        span: self.span,
                        kind: env.intern_kind(TypeKind::Never),
                    }),
                    field,
                )
            }
            &[variant] => Projection::Resolved(variant),
            variants => {
                let id = env.intern_type(PartialType {
                    span: self.span,
                    kind: env.intern_kind(TypeKind::Union(Self {
                        variants: env.intern_type_ids(variants),
                    })),
                });

                Projection::Resolved(id)
            }
        }
    }

    fn subscript(
        self: Type<'heap, Self>,
        index: TypeId,
        env: &mut LatticeEnvironment<'_, 'heap>,
        infer: &mut InferenceEnvironment<'_, 'heap>,
    ) -> Subscript {
        let variants = self.unnest(env);

        let mut result = TypeIdSet::<16>::with_capacity(env.environment, variants.len());

        let mut has_pending = false;
        let mut has_error = false;

        for variant in variants {
            let subscript = env.subscript(variant, index, infer);

            match subscript {
                // Unlike projection, which can early exit out if something is pending. A `Pending`
                // subscript has a high likelihood of discharging additional
                // constraints, if we were to early exit out we wouldn't be able to
                // discharge all the additional constraints. Which would still be correct, but could
                // result in less precise error messages and additional fix-point computations.
                Subscript::Pending => has_pending = true,
                Subscript::Error => has_error = true,
                Subscript::Resolved(id) => result.push(id),
            }
        }

        if has_pending {
            // Pending has precedence over error
            return Subscript::Pending;
        }

        if has_error {
            // We've already encountered an error, simply propagate it
            return Subscript::Error;
        }

        match &*result.finish() {
            [] => {
                // Empty union is never, therefore defer to never
                env.subscript(
                    env.intern_type(PartialType {
                        span: self.span,
                        kind: env.intern_kind(TypeKind::Never),
                    }),
                    index,
                    infer,
                )
            }
            &[variant] => Subscript::Resolved(variant),
            variants => {
                let id = env.intern_type(PartialType {
                    span: self.span,
                    kind: env.intern_kind(TypeKind::Union(Self {
                        variants: env.intern_type_ids(variants),
                    })),
                });

                Subscript::Resolved(id)
            }
        }
    }

    fn is_bottom(self: Type<'heap, Self>, _: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        self.kind.variants.is_empty()
    }

    fn is_top(self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        self.kind.variants.iter().any(|&id| env.is_top(id))
    }

    fn is_concrete(self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        self.kind.variants.iter().all(|&id| env.is_concrete(id))
    }

    fn is_recursive(self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        self.kind.variants.iter().any(|&id| env.is_recursive(id))
    }

    fn distribute_union(
        self: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 16> {
        self.kind
            .variants
            .iter()
            .flat_map(|&variant| env.distribute_union(variant))
            .collect()
    }

    fn distribute_intersection(
        self: Type<'heap, Self>,
        _: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 16> {
        SmallVec::from_slice_copy(&[self.id])
    }

    /// Checks if this union type is a subtype of the given supertype.
    ///
    /// In type theory, a union type `A | B` represents a type that has *either* the properties
    /// of `A` or `B`. A value of this type must satisfy the constraints of at least one of the
    /// component types.
    ///
    /// Unions decompose in the following way:
    /// ```text
    /// (A | B) <: (C | D)
    ///   <=> A <: (C | D) ∧ B <: (C | D)
    ///   <=> (A <: C ∨ A <: D) ∧ (B <: C ∨ B <: D)
    /// ```
    ///
    /// This means that for each variant in the subtype union, there must exist at least one
    /// variant in the supertype union that is a supertype of it.
    fn is_subtype_of(
        self: Type<'heap, Self>,
        supertype: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        let self_variants = self.distribute_union(env);
        let super_variants = supertype.distribute_union(env);

        Self::is_subtype_of_variants(self, supertype, &self_variants, &super_variants, env)
    }

    fn is_equivalent(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        let lhs_variants = self.distribute_union(env);
        let rhs_variants = other.distribute_union(env);

        Self::is_equivalent_variants(self, other, &lhs_variants, &rhs_variants, env)
    }

    fn simplify(self: Type<'heap, Self>, env: &mut SimplifyEnvironment<'_, 'heap>) -> TypeId {
        let (_guard, id) = env.provision(self.id);

        // Gather + flatten + simplify
        let mut variants =
            TypeIdSet::<16>::with_capacity(env.environment, self.kind.variants.len());
        for &variant in self.kind.variants {
            let variant = env.simplify(variant);

            // If a union type contains itself as one of its own variants, e.g. `type A = A | Foo |
            // Bar`, then under *coinductive* (greatest-fixed-point) semantics the only solution of
            // the equation `A = X ∪ A` is the *top* type (`⊤`). Therefore any valid A must
            // satisfy `X ⊆ A`. Coinduction picks the largest such A (the entire
            // universe). We therefore simplify an immediately self-referential union
            // into `⊤`.
            if variant == id.value() {
                // self-reference detected: `μX. (X ∪ …)` coinductively collapses to `⊤`
                return env.intern_provisioned(
                    id,
                    PartialType {
                        span: self.span,
                        kind: env.intern_kind(TypeKind::Unknown),
                    },
                );
            }

            // We need to use `get` here, as substituted types may not yet be materialized
            if let Some(UnionType { variants: nested }) = env
                .types
                .get(variant)
                .and_then(|r#type| r#type.kind.union())
            {
                variants.extend_from_slice(nested);
            } else {
                variants.push(variant);
            }
        }

        // Sort, dedupe, drop bottom
        let mut variants = variants.finish();
        variants.retain(|&variant| !env.is_bottom(variant));

        // Propagate top type
        if variants.iter().any(|&variant| env.is_top(variant)) {
            return env.intern_provisioned(
                id,
                PartialType {
                    span: self.span,
                    kind: env.intern_kind(TypeKind::Unknown),
                },
            );
        }

        // TODO: in the future we might want to consider collapse via constructor-merge, turning
        // any: `List<T> | List<U>` into `List<T | U>`.

        // Collapse via subsumption
        let backup = variants.clone();
        variants.retain(|&subtype| {
            // keep v only if it is *not* a subtype of any other distinct u
            !backup.iter().any(|&supertype| {
                subtype != supertype && env.is_subtype_of(Variance::Covariant, subtype, supertype)
            })
        });

        // Collapse empty or singleton
        match variants.as_slice() {
            [] => env.intern_provisioned(
                id,
                PartialType {
                    span: self.span,
                    kind: env.intern_kind(TypeKind::Never),
                },
            ),
            &[variant] if variant != id.value() => variant,
            _ => env.intern_provisioned(
                id,
                PartialType {
                    span: self.span,
                    kind: env.intern_kind(TypeKind::Union(UnionType {
                        variants: env.intern_type_ids(&variants),
                    })),
                },
            ),
        }
    }
}

impl<'heap> Inference<'heap> for UnionType<'heap> {
    fn collect_constraints(
        self: Type<'heap, Self>,
        supertype: Type<'heap, Self>,
        env: &mut InferenceEnvironment<'_, 'heap>,
    ) {
        let self_variants = self.unnest(env);
        let super_variants = supertype.unnest(env);

        Self::collect_constraints_variants(
            self.id,
            supertype.id,
            supertype.span,
            &self_variants,
            &super_variants,
            env,
        );
    }

    fn instantiate(self: Type<'heap, Self>, env: &mut InstantiateEnvironment<'_, 'heap>) -> TypeId {
        let (_guard_id, id) = env.provision(self.id);

        let mut variants =
            TypeIdSet::<16>::with_capacity(env.environment, self.kind.variants.len());

        for &variant in self.kind.variants {
            variants.push(env.instantiate(variant));
        }

        let variants = variants.finish();

        env.intern_provisioned(
            id,
            PartialType {
                span: self.span,
                kind: env.intern_kind(TypeKind::Union(Self {
                    variants: env.intern_type_ids(&variants),
                })),
            },
        )
    }
}
