use core::ops::ControlFlow;

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
        error::{cannot_be_supertype_of_unknown, intersection_variant_mismatch, type_mismatch},
        inference::Inference,
        lattice::{Lattice, Projection, Subscript},
        pretty::{FormatType, TypeFormatter},
    },
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct IntersectionType<'heap> {
    pub variants: Interned<'heap, [TypeId]>,
}

impl<'heap> IntersectionType<'heap> {
    fn unnest_impl<'env>(
        self: Type<'heap, Self>,
        env: &'env Environment<'heap>,
        variants: &mut TypeIdSet<'env, 'heap, 16>,
        visited: &mut SmallVec<TypeId, 4>,
    ) {
        if visited.contains(&self.id) {
            return;
        }

        visited.push(self.id);

        for &variant in self.kind.variants {
            let r#type = env.r#type(variant);

            if let Some(intersection) = r#type.kind.intersection() {
                r#type
                    .with(intersection)
                    .unnest_impl(env, variants, visited);
            } else {
                variants.push(variant);
            }
        }

        visited.pop();
    }

    /// Flatten nested intersections into a single level of variants.
    ///
    /// This function traverses the intersection structure and returns a single-level list of all
    /// the variant `TypeId`s, removing any nesting. It also handles recursive intersections with
    /// self-references.
    ///
    /// For intersection types, recursive self-references are handled differently than in unions:
    /// - When an intersection refers to itself (i.e., an equation `μX.(X ∩ A ∩ B)`), under
    ///   coinductive semantics. This is equivalent to the intersection of all other variants, as
    ///   `X` must satisfy all constraints of the other variants.
    /// - Therefore, unlike unions (which collapse to the top type when self-referential),
    ///   self-references in intersections are simply removed during unnesting.
    ///
    /// For example, `(Number & (String & Boolean))` is unnested to `[Number, String, Boolean]`,
    /// and `μX.(X & Number)` is unnested to just `[Number]`.
    pub(crate) fn unnest(
        self: Type<'heap, Self>,
        env: &Environment<'heap>,
    ) -> SmallVec<TypeId, 16> {
        let mut variants = TypeIdSet::with_capacity(env, self.kind.variants.len());

        self.unnest_impl(env, &mut variants, &mut SmallVec::new());

        variants.finish()
    }

    pub(crate) fn join_variants(
        lhs_span: SpanId,
        lhs_variants: &[TypeId],
        rhs_variants: &[TypeId],
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 4> {
        // `join` over an intersection is a distribution, e.g.
        // (A ∩ B) ∨ (C ∩ D)
        // = (A ∨ C) ∩ (A ∨ D) ∩ (B ∨ C) ∩ (B ∨ D)
        let mut variants = TypeIdSet::<16>::with_capacity(
            env.environment,
            lhs_variants.len() * rhs_variants.len(),
        );

        if lhs_variants.is_empty() {
            variants.extend_from_slice(rhs_variants);
        } else if rhs_variants.is_empty() {
            variants.extend_from_slice(lhs_variants);
        } else {
            for &lhs in lhs_variants {
                for &rhs in rhs_variants {
                    variants.push(env.join(lhs, rhs));
                }
            }
        }

        let variants = variants.finish();

        // We need to wrap this in an explicit `Intersection`, as a `join` with multiple returned
        // values turns into a union.
        let id = env.intern_type(PartialType {
            span: lhs_span,
            kind: env.intern_kind(TypeKind::Intersection(IntersectionType {
                variants: env.intern_type_ids(&variants),
            })),
        });

        SmallVec::from_slice_copy(&[id])
    }

    pub(crate) fn meet_variants(
        lhs_span: SpanId,
        lhs_variants: &[TypeId],
        rhs_variants: &[TypeId],
        env: &LatticeEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 4> {
        // 1) Top ∧ Top = Top
        if lhs_variants.is_empty() && rhs_variants.is_empty() {
            return SmallVec::from_slice_copy(&[env.intern_type(PartialType {
                span: lhs_span,
                kind: env.intern_kind(TypeKind::Unknown),
            })]);
        }

        // 2) Top ∧ X = X
        if lhs_variants.is_empty() {
            return SmallVec::from_slice_copy(rhs_variants);
        }

        // 3) X ∧ Top = X
        if rhs_variants.is_empty() {
            return SmallVec::from_slice_copy(lhs_variants);
        }

        let mut variants =
            TypeIdSet::with_capacity(env.environment, lhs_variants.len() + rhs_variants.len());
        variants.extend_from_slice(lhs_variants);
        variants.extend_from_slice(rhs_variants);

        variants.finish()
    }

    pub(crate) fn is_subtype_of_variants<'env, T, U>(
        actual: Type<'heap, T>,
        expected: Type<'heap, U>,
        self_variants: &[TypeId],
        supertype_variants: &[TypeId],
        env: &mut AnalysisEnvironment<'env, 'heap>,
    ) -> bool
    where
        for<'fmt> TypeFormatter<'fmt, 'env, 'heap>: FormatType<'fmt, T> + FormatType<'fmt, U>,
        T: Copy,
        U: Copy,
    {
        // Empty intersection (corresponds to the Unknown/top type) is a supertype of everything
        if supertype_variants.is_empty() {
            return true;
        }

        // If the subtype is empty (Unknown), only the top type can be a supertype
        if self_variants.is_empty() {
            // We always fail-fast here
            let _: ControlFlow<()> =
                env.record_diagnostic(|env| cannot_be_supertype_of_unknown(env, actual, expected));

            return false;
        }

        let mut compatible = true;

        for &self_variant in self_variants {
            let found = supertype_variants.iter().all(|&super_variant| {
                env.is_subtype_of(Variance::Covariant, self_variant, super_variant)
            });

            if found {
                continue;
            }

            if env
                .record_diagnostic(|env| {
                    intersection_variant_mismatch(env, env.r#type(self_variant), expected)
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
        // Empty intersections are only equivalent to other empty intersections
        // As an empty intersection corresponds to `Unknown`, therefore only `Unknown ≡ Unknown`
        if lhs_variants.is_empty() && rhs_variants.is_empty() {
            return true;
        }

        // Special case for empty intersections (Unknown type)
        if lhs_variants.is_empty() || rhs_variants.is_empty() {
            // We always fail-fast here
            let _: ControlFlow<()> = env.record_diagnostic(|env| {
                let help = "The Unknown type (empty intersection) can only be equivalent to \
                            itself. A non-empty intersection cannot be equivalent to Unknown.";

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
                .record_diagnostic(|env| {
                    intersection_variant_mismatch(env, env.r#type(lhs_variant), rhs)
                })
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
                .record_diagnostic(|env| {
                    intersection_variant_mismatch(env, env.r#type(rhs_variant), lhs)
                })
                .is_break()
            {
                return false;
            }

            rhs_compatible = false;
        }

        lhs_compatible && rhs_compatible
    }

    pub(crate) fn collect_constraints_variants(
        self_span: SpanId,
        super_span: SpanId,
        self_variants: &[TypeId],
        super_variants: &[TypeId],
        env: &mut InferenceEnvironment,
    ) {
        // (A & B) <: (C & D)
        // ≡ (A & B) <: C ∧ (A & B) <: D
        // ≡ (A <: C) ∧ (B <: C) ∧ (A <: D) ∧ (B <: D)
        // Therefore this simplifies down to a cartesian product

        match (self_variants, super_variants) {
            ([], []) => {}
            ([], _) => {
                // The left-hand side is empty, and therefore is `Unknown`
                let this = env.intern_type(PartialType {
                    span: self_span,
                    kind: env.intern_kind(TypeKind::Unknown),
                });

                for &super_variant in super_variants {
                    env.collect_constraints(Variance::Covariant, this, super_variant);
                }
            }
            (_, []) => {
                // The right-hand side is empty, and therefore is `Unknown`. The bound trivially
                // holds, but we still need to push it in case downstream relies on it.
                let supertype = env.intern_type(PartialType {
                    span: super_span,
                    kind: env.intern_kind(TypeKind::Unknown),
                });

                for &self_variant in self_variants {
                    env.collect_constraints(Variance::Covariant, self_variant, supertype);
                }
            }
            (_, _) => {
                for &self_variant in self_variants {
                    for &super_variant in super_variants {
                        env.collect_constraints(Variance::Covariant, self_variant, super_variant);
                    }
                }
            }
        }
    }
}

impl<'heap> Lattice<'heap> for IntersectionType<'heap> {
    fn join(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 4> {
        let lhs_variants = self.unnest(env);
        let rhs_variants = other.unnest(env);

        Self::join_variants(self.span, &lhs_variants, &rhs_variants, env)
    }

    fn meet(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 4> {
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
                // Empty intersection is unknown, therefore defer to unknown
                env.projection(
                    env.intern_type(PartialType {
                        span: self.span,
                        kind: env.intern_kind(TypeKind::Unknown),
                    }),
                    field,
                )
            }
            &[variant] => Projection::Resolved(variant),
            variants => {
                let id = env.intern_type(PartialType {
                    span: self.span,
                    kind: env.intern_kind(TypeKind::Intersection(Self {
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
                // Empty intersection is unknown, therefore defer to unknown
                env.subscript(
                    env.intern_type(PartialType {
                        span: self.span,
                        kind: env.intern_kind(TypeKind::Unknown),
                    }),
                    index,
                    infer,
                )
            }
            &[variant] => Subscript::Resolved(variant),
            variants => {
                let id = env.intern_type(PartialType {
                    span: self.span,
                    kind: env.intern_kind(TypeKind::Intersection(Self {
                        variants: env.intern_type_ids(variants),
                    })),
                });

                Subscript::Resolved(id)
            }
        }
    }

    fn is_bottom(self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        let variants = self.unnest(env);

        if variants.iter().any(|&id| env.is_bottom(id)) {
            return true;
        }

        // Check if any of the variants are disjoint from each other
        for (index, &lhs) in variants.iter().enumerate() {
            if lhs == self.id {
                continue;
            }

            for &rhs in &variants[index + 1..] {
                if lhs == rhs {
                    continue;
                }

                if env.is_disjoint(lhs, rhs) {
                    return true;
                }
            }
        }

        false
    }

    fn is_top(self: Type<'heap, Self>, _: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        self.kind.variants.is_empty()
    }

    fn is_concrete(self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        self.kind.variants.iter().all(|&id| env.is_concrete(id))
    }

    fn is_recursive(self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        self.kind.variants.iter().any(|&id| env.is_recursive(id))
    }

    fn distribute_union(
        self: Type<'heap, Self>,
        _: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 16> {
        SmallVec::from_slice_copy(&[self.id])
    }

    fn distribute_intersection(
        self: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 16> {
        self.kind
            .variants
            .iter()
            .flat_map(|&variant| env.distribute_intersection(variant))
            .collect()
    }

    /// Checks if this intersection type is a subtype of the given supertype.
    ///
    /// In type theory, an intersection type `A & B` represents a type that has *all* the properties
    /// of both `A` and `B`. A value of this type must satisfy all constraints of both component
    /// types.
    ///
    /// Intersection types decompose in the following way:
    ///
    /// ```text
    /// (A & B) <: (C & D)
    ///   <=> A <: (C & D) ∧ B <: (C & D)
    ///   <=> (A <: C ∧ A <: D) ∧ (B <: C ∧ B <: D)
    /// ```
    fn is_subtype_of(
        self: Type<'heap, Self>,
        supertype: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        let self_variants = self.unnest(env);
        let supertype_variants = supertype.unnest(env);

        Self::is_subtype_of_variants(self, supertype, &self_variants, &supertype_variants, env)
    }

    fn is_equivalent(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        let lhs_variants = self.unnest(env);
        let rhs_variants = other.unnest(env);

        Self::is_equivalent_variants(self, other, &lhs_variants, &rhs_variants, env)
    }

    fn simplify(self: Type<'heap, Self>, env: &mut SimplifyEnvironment<'_, 'heap>) -> TypeId {
        let (_guard, id) = env.provision(self.id);

        // Gather + flatten + simplify
        let mut variants =
            TypeIdSet::<16>::with_capacity(env.environment, self.kind.variants.len());
        for &variant in self.kind.variants {
            let variant = env.simplify(variant);

            // If an intersection type contains itself as one of its own conjuncts, e.g. `type A = A
            // & Foo & Bar`, then under *coinductive* (greatest-fixed-point) semantics
            // the equation `A = X ∩ A` admits all `S` with `S ⊆ X`, and coinduction
            // picks the *largest* such `S` (namely `X` itself). Therefore any valid `A`
            // must satisfy `A ⊆ X`, and we can simplify an immediately self-referential
            // intersection by dropping the `A` conjunct and keeping only the other
            // types.
            if variant == id.value() {
                // self-reference detected: `μX.(X ∧ …)` coinductively collapses to the other
                // conjuncts
                continue;
            }

            // We need to use `get` here, as substituted types may not yet be materialized
            if let Some(IntersectionType { variants: nested }) = env
                .types
                .get(variant)
                .and_then(|r#type| r#type.kind.intersection())
            {
                variants.extend_from_slice(nested);
            } else {
                variants.push(variant);
            }
        }

        // Sort, dedup, drop top
        let mut variants = variants.finish();
        variants.retain(|&variant| !env.is_top(variant));

        // Propagate bottom type
        if variants.iter().any(|&variant| env.is_bottom(variant)) {
            return env.intern_provisioned(
                id,
                PartialType {
                    span: self.span,
                    kind: env.intern_kind(TypeKind::Never),
                },
            );
        }

        // Check for disjoint types - if any two types are unrelated, the intersection is Never
        for index in 0..variants.len() {
            for jndex in (index + 1)..variants.len() {
                let lhs = variants[index];
                let rhs = variants[jndex];

                if env.is_disjoint(lhs, rhs) {
                    return env.intern_provisioned(
                        id,
                        PartialType {
                            span: self.span,
                            kind: env.intern_kind(TypeKind::Never),
                        },
                    );
                }
            }
        }

        // Drop supertypes of other variants
        let backup = variants.clone();
        variants.retain(|&supertype| {
            // keep `supertype` only if it is not a supertype of any other variant
            !backup.iter().any(|&subtype| {
                subtype != supertype && env.is_subtype_of(Variance::Covariant, subtype, supertype)
            })
        });

        match variants.as_slice() {
            [] => env.intern_provisioned(
                id,
                PartialType {
                    span: self.span,
                    kind: env.intern_kind(TypeKind::Unknown),
                },
            ),
            &[variant] if variant != id.value() => variant,
            _ => env.intern_provisioned(
                id,
                PartialType {
                    span: self.span,
                    kind: env.intern_kind(TypeKind::Intersection(IntersectionType {
                        variants: env.intern_type_ids(&variants),
                    })),
                },
            ),
        }
    }
}

impl<'heap> Inference<'heap> for IntersectionType<'heap> {
    fn collect_constraints(
        self: Type<'heap, Self>,
        supertype: Type<'heap, Self>,
        env: &mut InferenceEnvironment<'_, 'heap>,
    ) {
        let self_variants = self.unnest(env);
        let super_variants = supertype.unnest(env);

        Self::collect_constraints_variants(
            self.span,
            supertype.span,
            &self_variants,
            &super_variants,
            env,
        );
    }

    fn instantiate(self: Type<'heap, Self>, env: &mut InstantiateEnvironment<'_, 'heap>) -> TypeId {
        let (_guard, id) = env.provision(self.id);

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
                kind: env.intern_kind(TypeKind::Intersection(Self {
                    variants: env.intern_type_ids(&variants),
                })),
            },
        )
    }
}
