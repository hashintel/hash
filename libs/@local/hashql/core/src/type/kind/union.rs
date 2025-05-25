use core::{assert_matches::debug_assert_matches, ops::ControlFlow};

use bitvec::bitvec;
use pretty::{DocAllocator as _, RcAllocator, RcDoc};
use smallvec::SmallVec;

use super::TypeKind;
use crate::{
    intern::Interned,
    pretty::{PrettyPrint, PrettyRecursionBoundary},
    span::SpanId,
    symbol::Ident,
    r#type::{
        PartialType, Type, TypeId,
        collection::TypeIdSet,
        environment::{
            AnalysisEnvironment, Environment, InferenceEnvironment, LatticeEnvironment,
            SimplifyEnvironment, instantiate::InstantiateEnvironment,
        },
        error::{cannot_be_subtype_of_never, type_mismatch, union_variant_mismatch},
        inference::{Constraint, Inference, PartialStructuralEdge, Variable},
        lattice::{Lattice, Projection},
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
            SmallVec::from_slice(&[env.intern_type(PartialType {
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
            return SmallVec::from_slice(rhs_variants);
        }

        if rhs_variants.is_empty() {
            return SmallVec::from_slice(lhs_variants);
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

        SmallVec::from_slice(&[id])
    }

    pub(crate) fn is_subtype_of_variants<T, U>(
        actual: Type<'heap, T>,
        expected: Type<'heap, U>,
        self_variants: &[TypeId],
        super_variants: &[TypeId],
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> bool
    where
        T: PrettyPrint<'heap>,
        U: PrettyPrint<'heap>,
    {
        // Empty union (corresponds to the Never type) is a subtype of any union type
        if self_variants.is_empty() {
            return true;
        }

        // If the supertype is empty, only an empty subtype can be a subtype of it
        if super_variants.is_empty() {
            // We always fail-fast here
            let _: ControlFlow<()> =
                env.record_diagnostic(|env| cannot_be_subtype_of_never(env, actual));

            return false;
        }

        let mut compatible = true;

        for &self_variant in self_variants {
            let found = super_variants.iter().any(|&super_variant| {
                env.in_covariant(|env| env.is_subtype_of(self_variant, super_variant))
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

    pub(crate) fn is_equivalent_variants<T, U>(
        lhs: Type<'heap, T>,
        rhs: Type<'heap, U>,
        lhs_variants: &[TypeId],
        rhs_variants: &[TypeId],
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> bool
    where
        T: PrettyPrint<'heap>,
        U: PrettyPrint<'heap>,
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
                    env.in_covariant(|env| env.collect_constraints(self_variant, never));
                }
            }
            (&[self_variant], &[super_variant]) => {
                // Not a union, proceed
                env.in_covariant(|env| env.collect_constraints(self_variant, super_variant));
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
            (self_variants, &[super_variant]) => {
                // Single constraint, means we can actually recurse down
                for &self_variant in self_variants {
                    env.in_covariant(|env| env.collect_constraints(self_variant, super_variant));
                }
            }
            (self_variants, super_variants) => {
                for &self_variant in self_variants {
                    Self::collect_constraints_variants(
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
        SmallVec::from_slice(&[self.id])
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
        variants.retain(|&mut variant| !env.is_bottom(variant));

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
        variants.retain(|&mut subtype| {
            // keep v only if it is *not* a subtype of any other distinct u
            !backup
                .iter()
                .any(|&supertype| subtype != supertype && env.is_subtype_of(subtype, supertype))
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
            supertype.id,
            supertype.span,
            &self_variants,
            &super_variants,
            env,
        );
    }

    fn collect_structural_edges(
        self: Type<'heap, Self>,
        variable: PartialStructuralEdge,
        env: &mut InferenceEnvironment<'_, 'heap>,
    ) {
        // We cannot collect any constraints union types **if** they are on the right side (e.g. the
        // edge is a source), as `union-right` resolves into an or, and therefore any constraint
        // wouldn't be additive.
        // This is not the case with union-left, as union-left resolves into an and, and therefore
        // any constraint would be additive.
        if variable.is_source() {
            // union-right
            return;
        }

        for &variant in self.kind.variants {
            env.in_covariant(|env| env.collect_structural_edges(variant, variable));
        }
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

impl<'heap> PrettyPrint<'heap> for UnionType<'heap> {
    fn pretty(
        &self,
        env: &Environment<'heap>,
        boundary: &mut PrettyRecursionBoundary,
    ) -> RcDoc<'heap, anstyle::Style> {
        RcAllocator
            .intersperse(
                self.variants
                    .iter()
                    .map(|&variant| boundary.pretty_type(env, variant)),
                RcDoc::line()
                    .append(RcDoc::text("|"))
                    .append(RcDoc::space()),
            )
            .nest(1)
            .group()
            .parens()
            .group()
            .into_doc()
    }
}

#[cfg(test)]
mod test {
    #![expect(clippy::min_ident_chars)]

    // Tests for the fixed union equivalence functionality with different variant counts
    use core::assert_matches::assert_matches;

    use super::UnionType;
    use crate::{
        heap::Heap,
        pretty::PrettyPrint as _,
        span::SpanId,
        symbol::Ident,
        r#type::{
            PartialType,
            environment::{
                AnalysisEnvironment, Environment, InferenceEnvironment, LatticeEnvironment,
                SimplifyEnvironment, instantiate::InstantiateEnvironment,
            },
            error::TypeCheckDiagnosticCategory,
            inference::{
                Constraint, Inference as _, PartialStructuralEdge, Variable, VariableKind,
            },
            kind::{
                Generic, OpaqueType, Param, StructType, TypeKind,
                generic::{GenericArgument, GenericArgumentId},
                infer::HoleId,
                intersection::IntersectionType,
                intrinsic::{DictType, IntrinsicType},
                primitive::PrimitiveType,
                r#struct::StructField,
                test::{
                    assert_equiv, dict, generic, intersection, opaque, primitive, r#struct,
                    struct_field, tuple, union,
                },
                tuple::TupleType,
            },
            lattice::{Lattice as _, Projection, test::assert_lattice_laws},
            test::{instantiate, instantiate_infer, instantiate_param},
        },
    };

    #[test]
    fn unnest_flattens_nested_unions() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create a union type with a nested union
        let number = primitive!(env, PrimitiveType::Number);
        let string = primitive!(env, PrimitiveType::String);
        let boolean = primitive!(env, PrimitiveType::Boolean);

        // Create a nested union: (String | Boolean)
        let nested_union = union!(env, [string, boolean]);

        // Create a union that includes the nested union: Number | (String | Boolean)
        union!(env, union_type, [number, nested_union]);

        // Unnesting should flatten to: Number | String | Boolean
        let unnested = union_type.unnest(&env);

        assert_eq!(unnested.len(), 3);
        assert!(unnested.contains(&number));
        assert!(unnested.contains(&string));
        assert!(unnested.contains(&boolean));
    }

    #[test]
    fn unnest_nested_recursive_union() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        let r#type = env.types.intern(|id| PartialType {
            span: SpanId::SYNTHETIC,
            kind: env.intern_kind(TypeKind::Union(UnionType {
                variants: env.intern_type_ids(&[env.intern_type(PartialType {
                    span: SpanId::SYNTHETIC,
                    kind: env.intern_kind(TypeKind::Union(UnionType {
                        variants: env.intern_type_ids(&[id.value()]),
                    })),
                })]),
            })),
        });

        let union = r#type.kind.union().expect("should be a union");
        let unnested = r#type.with(union).unnest(&env);

        assert_equiv!(env, unnested, [instantiate(&env, TypeKind::Unknown)]);
    }

    #[test]
    fn join_identical_unions() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        union!(
            env,
            a,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );
        union!(
            env,
            b,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );

        let mut lattice_env = LatticeEnvironment::new(&env);

        // Join identical unions should result in the same union
        assert_equiv!(
            env,
            a.join(b, &mut lattice_env),
            [
                primitive!(env, PrimitiveType::String),
                primitive!(env, PrimitiveType::Number),
            ]
        );
    }

    #[test]
    fn join_recursive_unions() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        union!(
            env,
            a,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );

        let b = env.types.intern(|id| PartialType {
            span: SpanId::SYNTHETIC,
            kind: env.intern_kind(TypeKind::Union(UnionType {
                variants: env
                    .intern_type_ids(&[id.value(), primitive!(env, PrimitiveType::Number)]),
            })),
        });

        let mut lattice_env = LatticeEnvironment::new(&env);

        assert_equiv!(
            env,
            [lattice_env.join(a.id, b.id)],
            [instantiate(&env, TypeKind::Unknown)]
        );
    }

    #[test]
    fn join_different_unions() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create different union types
        union!(
            env,
            a,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );
        union!(
            env,
            b,
            [
                primitive!(env, PrimitiveType::Boolean),
                primitive!(env, PrimitiveType::Null)
            ]
        );

        let mut lattice_env = LatticeEnvironment::new(&env);

        // Join different unions should include all variants
        assert_equiv!(
            env,
            a.join(b, &mut lattice_env),
            [
                primitive!(env, PrimitiveType::Null),
                primitive!(env, PrimitiveType::Boolean),
                primitive!(env, PrimitiveType::String),
                primitive!(env, PrimitiveType::Number),
            ]
        );
    }

    #[test]
    fn join_with_empty_union() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create an empty union (Never) and a non-empty union
        union!(env, empty, []);
        union!(
            env,
            non_empty,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String),
            ]
        );

        let mut lattice_env = LatticeEnvironment::new(&env);

        // Empty union joined with any union should be the other union
        assert_equiv!(
            env,
            empty.join(non_empty, &mut lattice_env),
            [
                primitive!(env, PrimitiveType::String),
                primitive!(env, PrimitiveType::Number),
            ]
        );

        // The reverse should also be true
        assert_equiv!(
            env,
            non_empty.join(empty, &mut lattice_env),
            [
                primitive!(env, PrimitiveType::String),
                primitive!(env, PrimitiveType::Number),
            ]
        );
    }

    #[test]
    fn join_with_overlapping_unions() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create overlapping unions
        union!(
            env,
            a,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );
        union!(
            env,
            b,
            [
                primitive!(env, PrimitiveType::String),
                primitive!(env, PrimitiveType::Boolean)
            ]
        );

        let mut lattice_env = LatticeEnvironment::new(&env);

        // Join without simplification should lead to a union with all variants
        assert_equiv!(
            env,
            a.join(b, &mut lattice_env),
            [
                primitive!(env, PrimitiveType::Boolean),
                primitive!(env, PrimitiveType::String),
                primitive!(env, PrimitiveType::Number),
            ]
        );
    }

    #[test]
    fn meet_disjoint_unions() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create disjoint unions (no common variants)
        union!(
            env,
            a,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );
        union!(
            env,
            b,
            [
                primitive!(env, PrimitiveType::Boolean),
                primitive!(env, PrimitiveType::Null)
            ]
        );

        let mut lattice_env = LatticeEnvironment::new(&env);
        lattice_env.without_simplify();

        // Should have 4 combinations: Number & Boolean, Number & Null, String & Boolean, String &
        // Null These will be represented as intersection types in the result
        // Meet should result in pairwise combinations
        assert_equiv!(
            env,
            a.meet(b, &mut lattice_env),
            [union!(
                env,
                [
                    intersection!(
                        env,
                        [
                            primitive!(env, PrimitiveType::Number),
                            primitive!(env, PrimitiveType::Boolean)
                        ]
                    ),
                    intersection!(
                        env,
                        [
                            primitive!(env, PrimitiveType::Number),
                            primitive!(env, PrimitiveType::Null)
                        ]
                    ),
                    intersection!(
                        env,
                        [
                            primitive!(env, PrimitiveType::String),
                            primitive!(env, PrimitiveType::Boolean)
                        ]
                    ),
                    intersection!(
                        env,
                        [
                            primitive!(env, PrimitiveType::String),
                            primitive!(env, PrimitiveType::Null)
                        ]
                    )
                ]
            )]
        );
    }

    #[test]
    fn meet_identical_unions() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        union!(
            env,
            a,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );
        union!(
            env,
            b,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );

        let mut lattice_env = LatticeEnvironment::new(&env);

        // Meet identical unions should result in the same union
        assert_equiv!(
            env,
            a.meet(b, &mut lattice_env),
            [union!(
                env,
                [
                    primitive!(env, PrimitiveType::Number),
                    primitive!(env, PrimitiveType::String),
                    instantiate(&env, TypeKind::Never),
                    instantiate(&env, TypeKind::Never)
                ]
            )]
        );
    }

    #[test]
    fn meet_with_empty_union() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create an empty union (Never) and a non-empty union
        union!(env, empty, []);
        union!(
            env,
            non_empty,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );

        let mut lattice_env = LatticeEnvironment::new(&env);

        // Empty union met with any union should be empty
        assert_equiv!(
            env,
            empty.meet(non_empty, &mut lattice_env),
            [union!(env, [])]
        );

        // The reverse should also be true
        assert_equiv!(
            env,
            non_empty.meet(empty, &mut lattice_env),
            [union!(env, [])]
        );
    }

    #[test]
    fn meet_subtype_supertype() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create a union with Number and another with Integer (where Integer <: Number)
        let number = primitive!(env, PrimitiveType::Number);
        let integer = primitive!(env, PrimitiveType::Integer);
        let string = primitive!(env, PrimitiveType::String);

        union!(env, number_union, [number, string]);
        union!(env, integer_union, [integer, string]);

        let mut lattice_env = LatticeEnvironment::new(&env);

        // Meet should retain the subtype in the result
        assert_equiv!(
            env,
            number_union.meet(integer_union, &mut lattice_env),
            [union!(
                env,
                [
                    integer,
                    string,
                    instantiate(&env, TypeKind::Never),
                    instantiate(&env, TypeKind::Never)
                ]
            )]
        );
    }

    #[test]
    fn is_bottom() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Empty union (Never)
        union!(env, empty, []);

        // Non-empty union
        union!(env, non_empty, [primitive!(env, PrimitiveType::Number)]);

        let mut analysis_env = AnalysisEnvironment::new(&env);

        // Empty union should be bottom (uninhabited)
        assert!(empty.is_bottom(&mut analysis_env));

        // Non-empty union should not be bottom
        assert!(!non_empty.is_bottom(&mut analysis_env));
    }

    #[test]
    fn is_top() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Regular union
        union!(
            env,
            regular,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );

        // Union containing top type (Unknown)
        let unknown = instantiate(&env, TypeKind::Unknown);
        union!(
            env,
            with_top,
            [unknown, primitive!(env, PrimitiveType::String)]
        );

        let mut analysis_env = AnalysisEnvironment::new(&env);

        // Regular union should not be top
        assert!(!regular.is_top(&mut analysis_env));

        // Union with Unknown should be considered top
        assert!(with_top.is_top(&mut analysis_env));
    }

    #[test]
    fn is_subtype_of_self() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create a union type
        union!(
            env,
            union_type,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );

        let mut analysis_env = AnalysisEnvironment::new(&env);

        // A union should be a subtype of itself (reflexivity)
        assert!(union_type.is_subtype_of(union_type, &mut analysis_env));
    }

    #[test]
    fn empty_union_is_subtype_of_all() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Empty union (Never)
        union!(env, empty, []);

        // Non-empty union
        union!(env, non_empty, [primitive!(env, PrimitiveType::Number)]);

        let mut analysis_env = AnalysisEnvironment::new(&env);

        // Empty union should be a subtype of any other union
        assert!(empty.is_subtype_of(non_empty, &mut analysis_env));
    }

    #[test]
    fn covariant_union_is_subtype() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Dict<String, Number>
        dict!(
            env,
            dict_string_number,
            primitive!(env, PrimitiveType::String),
            primitive!(env, PrimitiveType::Number)
        );

        // Dict<String, Number | String>
        dict!(
            env,
            dict_string_number_string,
            primitive!(env, PrimitiveType::String),
            union!(
                env,
                [
                    primitive!(env, PrimitiveType::Number),
                    primitive!(env, PrimitiveType::String)
                ]
            )
        );

        let mut analysis_env = AnalysisEnvironment::new(&env);

        // Dict<String, Number> <: Dict<String, Number | String>
        assert!(dict_string_number.is_subtype_of(dict_string_number_string, &mut analysis_env));
    }

    #[test]
    fn covariant_union_equivalence() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Dict<String, Number> | Dict<String, String>
        let union_dict_string_number_string = union!(
            env,
            [
                dict!(
                    env,
                    primitive!(env, PrimitiveType::String),
                    primitive!(env, PrimitiveType::Number)
                ),
                dict!(
                    env,
                    primitive!(env, PrimitiveType::String),
                    primitive!(env, PrimitiveType::String)
                )
            ]
        );

        // Dict<String, Number | String>
        let dict_string_number_string = dict!(
            env,
            primitive!(env, PrimitiveType::String),
            union!(
                env,
                [
                    primitive!(env, PrimitiveType::Number),
                    primitive!(env, PrimitiveType::String)
                ]
            )
        );

        let mut analysis_env = AnalysisEnvironment::new(&env);

        // Dict<String, Number> | Dict<String, Number> = Dict<String, Number | String>
        assert!(
            analysis_env.is_equivalent(union_dict_string_number_string, dict_string_number_string)
        );
        assert!(
            analysis_env.is_equivalent(dict_string_number_string, union_dict_string_number_string)
        );
    }

    #[test]
    fn union_equivalence_with_different_variant_counts() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Dict<String, Boolean>
        let dict_string_boolean = dict!(
            env,
            primitive!(env, PrimitiveType::String),
            primitive!(env, PrimitiveType::Boolean)
        );

        // Dict<Number, Boolean>
        let dict_number_boolean = dict!(
            env,
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::Boolean)
        );

        // Dict<Number, String>
        let dict_number_string = dict!(
            env,
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String)
        );

        // Dict<Number, Boolean | String>
        let dict_number_boolean_string = dict!(
            env,
            primitive!(env, PrimitiveType::Number),
            union!(
                env,
                [
                    primitive!(env, PrimitiveType::Boolean),
                    primitive!(env, PrimitiveType::String)
                ]
            )
        );

        // Create the two union types we want to compare:
        // Type 1: Dict<String, Boolean> | Dict<Number, Boolean | String>
        union!(
            env,
            type1,
            [dict_string_boolean, dict_number_boolean_string]
        );

        // Type 2: Dict<String, Boolean> | Dict<Number, Boolean> | Dict<Number, String>
        union!(
            env,
            type2,
            [dict_string_boolean, dict_number_boolean, dict_number_string]
        );

        let mut analysis_env = AnalysisEnvironment::new(&env);

        // These types should be equivalent despite having different variant counts
        assert!(type1.is_equivalent(type2, &mut analysis_env));
        assert!(type2.is_equivalent(type1, &mut analysis_env));
    }

    #[test]
    fn union_equivalence_non_equivalent_different_counts() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create some basic types
        let number = primitive!(env, PrimitiveType::Number);
        let string = primitive!(env, PrimitiveType::String);
        let boolean = primitive!(env, PrimitiveType::Boolean);
        let null = primitive!(env, PrimitiveType::Null);

        // Create a union with 2 variants
        union!(env, type1, [number, string]);

        // Create a union with 3 variants, adding a type not covered by type1
        union!(env, type2, [number, string, boolean]);

        // Create another union with 3 variants but equivalent to type1 + a null type
        union!(env, type3, [number, string, null]);

        let mut analysis_env = AnalysisEnvironment::new(&env);

        // These should not be equivalent (boolean is not covered by type1)
        assert!(!type1.is_equivalent(type2, &mut analysis_env));
        assert!(!type2.is_equivalent(type1, &mut analysis_env));

        // These should also not be equivalent (null is not covered by type1)
        assert!(!type1.is_equivalent(type3, &mut analysis_env));
        assert!(!type3.is_equivalent(type1, &mut analysis_env));
    }

    #[test]
    fn no_union_is_subtype_of_never() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Empty union (Never)
        union!(env, empty, []);

        // Non-empty union
        union!(env, non_empty, [primitive!(env, PrimitiveType::Number)]);

        let mut analysis_env = AnalysisEnvironment::new(&env);

        // Non-empty union should not be a subtype of empty union
        assert!(!non_empty.is_subtype_of(empty, &mut analysis_env));
    }

    #[test]
    fn subtype_supertype_relation() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create a union with Number and String
        let number = primitive!(env, PrimitiveType::Number);
        let string = primitive!(env, PrimitiveType::String);
        union!(env, number_string, [number, string]);

        // Create a union with Integer (subtype of Number) and String
        let integer = primitive!(env, PrimitiveType::Integer);
        union!(env, integer_string, [integer, string]);

        // Create a union with just Number
        union!(env, just_number, [number]);

        let mut analysis_env = AnalysisEnvironment::new(&env);

        // Integer | String should be a subtype of Number | String
        assert!(integer_string.is_subtype_of(number_string, &mut analysis_env));

        // Number | String should not be a subtype of Integer | String
        assert!(!number_string.is_subtype_of(integer_string, &mut analysis_env));

        // Number should be a subtype of Number | String
        assert!(just_number.is_subtype_of(number_string, &mut analysis_env));

        // Number | String should not be a subtype of Number
        assert!(!number_string.is_subtype_of(just_number, &mut analysis_env));
    }

    #[test]
    fn is_equivalent() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create identical unions (but at different type IDs)
        union!(
            env,
            a,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );
        union!(
            env,
            b,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );

        // Create a union with same types in different order
        union!(
            env,
            c,
            [
                primitive!(env, PrimitiveType::String),
                primitive!(env, PrimitiveType::Number)
            ]
        );

        // Create a union with different types
        union!(
            env,
            d,
            [
                primitive!(env, PrimitiveType::Boolean),
                primitive!(env, PrimitiveType::Number)
            ]
        );

        let mut analysis_env = AnalysisEnvironment::new(&env);

        // Same unions should be equivalent
        assert!(a.is_equivalent(b, &mut analysis_env));

        // Order shouldn't matter for equivalence
        assert!(a.is_equivalent(c, &mut analysis_env));

        // Different unions should not be equivalent
        assert!(!a.is_equivalent(d, &mut analysis_env));
    }

    #[test]
    fn empty_union_equivalence() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create two empty unions
        union!(env, a, []);
        union!(env, b, []);

        // Create a non-empty union
        union!(env, c, [primitive!(env, PrimitiveType::Number)]);

        let mut analysis_env = AnalysisEnvironment::new(&env);

        // Empty unions should be equivalent to each other
        assert!(a.is_equivalent(b, &mut analysis_env));

        // Empty union should not be equivalent to non-empty union
        assert!(!a.is_equivalent(c, &mut analysis_env));
    }

    #[test]
    fn simplify_identical_variants() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create a union with duplicate variants
        union!(
            env,
            union_type,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::Number)
            ]
        );

        let mut simplify_env = SimplifyEnvironment::new(&env);

        // Simplifying should collapse duplicates
        let result = union_type.simplify(&mut simplify_env);
        let result_type = env.r#type(result);

        // Result should be just Number, not a union
        assert_matches!(
            *result_type.kind,
            TypeKind::Primitive(PrimitiveType::Number)
        );
    }

    #[test]
    fn simplify_nested_unions() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create nested unions
        let nested = union!(env, [primitive!(env, PrimitiveType::Number)]);
        union!(
            env,
            union_type,
            [nested, primitive!(env, PrimitiveType::String)]
        );

        let mut simplify_env = SimplifyEnvironment::new(&env);

        // Simplifying should flatten nested unions
        assert_equiv!(
            env,
            [union_type.simplify(&mut simplify_env)],
            [union!(
                env,
                [
                    primitive!(env, PrimitiveType::Number),
                    primitive!(env, PrimitiveType::String)
                ]
            )]
        );
    }

    #[test]
    fn simplify_with_bottom() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create a union with a never type
        union!(
            env,
            union_type,
            [
                instantiate(&env, TypeKind::Never),
                primitive!(env, PrimitiveType::Number)
            ]
        );

        let mut simplify_env = SimplifyEnvironment::new(&env);

        // Simplifying should remove the Never type
        let result = union_type.simplify(&mut simplify_env);
        let result_type = env.r#type(result);

        // Result should be just Number, not a union
        assert!(matches!(
            *result_type.kind,
            TypeKind::Primitive(PrimitiveType::Number)
        ));
    }

    #[test]
    fn simplify_with_top() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create a union with a top (Unknown) type
        union!(
            env,
            union_type,
            [
                instantiate(&env, TypeKind::Unknown),
                primitive!(env, PrimitiveType::Number)
            ]
        );

        let mut simplify_env = SimplifyEnvironment::new(&env);

        // Simplifying should collapse to the top type
        let result = union_type.simplify(&mut simplify_env);
        let result_type = env.r#type(result);

        // Result should be Unknown
        assert!(matches!(*result_type.kind, TypeKind::Unknown));
    }

    #[test]
    fn simplify_empty_union() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create an empty union
        union!(env, union_type, []);

        let mut simplify_env = SimplifyEnvironment::new(&env);

        // Simplifying empty union should result in Never
        let result = union_type.simplify(&mut simplify_env);
        let result_type = env.r#type(result);

        assert!(matches!(*result_type.kind, TypeKind::Never));
    }

    #[test]
    fn simplify_with_subtypes() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create a union with a type and its subtype
        let number = primitive!(env, PrimitiveType::Number);
        let integer = primitive!(env, PrimitiveType::Integer); // Integer is a subtype of Number
        union!(env, union_type, [number, integer]);

        let mut simplify_env = SimplifyEnvironment::new(&env);

        // Simplifying should remove the subtype
        let result = union_type.simplify(&mut simplify_env);
        let result_type = env.r#type(result);

        // Result should be just Number
        assert!(matches!(
            *result_type.kind,
            TypeKind::Primitive(PrimitiveType::Number)
        ));
    }

    #[test]
    fn lattice_laws() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create three distinct union types for testing lattice laws
        let a = union!(env, [primitive!(env, PrimitiveType::Number)]);
        let b = union!(env, [primitive!(env, PrimitiveType::String)]);
        let c = union!(env, [primitive!(env, PrimitiveType::Boolean)]);

        // Test that union types satisfy lattice laws (associativity, commutativity, absorption)
        assert_lattice_laws(&env, a, b, c);
    }

    #[test]
    fn is_concrete() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);
        let mut analysis_env = AnalysisEnvironment::new(&env);

        // Concrete union (with all concrete variants)
        let number = primitive!(env, PrimitiveType::Number);
        let string = primitive!(env, PrimitiveType::String);
        union!(env, concrete_union, [number, string]);
        assert!(concrete_union.is_concrete(&mut analysis_env));

        // Non-concrete union (with at least one non-concrete variant)
        let infer_var = instantiate_infer(&env, 0_u32);
        union!(env, non_concrete_union, [number, infer_var]);
        assert!(!non_concrete_union.is_concrete(&mut analysis_env));

        // Empty union should be concrete
        union!(env, empty_union, []);
        assert!(empty_union.is_concrete(&mut analysis_env));

        // Nested non-concrete union
        union!(
            env,
            nested_union,
            [concrete_union.id, non_concrete_union.id]
        );
        assert!(!nested_union.is_concrete(&mut analysis_env));
    }

    #[test]
    fn complex_union_relationships() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create various types to use in unions
        let number = primitive!(env, PrimitiveType::Number);
        let integer = primitive!(env, PrimitiveType::Integer);
        let string = primitive!(env, PrimitiveType::String);
        let boolean = primitive!(env, PrimitiveType::Boolean);

        // Number | String
        union!(env, number_string, [number, string]);

        // Integer | String
        union!(env, integer_string, [integer, string]);

        // Number | Boolean
        union!(env, number_boolean, [number, boolean]);

        // Number | Integer
        union!(env, number_integer, [number, integer]);

        let mut analysis_env = AnalysisEnvironment::new(&env);

        // Integer | String <: Number | String (because Integer <: Number)
        assert!(integer_string.is_subtype_of(number_string, &mut analysis_env));

        // Number | String ≮: Integer | String
        assert!(!number_string.is_subtype_of(integer_string, &mut analysis_env));

        // Number | Boolean ≮: Number | String
        assert!(!number_boolean.is_subtype_of(number_string, &mut analysis_env));

        // No subtype relationship between Number | Boolean and Integer | String
        assert!(!number_boolean.is_subtype_of(integer_string, &mut analysis_env));
        assert!(!integer_string.is_subtype_of(number_boolean, &mut analysis_env));

        // Number | Integer simplifies to just Number
        let mut simplify_env = SimplifyEnvironment::new(&env);
        let simplified = number_integer.simplify(&mut simplify_env);
        let simplified_type = env.r#type(simplified);
        assert!(matches!(
            *simplified_type.kind,
            TypeKind::Primitive(PrimitiveType::Number)
        ));
    }

    #[test]
    fn union_with_tuple_types() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create tuple types
        let tuple1 = tuple!(env, [primitive!(env, PrimitiveType::Number)]);
        let tuple2 = tuple!(env, [primitive!(env, PrimitiveType::String)]);

        // Create a union of tuple types
        union!(env, union_type, [tuple1, tuple2]);

        let mut analysis_env = AnalysisEnvironment::new(&env);

        // Union operations should work with non-primitive types as well
        assert!(!union_type.is_bottom(&mut analysis_env));
        assert!(!union_type.is_top(&mut analysis_env));

        // Test subtyping with tuples in unions
        let subtype_tuple = tuple!(env, [primitive!(env, PrimitiveType::Integer)]); // (Integer) <: (Number)
        union!(env, subtype_union, [subtype_tuple, tuple2]);

        assert!(subtype_union.is_subtype_of(union_type, &mut analysis_env));
        assert!(!union_type.is_subtype_of(subtype_union, &mut analysis_env));
    }

    #[test]
    fn collect_constraints_empty_empty() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create two empty unions (Never type)
        union!(env, empty_a, []);
        union!(env, empty_b, []);

        let mut inference_env = InferenceEnvironment::new(&env);

        // Never <: Never
        empty_a.collect_constraints(empty_b, &mut inference_env);

        // No constraints should be generated for this trivial case
        let constraints = inference_env.take_constraints();
        assert!(constraints.is_empty());
    }

    #[test]
    fn collect_constraints_empty_subtype() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Empty union (Never) as subtype
        union!(env, empty, []);

        // Some concrete union as supertype
        let hole = HoleId::new(0);
        let infer = instantiate_infer(&env, hole);
        union!(env, concrete, [infer]);

        let mut inference_env = InferenceEnvironment::new(&env);

        // Never <: Number
        empty.collect_constraints(concrete, &mut inference_env);

        // No constraints should be generated as Never is subtype of everything
        let constraints = inference_env.take_constraints();
        assert!(constraints.is_empty());
    }

    #[test]
    fn collect_constraints_empty_supertype() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Some concrete union as subtype
        let hole = HoleId::new(0);
        let infer = instantiate_infer(&env, hole);
        union!(env, concrete, [infer]);

        // Empty union (Never) as supertype
        union!(env, empty, []);

        let mut inference_env = InferenceEnvironment::new(&env);

        // Number <: Never
        concrete.collect_constraints(empty, &mut inference_env);

        // Should generate constraint: Number <: Never
        let constraints = inference_env.take_constraints();
        assert_eq!(constraints.len(), 1);
        assert_matches!(
            &constraints[0],
            Constraint::UpperBound { variable: Variable { span: SpanId::SYNTHETIC, kind: VariableKind::Hole(bound_hole) }, bound } if {
                let bound_type = env.r#type(*bound).kind;
                matches!(bound_type, TypeKind::Never) && *bound_hole == hole
            }
        );
    }

    #[test]
    fn collect_constraints_inference_variable_subtype() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create an inference variable
        let hole = HoleId::new(0);
        let infer_var = instantiate_infer(&env, hole);

        // Union with inference variable as subtype
        union!(env, infer_union, [infer_var]);

        // Concrete union as supertype
        let number = primitive!(env, PrimitiveType::Number);
        let string = primitive!(env, PrimitiveType::String);
        union!(env, concrete_union, [number, string]);

        let mut inference_env = InferenceEnvironment::new(&env);

        // ?T <: (Number | String)
        infer_union.collect_constraints(concrete_union, &mut inference_env);

        // Should generate an upper bound constraint
        let constraints = inference_env.take_constraints();
        assert_eq!(constraints.len(), 1);
        assert_matches!(
            &constraints[0],
            Constraint::UpperBound {
                variable: Variable {span: SpanId::SYNTHETIC, kind: VariableKind::Hole(h)},
                bound
            } if *h == hole && *bound == concrete_union.id
        );
    }

    #[test]
    fn collect_constraints_inference_variable_supertype() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create an inference variable
        let hole = HoleId::new(0);
        let infer_var = instantiate_infer(&env, hole);

        // Concrete union as subtype
        let number = primitive!(env, PrimitiveType::Number);
        union!(env, concrete_union, [number]);

        // Union with inference variable as supertype
        union!(env, infer_union, [infer_var]);

        let mut inference_env = InferenceEnvironment::new(&env);

        // Number <: ?T
        concrete_union.collect_constraints(infer_union, &mut inference_env);

        // Should generate a constraint for Number <: ?T
        let constraints = inference_env.take_constraints();
        assert_eq!(constraints.len(), 1);
        assert_matches!(
            &constraints[0],
            Constraint::LowerBound {
                variable: Variable {span: SpanId::SYNTHETIC, kind: VariableKind::Hole(h)},
                bound
            } if *h == hole && *bound == number
        );
    }

    #[test]
    fn collect_constraints_multiple_variants_subtype() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create inference variables
        let hole_a = HoleId::new(0);
        let infer_a = instantiate_infer(&env, hole_a);
        let hole_b = HoleId::new(1);
        let infer_b = instantiate_infer(&env, hole_b);

        // Create concrete type
        let number = primitive!(env, PrimitiveType::Number);

        // Create union with multiple inference variables
        union!(env, infer_union, [infer_a, infer_b]);

        // Create single-variant union
        union!(env, concrete_union, [number]);

        let mut inference_env = InferenceEnvironment::new(&env);

        // (?T0 | ?T1) <: Number
        infer_union.collect_constraints(concrete_union, &mut inference_env);

        // Both variables should have an upper bound of Number
        let constraints = inference_env.take_constraints();
        assert_eq!(constraints.len(), 2);

        let constraints_contain = |expected, bound| {
            constraints.iter().any(|c| matches!(
                    c,
                    Constraint::UpperBound { variable, bound: b } if *variable == expected && *b == bound
                ))
        };

        assert!(constraints_contain(
            Variable::synthetic(VariableKind::Hole(hole_a)),
            number
        ));
        assert!(constraints_contain(
            Variable::synthetic(VariableKind::Hole(hole_b)),
            number
        ));
    }

    #[test]
    fn collect_constraints_multiple_variants_supertype() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create inference variable
        let hole = HoleId::new(0);
        let infer_var = instantiate_infer(&env, hole);

        // Create single-variant union with inference variable
        union!(env, infer_union, [infer_var]);

        // Create concrete union with multiple variants
        let number = primitive!(env, PrimitiveType::Number);
        let string = primitive!(env, PrimitiveType::String);
        union!(env, concrete_union, [number, string]);

        let mut inference_env = InferenceEnvironment::new(&env);

        // ?T <: (Number | String)
        infer_union.collect_constraints(concrete_union, &mut inference_env);

        // Should generate a constraint ?T <: (Number | String)
        let constraints = inference_env.take_constraints();
        assert_eq!(constraints.len(), 1);
        assert_matches!(
            &constraints[0],
            Constraint::UpperBound {
                variable: Variable { span: SpanId::SYNTHETIC, kind: VariableKind::Hole(h) },
                bound
            } if *h == hole && *bound == concrete_union.id
        );
    }

    #[test]
    fn collect_constraints_nested_union() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create inference variable
        let hole = HoleId::new(0);
        let infer_var = instantiate_infer(&env, hole);

        // Create a nested union with inference variable
        let inner_infer = union!(env, [infer_var]);
        union!(env, nested_infer, [inner_infer]);

        // Create a concrete nested union
        let number = primitive!(env, PrimitiveType::Number);
        let inner_concrete = union!(env, [number]);
        union!(env, nested_concrete, [inner_concrete]);

        let mut inference_env = InferenceEnvironment::new(&env);

        // The nested union should unnest during constraint collection
        nested_infer.collect_constraints(nested_concrete, &mut inference_env);

        // Should generate constraint between infer_var and number
        let constraints = inference_env.take_constraints();
        assert_eq!(constraints.len(), 1);
        assert_matches!(
            &constraints[0],
            Constraint::UpperBound {
                variable: Variable { span: SpanId::SYNTHETIC, kind: VariableKind::Hole(h) },
                bound
            } if *h == hole && *bound == number
        );
    }

    #[test]
    fn collect_constraints_generic_params() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Set up generic arguments
        let arg1 = GenericArgumentId::new(0);
        let arg2 = GenericArgumentId::new(1);

        // Create generic parameter types
        let param1 = instantiate_param(&env, arg1);
        let param2 = instantiate_param(&env, arg2);

        // Create unions with generic parameters
        union!(env, generic_a, [param1]);
        union!(env, generic_b, [param2]);

        let mut inference_env = InferenceEnvironment::new(&env);

        // Collect constraints between generic unions
        generic_a.collect_constraints(generic_b, &mut inference_env);

        // Should generate an ordering constraint
        let constraints = inference_env.take_constraints();
        assert_eq!(constraints.len(), 1);
        assert_matches!(
            &constraints[0],
            Constraint::Ordering {
                lower: Variable { span: SpanId::SYNTHETIC, kind: VariableKind::Generic(l) },
                upper: Variable { span: SpanId::SYNTHETIC, kind: VariableKind::Generic(u) },
            } if *l == arg1 && *u == arg2
        );
    }

    #[test]
    fn collect_constraints_concrete_types_only() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create concrete types
        let number = primitive!(env, PrimitiveType::Number);
        let integer = primitive!(env, PrimitiveType::Integer);

        // Create unions with only concrete types
        union!(env, concrete_a, [integer]);
        union!(env, concrete_b, [number]);

        let mut inference_env = InferenceEnvironment::new(&env);

        // Collect constraints between concrete unions
        concrete_a.collect_constraints(concrete_b, &mut inference_env);

        // No variable constraints should be generated for concrete types
        assert!(inference_env.take_constraints().is_empty());
    }

    #[test]
    fn collect_constraints_mixed_variants() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create concrete type and inference variable
        let number = primitive!(env, PrimitiveType::Number);
        let hole = HoleId::new(0);
        let infer_var = instantiate_infer(&env, hole);

        // Create a union with mixed concrete and inference vars
        union!(env, mixed_union, [number, infer_var]);

        // Create concrete union as supertype
        let string = primitive!(env, PrimitiveType::String);
        let boolean = primitive!(env, PrimitiveType::Boolean);
        union!(env, concrete_union, [string, boolean]);

        let mut inference_env = InferenceEnvironment::new(&env);

        // (Number | ?T) <: (String | Boolean)
        mixed_union.collect_constraints(concrete_union, &mut inference_env);

        // Should generate constraints for both Number and ?T
        let constraints = inference_env.take_constraints();
        assert_eq!(constraints.len(), 1);

        // The ?T should get constrained to (String | Boolean)
        assert!(constraints.iter().any(|c| matches!(
            c,
            Constraint::UpperBound {
                variable: Variable { span: SpanId::SYNTHETIC, kind: VariableKind::Hole(h) },
                bound
            } if *h == hole && *bound == concrete_union.id
        )));
    }

    #[test]
    fn collect_constraints_with_intersection() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create an inference variable
        let hole = HoleId::new(0);
        let infer_var = instantiate_infer(&env, hole);

        // Create a union with an inference var
        union!(env, union_with_infer, [infer_var]);

        // Create an intersection of concrete types as supertype
        let number = primitive!(env, PrimitiveType::Number);
        let string = primitive!(env, PrimitiveType::String);
        let intersection_type = intersection!(env, [number, string]);
        union!(env, union_with_intersection, [intersection_type]);

        let mut inference_env = InferenceEnvironment::new(&env);

        // ?T <: (Number & String)
        union_with_infer.collect_constraints(union_with_intersection, &mut inference_env);

        // Should generate a constraint from the inference var to the intersection
        let constraints = inference_env.take_constraints();
        assert_eq!(constraints.len(), 1);
        assert_matches!(
            &constraints[0],
            Constraint::UpperBound {
                variable: Variable { span: SpanId::SYNTHETIC, kind: VariableKind::Hole(h) },
                bound
            } if *h == hole && *bound == intersection_type
        );
    }

    #[test]
    fn collect_structural_edges_union_target() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create inference variables for union variants
        let hole1 = HoleId::new(0);
        let infer_var1 = instantiate_infer(&env, hole1);
        let hole2 = HoleId::new(1);
        let infer_var2 = instantiate_infer(&env, hole2);

        // Create a union with inference variables: _0 | _1
        union!(env, union_type, [infer_var1, infer_var2]);

        let mut inference_env = InferenceEnvironment::new(&env);

        // Create a variable to use as the target in a structural edge
        // This puts the union on the LEFT side of the edge
        let edge_var = Variable::synthetic(VariableKind::Hole(HoleId::new(2)));
        let partial_edge = PartialStructuralEdge::Target(edge_var);

        // Collect structural edges
        union_type.collect_structural_edges(partial_edge, &mut inference_env);

        // When union is on the left side (target), both variants should flow to the target
        // We expect: _0 -> _2 and _1 -> _2
        let constraints = inference_env.take_constraints();
        assert_eq!(
            constraints,
            [
                Constraint::StructuralEdge {
                    source: Variable::synthetic(VariableKind::Hole(hole1)),
                    target: edge_var,
                },
                Constraint::StructuralEdge {
                    source: Variable::synthetic(VariableKind::Hole(hole2)),
                    target: edge_var,
                }
            ]
        );
    }

    #[test]
    fn collect_structural_edges_union_source() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create inference variables for union variants
        let hole1 = HoleId::new(0);
        let infer_var1 = instantiate_infer(&env, hole1);
        let hole2 = HoleId::new(1);
        let infer_var2 = instantiate_infer(&env, hole2);

        // Create a union with inference variables: _0 | _1
        union!(env, union_type, [infer_var1, infer_var2]);

        let mut inference_env = InferenceEnvironment::new(&env);

        // Create a variable to use as the source in a structural edge
        // This puts the union on the RIGHT side of the edge
        let edge_var = Variable::synthetic(VariableKind::Hole(HoleId::new(2)));
        let partial_edge = PartialStructuralEdge::Source(edge_var);

        // Collect structural edges
        union_type.collect_structural_edges(partial_edge, &mut inference_env);

        // When union is on the right side (source), no edges should be collected
        // This is because a union on the right side would create an "or" constraint
        // which isn't well-defined for structural edges
        let constraints = inference_env.take_constraints();
        assert!(
            constraints.is_empty(),
            "No structural edges should be collected when union is on right side"
        );
    }

    #[test]
    fn collect_structural_edges_union_mixed_variants() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create one inference variable and one concrete type
        let hole = HoleId::new(0);
        let infer_var = instantiate_infer(&env, hole);
        let number = primitive!(env, PrimitiveType::Number);

        // Create a union with mixed types: _0 | Number
        union!(env, union_type, [infer_var, number]);

        let mut inference_env = InferenceEnvironment::new(&env);

        // Create a variable to use as the target in a structural edge
        let edge_var = Variable::synthetic(VariableKind::Hole(HoleId::new(1)));
        let partial_edge = PartialStructuralEdge::Target(edge_var);

        // Collect structural edges
        union_type.collect_structural_edges(partial_edge, &mut inference_env);

        // Only the inference variable should produce a structural edge
        // We expect: _0 -> _1
        let constraints = inference_env.take_constraints();
        assert_eq!(
            constraints,
            [Constraint::StructuralEdge {
                source: Variable::synthetic(VariableKind::Hole(hole)),
                target: edge_var,
            }]
        );
    }

    #[test]
    fn collect_structural_edges_union_contravariant_context() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create inference variables for union variants
        let hole1 = HoleId::new(0);
        let infer_var1 = instantiate_infer(&env, hole1);
        let hole2 = HoleId::new(1);
        let infer_var2 = instantiate_infer(&env, hole2);

        // Create a union with inference variables: _0 | _1
        union!(env, union_type, [infer_var1, infer_var2]);

        let mut inference_env = InferenceEnvironment::new(&env);

        // Create a variable to use as the target in a structural edge
        let edge_var = Variable::synthetic(VariableKind::Hole(HoleId::new(2)));
        let partial_edge = PartialStructuralEdge::Target(edge_var);

        // Collect structural edges in a contravariant context
        inference_env.in_contravariant(|env| {
            union_type.collect_structural_edges(partial_edge, env);
        });

        // In a contravariant context with union as target (left side),
        // the flow direction is inverted but still allowed
        // We expect: _2 -> _0 and _2 -> _1
        let constraints = inference_env.take_constraints();
        assert_eq!(
            constraints,
            [
                Constraint::StructuralEdge {
                    source: edge_var,
                    target: Variable::synthetic(VariableKind::Hole(hole1)),
                },
                Constraint::StructuralEdge {
                    source: edge_var,
                    target: Variable::synthetic(VariableKind::Hole(hole2)),
                }
            ]
        );
    }

    #[test]
    fn collect_structural_edges_nested_union() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create an inference variable
        let hole = HoleId::new(0);
        let infer_var = instantiate_infer(&env, hole);

        // Create a nested union: (_0 | String) | Number
        let inner_union = union!(env, [infer_var, primitive!(env, PrimitiveType::String)]);
        union!(
            env,
            nested_union,
            [inner_union, primitive!(env, PrimitiveType::Number)]
        );

        let mut inference_env = InferenceEnvironment::new(&env);

        // Create a variable to use as the target in a structural edge
        let edge_var = Variable::synthetic(VariableKind::Hole(HoleId::new(1)));
        let partial_edge = PartialStructuralEdge::Target(edge_var);

        // Collect structural edges
        nested_union.collect_structural_edges(partial_edge, &mut inference_env);

        // Only the inference variable should produce a structural edge
        // Nested unions should be traversed normally
        // We expect: _0 -> _1
        let constraints = inference_env.take_constraints();
        assert_eq!(
            constraints,
            [Constraint::StructuralEdge {
                source: Variable::synthetic(VariableKind::Hole(hole)),
                target: edge_var,
            }]
        );
    }

    #[test]
    fn collect_structural_edges_empty_union() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create an empty union: Never
        union!(env, empty_union, []);

        let mut inference_env = InferenceEnvironment::new(&env);

        // Create variables for both source and target edges
        let edge_var = Variable::synthetic(VariableKind::Hole(HoleId::new(0)));
        let source_edge = PartialStructuralEdge::Source(edge_var);
        let target_edge = PartialStructuralEdge::Target(edge_var);

        // Collect structural edges with empty union as source (right side)
        empty_union.collect_structural_edges(source_edge, &mut inference_env);

        // Empty union as source should collect no edges
        let constraints = inference_env.take_constraints();
        assert!(
            constraints.is_empty(),
            "Empty union as source should collect no edges"
        );

        // Collect structural edges with empty union as target (left side)
        empty_union.collect_structural_edges(target_edge, &mut inference_env);

        // Empty union as target should also collect no edges (no variants to iterate)
        let constraints = inference_env.take_constraints();
        assert!(
            constraints.is_empty(),
            "Empty union as target should collect no edges"
        );
    }

    #[test]
    fn simplify_recursive_union() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        let r#type = env.types.intern(|id| PartialType {
            span: SpanId::SYNTHETIC,
            kind: env.intern_kind(TypeKind::Union(UnionType {
                variants: env.intern_type_ids(&[id.value()]),
            })),
        });

        let mut simplify = SimplifyEnvironment::new(&env);
        let type_id = simplify.simplify(r#type.id);

        let r#type = env.r#type(type_id);

        assert_matches!(r#type.kind, TypeKind::Unknown);
    }

    #[test]
    fn simplify_recursive_union_multiple_elements() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        let r#type = env.types.intern(|id| PartialType {
            span: SpanId::SYNTHETIC,
            kind: env.intern_kind(TypeKind::Union(UnionType {
                variants: env
                    .intern_type_ids(&[id.value(), primitive!(env, PrimitiveType::Number)]),
            })),
        });

        let mut simplify = SimplifyEnvironment::new(&env);
        let type_id = simplify.simplify(r#type.id);

        let r#type = env.r#type(type_id);

        assert_matches!(r#type.kind, TypeKind::Unknown);
    }

    #[test]
    fn instantiate_union() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        let argument1 = env.counter.generic_argument.next();
        let argument2 = env.counter.generic_argument.next();

        let param1 = instantiate_param(&env, argument1);
        let param2 = instantiate_param(&env, argument2);

        let a = generic!(
            env,
            opaque!(env, "A", param1),
            [GenericArgument {
                id: argument1,
                name: heap.intern_symbol("T"),
                constraint: None
            }]
        );
        let b = generic!(
            env,
            opaque!(env, "A", param2),
            [GenericArgument {
                id: argument2,
                name: heap.intern_symbol("T"),
                constraint: None
            }]
        );

        union!(env, value, [a, b]);

        let mut instantiate = InstantiateEnvironment::new(&env);
        let type_id = value.instantiate(&mut instantiate);
        assert!(instantiate.take_diagnostics().is_empty());

        let result = env.r#type(type_id);
        let union = result.kind.union().expect("should be a union");
        assert_eq!(union.variants.len(), 2);

        let generic_arguments = [argument1, argument2];

        for (index, &variant) in union.variants.iter().enumerate() {
            let variant = env.r#type(variant);
            let generic = variant.kind.generic().expect("should be a generic type");

            let opaque = env
                .r#type(generic.base)
                .kind
                .opaque()
                .expect("should be an opaque type");
            let repr = env
                .r#type(opaque.repr)
                .kind
                .param()
                .expect("should be a param");

            assert_eq!(generic.arguments.len(), 1);
            assert_eq!(
                *repr,
                Param {
                    argument: generic.arguments[0].id
                }
            );
            assert_ne!(repr.argument, generic_arguments[index]);
        }
    }

    #[test]
    fn projection_empty() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        let union = union!(env, []);

        let mut lattice = LatticeEnvironment::new(&env);
        let projection = lattice.projection(union, Ident::synthetic(heap.intern_symbol("foo")));
        assert_eq!(projection, Projection::Error);

        let diagnostics = lattice.take_diagnostics().into_vec();
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(
            diagnostics[0].category,
            TypeCheckDiagnosticCategory::UnsupportedProjection
        );
    }

    #[test]
    fn projection_single_variant() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        let string = primitive!(env, PrimitiveType::String);

        let union = union!(env, [r#struct!(env, [struct_field!(env, "foo", string)])]);

        let mut lattice = LatticeEnvironment::new(&env);
        let projection = lattice.projection(union, Ident::synthetic(heap.intern_symbol("foo")));
        assert_eq!(lattice.diagnostics.len(), 0);

        assert_eq!(projection, Projection::Resolved(string));
    }

    #[test]
    fn projection_propagate_error() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        let string = primitive!(env, PrimitiveType::String);
        let integer = primitive!(env, PrimitiveType::Integer);

        let union = union!(env, [integer, string]);

        let mut lattice = LatticeEnvironment::new(&env);
        let projection = lattice.projection(union, Ident::synthetic(heap.intern_symbol("foo")));
        assert_eq!(lattice.diagnostics.len(), 2);
        assert_eq!(projection, Projection::Error);
    }

    #[test]
    fn projection_propagate_pending() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        let string = primitive!(env, PrimitiveType::String);
        let hole = env.counter.hole.next();

        let union = union!(env, [instantiate_infer(&env, hole), string]);

        let mut lattice = LatticeEnvironment::new(&env);
        let projection = lattice.projection(union, Ident::synthetic(heap.intern_symbol("foo")));
        assert_eq!(lattice.diagnostics.len(), 0);
        assert_eq!(projection, Projection::Pending);
    }

    #[test]
    fn projection_union_values() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        let string = primitive!(env, PrimitiveType::String);
        let integer = primitive!(env, PrimitiveType::Integer);

        let union = union!(
            env,
            [
                r#struct!(env, [struct_field!(env, "foo", integer)]),
                r#struct!(env, [struct_field!(env, "foo", string)])
            ]
        );

        let mut lattice = LatticeEnvironment::new(&env);
        let projection = lattice.projection(union, Ident::synthetic(heap.intern_symbol("foo")));
        assert_eq!(lattice.diagnostics.len(), 0);
        let Projection::Resolved(id) = projection else {
            panic!("expected resolved projection")
        };

        assert_equiv!(env, [id], [union!(env, [integer, string])]);
    }
}
