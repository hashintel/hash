use core::ops::ControlFlow;

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
        error::{cannot_be_supertype_of_unknown, intersection_variant_mismatch, type_mismatch},
        inference::Inference,
        lattice::{Lattice, Projection},
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

        SmallVec::from_slice(&[id])
    }

    pub(crate) fn meet_variants(
        lhs_span: SpanId,
        lhs_variants: &[TypeId],
        rhs_variants: &[TypeId],
        env: &LatticeEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 4> {
        // 1) Top ∧ Top = Top
        if lhs_variants.is_empty() && rhs_variants.is_empty() {
            return SmallVec::from_slice(&[env.intern_type(PartialType {
                span: lhs_span,
                kind: env.intern_kind(TypeKind::Unknown),
            })]);
        }

        // 2) Top ∧ X = X
        if lhs_variants.is_empty() {
            return SmallVec::from_slice(rhs_variants);
        }

        // 3) X ∧ Top = X
        if rhs_variants.is_empty() {
            return SmallVec::from_slice(lhs_variants);
        }

        let mut variants =
            TypeIdSet::with_capacity(env.environment, lhs_variants.len() + rhs_variants.len());
        variants.extend_from_slice(lhs_variants);
        variants.extend_from_slice(rhs_variants);

        variants.finish()
    }

    pub(crate) fn is_subtype_of_variants<T, U>(
        actual: Type<'heap, T>,
        expected: Type<'heap, U>,
        self_variants: &[TypeId],
        supertype_variants: &[TypeId],
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> bool
    where
        T: PrettyPrint<'heap>,
        U: PrettyPrint<'heap>,
    {
        // Empty intersection (corresponds to the Unknown/top type) is a supertype of everything
        if supertype_variants.is_empty() {
            return true;
        }

        // If the subtype is empty (Unknown), only the top type can be a supertype
        if self_variants.is_empty() {
            // We always fail-fast here
            let _: ControlFlow<()> =
                env.record_diagnostic(|env| cannot_be_supertype_of_unknown(env, actual));

            return false;
        }

        let mut compatible = true;

        for &self_variant in self_variants {
            let found = supertype_variants.iter().all(|&super_variant| {
                env.in_covariant(|env| env.is_subtype_of(self_variant, super_variant))
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
                    env.in_covariant(|env| env.collect_constraints(this, super_variant));
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
                    env.in_covariant(|env| env.collect_constraints(self_variant, supertype));
                }
            }
            (_, _) => {
                for &self_variant in self_variants {
                    for &super_variant in super_variants {
                        env.in_covariant(|env| {
                            env.collect_constraints(self_variant, super_variant);
                        });
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
                    kind: env.intern_kind(TypeKind::Intersection(IntersectionType {
                        variants: env.intern_type_ids(variants),
                    })),
                });

                Projection::Resolved(id)
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
        SmallVec::from_slice(&[self.id])
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
        variants.retain(|&mut variant| !env.is_top(variant));

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
        variants.retain(|&mut supertype| {
            // keep `supertype` only if it is not a supertype of any other variant
            !backup
                .iter()
                .any(|&subtype| subtype != supertype && env.is_subtype_of(subtype, supertype))
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

    fn collect_structural_edges(
        self: Type<'heap, Self>,
        variable: crate::r#type::inference::PartialStructuralEdge,
        env: &mut InferenceEnvironment<'_, 'heap>,
    ) {
        for &variant in self.kind.variants {
            env.in_covariant(|env| env.collect_structural_edges(variant, variable));
        }
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

impl<'heap> PrettyPrint<'heap> for IntersectionType<'heap> {
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
                    .append(RcDoc::text("&"))
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

    use core::assert_matches::assert_matches;

    use super::IntersectionType;
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
                intrinsic::{DictType, IntrinsicType},
                primitive::PrimitiveType,
                r#struct::StructField,
                test::{
                    assert_equiv, assert_sorted_eq, dict, generic, intersection, opaque, primitive,
                    r#struct, struct_field, tuple, union,
                },
                tuple::TupleType,
                union::UnionType,
            },
            lattice::{Lattice as _, Projection, test::assert_lattice_laws},
            test::{instantiate, instantiate_infer, instantiate_param},
        },
    };

    #[test]
    fn unnest_flattens_nested_intersections() {
        let heap = Heap::new();
        let env = Environment::new_empty(SpanId::SYNTHETIC, &heap);

        // Create an intersection type with a nested intersection
        let number = primitive!(env, PrimitiveType::Number);
        let string = primitive!(env, PrimitiveType::String);
        let boolean = primitive!(env, PrimitiveType::Boolean);

        // Create a nested intersection: (String & Boolean)
        let nested_intersection = intersection!(env, [string, boolean]);

        // Create an intersection that includes the nested intersection: Number & (String & Boolean)
        intersection!(env, intersection_type, [number, nested_intersection]);

        // Unnesting should flatten to: Number & String & Boolean
        let unnested = intersection_type.unnest(&env);

        assert_eq!(unnested, [boolean, string, number]);
    }

    #[test]
    fn unnest_nested_recursive_intersection() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        let r#type = env.types.intern(|id| PartialType {
            span: SpanId::SYNTHETIC,
            kind: env.intern_kind(TypeKind::Intersection(IntersectionType {
                variants: env.intern_type_ids(&[env.intern_type(PartialType {
                    span: SpanId::SYNTHETIC,
                    kind: env.intern_kind(TypeKind::Intersection(IntersectionType {
                        variants: env.intern_type_ids(&[id.value()]),
                    })),
                })]),
            })),
        });

        let intersection = r#type
            .kind
            .intersection()
            .expect("should be an intersection");
        let unnested = r#type.with(intersection).unnest(&env);

        assert_equiv!(env, unnested, []);
    }

    #[test]
    fn join_identical_intersections() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        intersection!(
            env,
            a,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );
        intersection!(
            env,
            b,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );

        let mut lattice_env = LatticeEnvironment::new(&env);

        // Join identical intersections should result in the same intersection
        assert_equiv!(
            env,
            a.join(b, &mut lattice_env),
            [intersection!(
                env,
                [
                    primitive!(env, PrimitiveType::Number),
                    primitive!(env, PrimitiveType::String),
                    union!(
                        env,
                        [
                            primitive!(env, PrimitiveType::Number),
                            primitive!(env, PrimitiveType::String)
                        ]
                    ),
                    union!(
                        env,
                        [
                            primitive!(env, PrimitiveType::Number),
                            primitive!(env, PrimitiveType::String)
                        ]
                    ),
                ]
            )]
        );
    }

    #[test]
    fn join_different_intersections() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create different intersection types
        intersection!(
            env,
            a,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );
        intersection!(
            env,
            b,
            [
                primitive!(env, PrimitiveType::Boolean),
                primitive!(env, PrimitiveType::Null)
            ]
        );

        let mut lattice_env = LatticeEnvironment::new(&env);
        lattice_env.without_simplify();

        // Join different intersections should create distributing cross-products
        // (A & B) ∨ (C & D) = (A ∨ C) & (A ∨ D) & (B ∨ C) & (B ∨ D)
        assert_equiv!(
            env,
            a.join(b, &mut lattice_env),
            [intersection!(
                env,
                [
                    union!(
                        env,
                        [
                            primitive!(env, PrimitiveType::Number),
                            primitive!(env, PrimitiveType::Boolean)
                        ]
                    ),
                    union!(
                        env,
                        [
                            primitive!(env, PrimitiveType::Number),
                            primitive!(env, PrimitiveType::Null)
                        ]
                    ),
                    union!(
                        env,
                        [
                            primitive!(env, PrimitiveType::String),
                            primitive!(env, PrimitiveType::Boolean)
                        ]
                    ),
                    union!(
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
    fn join_with_empty_intersection() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create an empty intersection (Unknown) and a non-empty intersection
        intersection!(env, empty, []);
        intersection!(
            env,
            non_empty,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String),
            ]
        );

        let mut lattice_env = LatticeEnvironment::new(&env);

        // Empty intersection (Unknown) joined with any intersection should be the other
        // intersection
        assert_equiv!(env, empty.join(non_empty, &mut lattice_env), [non_empty.id]);

        // The reverse should also be true
        assert_equiv!(env, non_empty.join(empty, &mut lattice_env), [non_empty.id]);
    }

    #[test]
    fn meet_recursive_intersection() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        intersection!(env, a, [primitive!(env, PrimitiveType::Number)]);

        let b = env.types.intern(|id| PartialType {
            span: SpanId::SYNTHETIC,
            kind: env.intern_kind(TypeKind::Intersection(IntersectionType {
                variants: env
                    .intern_type_ids(&[id.value(), primitive!(env, PrimitiveType::Integer)]),
            })),
        });

        let mut lattice_env = LatticeEnvironment::new(&env);
        assert_equiv!(
            env,
            [lattice_env.meet(a.id, b.id)],
            [primitive!(env, PrimitiveType::Integer)]
        );
    }

    #[test]
    fn meet_identical_intersections() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        intersection!(
            env,
            a,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );
        intersection!(
            env,
            b,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );

        let mut lattice_env = LatticeEnvironment::new(&env);

        // Meet identical intersections should result in the same intersection
        assert_equiv!(
            env,
            a.meet(b, &mut lattice_env),
            [
                primitive!(env, PrimitiveType::String),
                primitive!(env, PrimitiveType::Number),
            ]
        );
    }

    #[test]
    fn meet_different_intersections() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create different intersection types
        intersection!(
            env,
            a,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );
        intersection!(
            env,
            b,
            [
                primitive!(env, PrimitiveType::Boolean),
                primitive!(env, PrimitiveType::Null)
            ]
        );

        let mut lattice_env = LatticeEnvironment::new(&env);

        // Meet should combine all variants
        assert_equiv!(
            env,
            a.meet(b, &mut lattice_env),
            [
                primitive!(env, PrimitiveType::Null),
                primitive!(env, PrimitiveType::Boolean),
                primitive!(env, PrimitiveType::String),
                primitive!(env, PrimitiveType::Number),
            ]
        );
    }

    #[test]
    fn meet_with_empty_intersection() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create an empty intersection (Unknown/top type) and a non-empty intersection
        intersection!(env, empty, []);
        intersection!(
            env,
            non_empty,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );

        let mut lattice_env = LatticeEnvironment::new(&env);

        // Empty intersection (Unknown) met with any intersection should be that intersection
        assert_equiv!(
            env,
            empty.meet(non_empty, &mut lattice_env),
            [
                primitive!(env, PrimitiveType::String),
                primitive!(env, PrimitiveType::Number),
            ]
        );

        // The reverse should also be true
        assert_equiv!(
            env,
            non_empty.meet(empty, &mut lattice_env),
            [
                primitive!(env, PrimitiveType::String),
                primitive!(env, PrimitiveType::Number),
            ]
        );
    }

    #[test]
    fn meet_empty_empty_intersection() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        intersection!(env, a, []);
        intersection!(env, b, []);

        let mut lattice_env = LatticeEnvironment::new(&env);

        assert_equiv!(
            env,
            a.meet(b, &mut lattice_env),
            [instantiate(&env, TypeKind::Unknown)]
        );
    }

    #[test]
    fn is_bottom() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Intersection with Never type
        let never = instantiate(&env, TypeKind::Never);
        intersection!(
            env,
            with_never,
            [never, primitive!(env, PrimitiveType::Number)]
        );

        // Regular intersection
        intersection!(env, regular, [primitive!(env, PrimitiveType::Number)]);

        let mut analysis_env = AnalysisEnvironment::new(&env);

        // Intersection with Never should be bottom
        assert!(with_never.is_bottom(&mut analysis_env));

        // Regular intersection should not be bottom
        assert!(!regular.is_bottom(&mut analysis_env));
    }

    #[test]
    fn is_top() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Empty intersection (Unknown)
        intersection!(env, empty, []);

        // Regular intersection
        intersection!(env, regular, [primitive!(env, PrimitiveType::Number)]);

        let mut analysis_env = AnalysisEnvironment::new(&env);

        // Empty intersection should be top
        assert!(empty.is_top(&mut analysis_env));

        // Regular intersection should not be top
        assert!(!regular.is_top(&mut analysis_env));
    }

    #[test]
    fn is_subtype_of_self() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create an intersection type
        intersection!(
            env,
            a,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );

        intersection!(
            env,
            b,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );

        let mut analysis_env = AnalysisEnvironment::new(&env);

        // An intersection should be a subtype of itself (reflexivity)
        //
        // This might seem counterintuitive at first, but it's necessary for correctness, consider
        // the distribution laws:
        // (Integer & String) <: (Integer & String)
        //   <=> Integer <: (Integer & String) ∧ String <: (Integer & String)
        //   <=> (Integer <: Integer ∧ Integer <: String) ∧ (String <: Integer ∧ String <: String)
        //   <=> (true ∧ false) ∧ (false ∧ true)
        //   <=> false ∧ false
        //   <=> false
        assert!(!a.is_subtype_of(b, &mut analysis_env));

        // ... as `Integer & String` is equivalent to `Never`, the `TypeKind` implementation should
        // short-circuit to never
        assert!(analysis_env.is_subtype_of(a.id, b.id));
    }

    #[test]
    fn subtype_supertype_relation() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create intersections for testing subtype relationships
        let number = primitive!(env, PrimitiveType::Number);
        let integer = primitive!(env, PrimitiveType::Integer); // Integer is a subtype of Number
        let string = primitive!(env, PrimitiveType::String);

        // Number & String
        intersection!(env, number_string, [number, string]);

        // Number
        intersection!(env, just_number, [number]);

        // Number & Integer
        intersection!(env, number_integer, [number, integer]);

        let mut analysis_env = AnalysisEnvironment::new(&env);

        // Number & String <: Number
        // see is_subtype_of_self for an in-depth explanation
        assert!(!number_string.is_subtype_of(just_number, &mut analysis_env));
        assert!(analysis_env.is_subtype_of(number_string.id, just_number.id));

        // Number ≮: Number & String
        assert!(!just_number.is_subtype_of(number_string, &mut analysis_env));

        // Number & Integer <: Number
        assert!(number_integer.is_subtype_of(just_number, &mut analysis_env));
        assert!(analysis_env.is_subtype_of(number_integer.id, just_number.id));
    }

    #[test]
    fn empty_intersection_is_supertype_of_all() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Empty intersection (Unknown/top type)
        intersection!(env, empty, []);

        // Non-empty intersection
        intersection!(env, non_empty, [primitive!(env, PrimitiveType::Number)]);

        let mut analysis_env = AnalysisEnvironment::new(&env);

        // Any intersection should be a subtype of the empty intersection (Unknown)
        assert!(non_empty.is_subtype_of(empty, &mut analysis_env));

        // The inverse should not be true
        assert!(!empty.is_subtype_of(non_empty, &mut analysis_env));
    }

    #[test]
    fn is_equivalent() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create identical intersections (but at different type IDs)
        intersection!(
            env,
            a,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );
        intersection!(
            env,
            b,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );

        // Create an intersection with same types in different order
        intersection!(
            env,
            c,
            [
                primitive!(env, PrimitiveType::String),
                primitive!(env, PrimitiveType::Number)
            ]
        );

        // Create an intersection with different types
        intersection!(
            env,
            d,
            [
                primitive!(env, PrimitiveType::Boolean),
                primitive!(env, PrimitiveType::Number)
            ]
        );

        let mut analysis_env = AnalysisEnvironment::new(&env);

        // Same intersections should be equivalent
        assert!(a.is_equivalent(b, &mut analysis_env));

        // Order shouldn't matter for equivalence
        assert!(a.is_equivalent(c, &mut analysis_env));

        // Different intersections should not be equivalent
        assert!(!a.is_equivalent(d, &mut analysis_env));
    }

    #[test]
    fn is_equivalent_side() {
        // Check that we both check the left and the right sides for equivalence
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        intersection!(env, a, [primitive!(env, PrimitiveType::Boolean)]);
        intersection!(
            env,
            b,
            [
                primitive!(env, PrimitiveType::Boolean),
                primitive!(env, PrimitiveType::Number)
            ]
        );

        let mut analysis_env = AnalysisEnvironment::new(&env);

        assert!(!a.is_equivalent(b, &mut analysis_env));
        assert!(!b.is_equivalent(a, &mut analysis_env));
    }

    #[test]
    fn empty_intersection_equivalence() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create two empty intersections
        intersection!(env, a, []);
        intersection!(env, b, []);

        // Create a non-empty intersection
        intersection!(env, c, [primitive!(env, PrimitiveType::Number)]);

        let mut analysis_env = AnalysisEnvironment::new(&env);

        // Empty intersections should be equivalent to each other
        assert!(a.is_equivalent(b, &mut analysis_env));

        // Empty intersection should not be equivalent to non-empty intersection
        assert!(!a.is_equivalent(c, &mut analysis_env));
    }

    #[test]
    fn simplify_identical_variants() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create an intersection with duplicate variants
        intersection!(
            env,
            intersection_type,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::Number)
            ]
        );

        let mut simplify_env = SimplifyEnvironment::new(&env);

        // Simplifying should collapse duplicates
        assert_equiv!(
            env,
            [intersection_type.simplify(&mut simplify_env)],
            [primitive!(env, PrimitiveType::Number)]
        );
    }

    #[test]
    fn simplify_nested_intersections() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create nested intersections
        let nested = intersection!(env, [primitive!(env, PrimitiveType::Number)]);
        intersection!(
            env,
            intersection_type,
            [nested, primitive!(env, PrimitiveType::Integer)]
        );

        let mut simplify_env = SimplifyEnvironment::new(&env);

        // Simplifying should flatten nested intersections
        assert_equiv!(
            env,
            [intersection_type.simplify(&mut simplify_env)],
            [intersection!(
                env,
                [primitive!(env, PrimitiveType::Integer)]
            )]
        );
    }

    #[test]
    fn simplify_with_top() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create an intersection with a top (Unknown) type
        intersection!(
            env,
            intersection_type,
            [
                instantiate(&env, TypeKind::Unknown),
                primitive!(env, PrimitiveType::Number)
            ]
        );

        let mut simplify_env = SimplifyEnvironment::new(&env);

        // Simplifying should keep only the non-top type
        assert_equiv!(
            env,
            [intersection_type.simplify(&mut simplify_env)],
            [primitive!(env, PrimitiveType::Number)]
        );
    }

    #[test]
    fn simplify_with_bottom() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create an intersection with a never type
        intersection!(
            env,
            intersection_type,
            [
                instantiate(&env, TypeKind::Never),
                primitive!(env, PrimitiveType::Number)
            ]
        );

        let mut simplify_env = SimplifyEnvironment::new(&env);

        // Simplifying should collapse to Never
        assert_equiv!(
            env,
            [intersection_type.simplify(&mut simplify_env)],
            [instantiate(&env, TypeKind::Never)]
        );
    }

    #[test]
    fn simplify_empty_intersection() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create an empty intersection
        intersection!(env, intersection_type, []);

        let mut simplify_env = SimplifyEnvironment::new(&env);

        // Simplifying empty intersection should result in Unknown
        assert_equiv!(
            env,
            [intersection_type.simplify(&mut simplify_env)],
            [instantiate(&env, TypeKind::Unknown)]
        );
    }

    #[test]
    fn simplify_with_supertypes() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create an intersection with a type and its supertype
        let number = primitive!(env, PrimitiveType::Number);
        let integer = primitive!(env, PrimitiveType::Integer); // Integer is a subtype of Number
        intersection!(env, intersection_type, [number, integer]);

        let mut simplify_env = SimplifyEnvironment::new(&env);

        // Simplifying should keep only the subtype
        assert_equiv!(
            env,
            [intersection_type.simplify(&mut simplify_env)],
            [integer]
        );
    }

    #[test]
    fn lattice_laws() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create three distinct intersection types for testing lattice laws
        let a = intersection!(env, [primitive!(env, PrimitiveType::Number)]);
        let b = intersection!(env, [primitive!(env, PrimitiveType::String)]);
        let c = intersection!(env, [primitive!(env, PrimitiveType::Boolean)]);

        // Test that intersection types satisfy lattice laws (associativity, commutativity,
        // absorption)
        assert_lattice_laws(&env, a, b, c);
    }

    #[test]
    fn is_concrete() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);
        let mut analysis_env = AnalysisEnvironment::new(&env);

        // Concrete intersection (with all concrete variants)
        let number = primitive!(env, PrimitiveType::Number);
        let string = primitive!(env, PrimitiveType::String);
        intersection!(env, concrete_intersection, [number, string]);
        assert!(concrete_intersection.is_concrete(&mut analysis_env));

        // Non-concrete intersection (with at least one non-concrete variant)
        let infer_var = instantiate_infer(&env, HoleId::new(0));
        intersection!(env, non_concrete_intersection, [number, infer_var]);
        assert!(!non_concrete_intersection.is_concrete(&mut analysis_env));

        // Empty intersection should be concrete
        intersection!(env, empty_intersection, []);
        assert!(empty_intersection.is_concrete(&mut analysis_env));

        // Nested non-concrete intersection
        intersection!(
            env,
            nested_intersection,
            [concrete_intersection.id, non_concrete_intersection.id]
        );
        assert!(!nested_intersection.is_concrete(&mut analysis_env));
    }

    #[test]
    fn disjoint_types_produce_never() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create an intersection of disjoint types (e.g., number & string)
        intersection!(
            env,
            intersection_type,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );

        let mut simplify_env = SimplifyEnvironment::new(&env);

        // Check if simplification of disjoint types produces Never
        assert_equiv!(
            env,
            [intersection_type.simplify(&mut simplify_env)],
            [instantiate(&env, TypeKind::Never)]
        );
    }

    #[test]
    fn intersection_with_complex_types() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create tuple types
        let tuple1 = tuple!(env, [primitive!(env, PrimitiveType::Number)]);
        let tuple2 = tuple!(env, [primitive!(env, PrimitiveType::String)]);

        // Create an intersection of tuple types
        intersection!(env, intersection_type, [tuple1, tuple2]);

        let mut analysis_env = AnalysisEnvironment::new(&env);

        // Intersection operations should work with non-primitive types
        assert!(!intersection_type.is_top(&mut analysis_env));

        // Test subtyping with tuples in intersections
        let tuple3 = tuple!(env, [primitive!(env, PrimitiveType::Number)]);
        intersection!(env, single_tuple, [tuple3]);

        // tuple1 & tuple2 <: tuple1
        // see for an in-depth explanation see is_subtype_of_self
        assert!(!intersection_type.is_subtype_of(single_tuple, &mut analysis_env));
        assert!(analysis_env.is_subtype_of(intersection_type.id, single_tuple.id));

        // tuple1 ≮: tuple1 & tuple2
        assert!(!single_tuple.is_subtype_of(intersection_type, &mut analysis_env));
    }

    #[test]
    fn intersection_and_union_interaction() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        let number = primitive!(env, PrimitiveType::Number);
        let string = primitive!(env, PrimitiveType::String);
        let boolean = primitive!(env, PrimitiveType::Boolean);

        // A & (B | C)
        let union_type = union!(env, [string, boolean]);
        intersection!(env, intersection_with_union, [number, union_type]);

        let mut simplify_env = SimplifyEnvironment::new(&env);

        // This should simplify to
        //  (A & B) | (A & C)
        //    <=> (Number & String) | (Number & Boolean)
        //    <=> Never | Never
        //    <=> Never
        assert_equiv!(
            env,
            [intersection_with_union.simplify(&mut simplify_env)],
            [instantiate(&env, TypeKind::Never)]
        );
    }

    #[test]
    fn intersection_equivalence_covariance() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

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

        // Dict<Number, Boolean & String>
        let dict_number_boolean_string = dict!(
            env,
            primitive!(env, PrimitiveType::Number),
            intersection!(
                env,
                [
                    primitive!(env, PrimitiveType::Boolean),
                    primitive!(env, PrimitiveType::String)
                ]
            )
        );

        // Create the two union types we want to compare:
        // Type 1: Dict<Number, Boolean & String>
        let type1 = dict_number_boolean_string;

        // Type 2: Dict<Number, Boolean> & Dict<Number, String>
        let type2 = intersection!(env, [dict_number_boolean, dict_number_string]);

        let mut analysis_env = AnalysisEnvironment::new(&env);

        // These types should be equivalent despite having different variant counts
        assert!(analysis_env.is_equivalent(type1, type2));
        assert!(analysis_env.is_equivalent(type2, type1));
    }

    #[test]
    fn collect_constraints_empty() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create two empty intersections (Unknown type)
        intersection!(env, empty_a, []);
        intersection!(env, empty_b, []);

        let mut inference_env = InferenceEnvironment::new(&env);

        // Unknown <: Unknown
        empty_a.collect_constraints(empty_b, &mut inference_env);

        // No constraints should be generated for this trivial case
        let constraints = inference_env.take_constraints();
        assert!(constraints.is_empty());
    }

    #[test]
    fn collect_constraints_empty_subtype() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Empty intersection (Unknown) as subtype
        intersection!(env, empty, []);

        let hole = HoleId::new(0);
        let infer = instantiate_infer(&env, hole);
        intersection!(env, concrete, [infer]);

        let mut inference_env = InferenceEnvironment::new(&env);

        empty.collect_constraints(concrete, &mut inference_env);

        let constraints = inference_env.take_constraints();
        assert_matches!(
            &*constraints,
            [Constraint::LowerBound {
                variable: Variable { span: SpanId::SYNTHETIC, kind: VariableKind::Hole(var) },
                bound
            }] if *env.r#type(*bound).kind == TypeKind::Unknown && *var == hole
        );
    }

    #[test]
    fn collect_constraints_empty_supertype() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        let hole = HoleId::new(0);
        let infer = instantiate_infer(&env, hole);
        intersection!(env, concrete, [infer]);

        // Empty intersection (Unknown) as supertype
        intersection!(env, empty, []);

        let mut inference_env = InferenceEnvironment::new(&env);

        concrete.collect_constraints(empty, &mut inference_env);

        let constraints = inference_env.take_constraints();
        assert_matches!(
            &*constraints,
            [Constraint::UpperBound {
                variable: Variable { span: SpanId::SYNTHETIC, kind: VariableKind::Hole(var) },
                bound
            }] if *env.r#type(*bound).kind == TypeKind::Unknown && *var == hole
        );
    }

    #[test]
    fn collect_constraints_inference_variable_subtype() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create an inference variable
        let hole = HoleId::new(0);
        let infer_var = instantiate_infer(&env, hole);

        // Intersection with inference variable as subtype
        intersection!(env, infer_intersection, [infer_var]);

        // Concrete intersection as supertype
        let number = primitive!(env, PrimitiveType::Number);
        intersection!(env, concrete_intersection, [number]);

        let mut inference_env = InferenceEnvironment::new(&env);

        // ?T <: Number
        infer_intersection.collect_constraints(concrete_intersection, &mut inference_env);

        // Should generate an upper bound constraint
        let constraints = inference_env.take_constraints();
        assert_sorted_eq!(
            constraints,
            [Constraint::UpperBound {
                variable: Variable::synthetic(VariableKind::Hole(hole)),
                bound: number
            }]
        );
    }

    #[test]
    fn collect_constraints_inference_variable_supertype() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create an inference variable
        let hole = HoleId::new(0);
        let infer_var = instantiate_infer(&env, hole);

        // Concrete intersection as subtype
        let number = primitive!(env, PrimitiveType::Number);
        intersection!(env, concrete_intersection, [number]);

        // Intersection with inference variable as supertype
        intersection!(env, infer_intersection, [infer_var]);

        let mut inference_env = InferenceEnvironment::new(&env);

        // Number <: ?T
        concrete_intersection.collect_constraints(infer_intersection, &mut inference_env);

        // Should generate a lower bound constraint
        let constraints = inference_env.take_constraints();
        assert_sorted_eq!(
            constraints,
            [Constraint::LowerBound {
                variable: Variable::synthetic(VariableKind::Hole(hole)),
                bound: number
            }]
        );
    }

    #[test]
    fn collect_constraints_multiple_variants() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create inference variables
        let hole_a = HoleId::new(0);
        let infer_a = instantiate_infer(&env, hole_a);
        let hole_b = HoleId::new(1);
        let infer_b = instantiate_infer(&env, hole_b);

        // Create concrete types
        let number = primitive!(env, PrimitiveType::Number);
        let string = primitive!(env, PrimitiveType::String);

        // Create intersection with multiple inference variables
        intersection!(env, infer_intersection, [infer_a, infer_b]);

        // Create intersection with multiple concrete types
        intersection!(env, concrete_intersection, [number, string]);

        let mut inference_env = InferenceEnvironment::new(&env);

        // (infer_a & infer_b) <: (Number & String)
        infer_intersection.collect_constraints(concrete_intersection, &mut inference_env);

        // Should collect constraints in a cartesian product
        let constraints = inference_env.take_constraints();
        assert_sorted_eq!(
            constraints,
            [
                Constraint::UpperBound {
                    variable: Variable::synthetic(VariableKind::Hole(hole_a)),
                    bound: string,
                },
                Constraint::UpperBound {
                    variable: Variable::synthetic(VariableKind::Hole(hole_a)),
                    bound: number,
                },
                Constraint::UpperBound {
                    variable: Variable::synthetic(VariableKind::Hole(hole_b)),
                    bound: string,
                },
                Constraint::UpperBound {
                    variable: Variable::synthetic(VariableKind::Hole(hole_b)),
                    bound: number,
                },
            ]
        );
    }

    #[test]
    fn collect_constraints_nested_intersection() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create inference variable
        let hole = HoleId::new(0);
        let infer_var = instantiate_infer(&env, hole);

        // Create a nested intersection with inference variable
        let inner_infer = intersection!(env, [infer_var]);
        intersection!(env, nested_infer, [inner_infer]);

        // Create a concrete nested intersection
        let number = primitive!(env, PrimitiveType::Number);
        let inner_concrete = intersection!(env, [number]);
        intersection!(env, nested_concrete, [inner_concrete]);

        let mut inference_env = InferenceEnvironment::new(&env);

        // The nested intersection should unnest during constraint collection
        nested_infer.collect_constraints(nested_concrete, &mut inference_env);

        // Should generate constraints between infer_var and number
        let constraints = inference_env.take_constraints();
        assert_sorted_eq!(
            constraints,
            [Constraint::UpperBound {
                variable: Variable::synthetic(VariableKind::Hole(hole)),
                bound: number
            }]
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

        // Create intersections with generic parameters
        intersection!(env, generic_a, [param1]);

        intersection!(env, generic_b, [param2]);

        let mut inference_env = InferenceEnvironment::new(&env);

        // Collect constraints between generic intersections
        generic_a.collect_constraints(generic_b, &mut inference_env);

        // Should generate an ordering constraint
        let constraints = inference_env.take_constraints();
        assert_eq!(
            constraints,
            [Constraint::Ordering {
                lower: Variable::synthetic(VariableKind::Generic(arg1)),
                upper: Variable::synthetic(VariableKind::Generic(arg2))
            }]
        );
    }

    #[test]
    fn collect_constraints_concrete_types_only() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create concrete types
        let number = primitive!(env, PrimitiveType::Number);
        let integer = primitive!(env, PrimitiveType::Integer);

        // Create intersections with only concrete types
        intersection!(env, concrete_a, [integer]);
        intersection!(env, concrete_b, [number]);

        let mut inference_env = InferenceEnvironment::new(&env);

        // Collect constraints between concrete intersections
        concrete_a.collect_constraints(concrete_b, &mut inference_env);

        // No variable constraints should be generated for concrete types
        assert!(inference_env.take_constraints().is_empty());
    }

    #[test]
    fn collect_structural_edges_basic() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create an inference variable
        let hole = HoleId::new(0);
        let infer_var = instantiate_infer(&env, hole);

        // Create an intersection with an inference variable: infer_var & Number
        intersection!(
            env,
            basic_intersection,
            [infer_var, primitive!(env, PrimitiveType::Number)]
        );

        let mut inference_env = InferenceEnvironment::new(&env);

        // Create a variable to use as the source in a structural edge
        let source_var = Variable::synthetic(VariableKind::Hole(HoleId::new(1)));
        let partial_edge = PartialStructuralEdge::Source(source_var);

        // Collect structural edges
        basic_intersection.collect_structural_edges(partial_edge, &mut inference_env);

        // Since intersections are covariant in all their variants, the flow is preserved
        // We expect source (_1) flowing to the infer_var (_0) within the intersection
        let constraints = inference_env.take_constraints();
        assert_eq!(
            constraints,
            [Constraint::StructuralEdge {
                source: source_var,
                target: Variable::synthetic(VariableKind::Hole(hole)),
            }]
        );
    }

    #[test]
    fn collect_structural_edges_target() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create an inference variable
        let hole = HoleId::new(0);
        let infer_var = instantiate_infer(&env, hole);

        // Create an intersection with an inference variable: infer_var & String
        intersection!(
            env,
            intersection_type,
            [infer_var, primitive!(env, PrimitiveType::String)]
        );

        let mut inference_env = InferenceEnvironment::new(&env);

        // Create a variable to use as the target in a structural edge
        let target_var = Variable::synthetic(VariableKind::Hole(HoleId::new(1)));
        let partial_edge = PartialStructuralEdge::Target(target_var);

        // Collect structural edges
        intersection_type.collect_structural_edges(partial_edge, &mut inference_env);

        // Since intersections are covariant in all their variants, the flow is from the infer var
        // to target We expect the infer_var (_0) flowing to the target (_1)
        let constraints = inference_env.take_constraints();
        assert_eq!(
            constraints,
            [Constraint::StructuralEdge {
                source: Variable::synthetic(VariableKind::Hole(hole)),
                target: target_var,
            }]
        );
    }

    #[test]
    fn collect_structural_edges_multiple_infer_vars() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create multiple inference variables
        let hole1 = HoleId::new(0);
        let infer_var1 = instantiate_infer(&env, hole1);
        let hole2 = HoleId::new(1);
        let infer_var2 = instantiate_infer(&env, hole2);

        // Create an intersection with multiple inference variables: infer_var1 & infer_var2
        intersection!(env, multi_infer_intersection, [infer_var1, infer_var2]);

        let mut inference_env = InferenceEnvironment::new(&env);

        // Create a variable for the edge
        let edge_var = Variable::synthetic(VariableKind::Hole(HoleId::new(3)));
        let partial_edge = PartialStructuralEdge::Source(edge_var);

        // Collect structural edges
        multi_infer_intersection.collect_structural_edges(partial_edge, &mut inference_env);

        // Since intersections are covariant, the source should flow to both variables
        // We expect:
        // 1. _3 -> _0
        // 2. _3 -> _1
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
    fn collect_structural_edges_nested_intersection() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create inference variables
        let hole_inner = HoleId::new(0);
        let infer_inner = instantiate_infer(&env, hole_inner);
        let hole_outer = HoleId::new(1);
        let infer_outer = instantiate_infer(&env, hole_outer);

        // Create an inner intersection: infer_inner & Number
        let inner_intersection =
            intersection!(env, [infer_inner, primitive!(env, PrimitiveType::Number)]);

        // Create an outer intersection: infer_outer & inner_intersection
        intersection!(env, outer_intersection, [infer_outer, inner_intersection]);

        let mut inference_env = InferenceEnvironment::new(&env);

        // Edge variable
        let edge_var = Variable::synthetic(VariableKind::Hole(HoleId::new(2)));
        let partial_edge = PartialStructuralEdge::Source(edge_var);

        // Collect structural edges for the outer intersection
        outer_intersection.collect_structural_edges(partial_edge, &mut inference_env);

        // We expect:
        // 1. _2 -> _1 (source flows to outer infer var)
        // 2. _2 -> _0 (source flows to inner infer var through nested intersection)
        let constraints = inference_env.take_constraints();
        assert_eq!(
            constraints,
            [
                Constraint::StructuralEdge {
                    source: edge_var,
                    target: Variable::synthetic(VariableKind::Hole(hole_outer)),
                },
                Constraint::StructuralEdge {
                    source: edge_var,
                    target: Variable::synthetic(VariableKind::Hole(hole_inner)),
                }
            ]
        );
    }

    #[test]
    fn collect_structural_edges_contravariant_context() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create an inference variable
        let hole = HoleId::new(0);
        let infer_var = instantiate_infer(&env, hole);

        // Create an intersection with an inference variable
        intersection!(
            env,
            intersection_type,
            [infer_var, primitive!(env, PrimitiveType::Number)]
        );

        let mut inference_env = InferenceEnvironment::new(&env);

        // Edge variable
        let edge_var = Variable::synthetic(VariableKind::Hole(HoleId::new(1)));
        let partial_edge = PartialStructuralEdge::Source(edge_var);

        // Collect structural edges in a contravariant context
        inference_env.in_contravariant(|env| {
            intersection_type.collect_structural_edges(partial_edge, env);
        });

        // In a contravariant context, the edge direction is inverted
        // We expect infer_var (_0) flows to source (_1)
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
    fn collect_structural_edges_invariant_context() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create an inference variable
        let hole = HoleId::new(0);
        let infer_var = instantiate_infer(&env, hole);

        // Create an intersection with an inference variable
        intersection!(
            env,
            intersection_type,
            [infer_var, primitive!(env, PrimitiveType::Number)]
        );

        let mut inference_env = InferenceEnvironment::new(&env);

        // Edge variable
        let edge_var = Variable::synthetic(VariableKind::Hole(HoleId::new(1)));
        let partial_edge = PartialStructuralEdge::Source(edge_var);

        // Collect structural edges in an invariant context
        inference_env.in_invariant(|env| {
            intersection_type.collect_structural_edges(partial_edge, env);
        });

        // In invariant context, no structural edges should be collected
        let constraints = inference_env.take_constraints();
        assert!(constraints.is_empty());
    }

    #[test]
    fn collect_structural_edges_empty_intersection() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create an empty intersection (Unknown type)
        intersection!(env, empty_intersection, []);

        let mut inference_env = InferenceEnvironment::new(&env);

        // Edge variable
        let edge_var = Variable::synthetic(VariableKind::Hole(HoleId::new(0)));
        let partial_edge = PartialStructuralEdge::Source(edge_var);

        // Collect structural edges for an empty intersection
        empty_intersection.collect_structural_edges(partial_edge, &mut inference_env);

        // Empty intersection has no variants, so no edges should be collected
        let constraints = inference_env.take_constraints();
        assert!(constraints.is_empty());
    }

    #[test]
    fn collect_structural_edges_mixed_types() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create inference variables
        let hole1 = HoleId::new(0);
        let infer_var1 = instantiate_infer(&env, hole1);
        let hole2 = HoleId::new(1);
        let infer_var2 = instantiate_infer(&env, hole2);

        // Create a tuple with an inference variable
        let tuple_type = tuple!(env, [infer_var1]);

        // Create an intersection with mixed types: tuple & infer_var2
        intersection!(env, mixed_intersection, [tuple_type, infer_var2]);

        let mut inference_env = InferenceEnvironment::new(&env);

        // Edge variable
        let edge_var = Variable::synthetic(VariableKind::Hole(HoleId::new(3)));
        let partial_edge = PartialStructuralEdge::Source(edge_var);

        // Collect structural edges
        mixed_intersection.collect_structural_edges(partial_edge, &mut inference_env);

        // Edges should be collected for all inference variables
        // We expect:
        // 1. _3 -> _0 (through the tuple)
        // 2. _3 -> _1 (direct to the second infer var)
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
    fn simplify_recursive_intersection() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        let r#type = env.types.intern(|id| PartialType {
            span: SpanId::SYNTHETIC,
            kind: env.intern_kind(TypeKind::Intersection(IntersectionType {
                variants: env.intern_type_ids(&[id.value()]),
            })),
        });

        let mut simplify = SimplifyEnvironment::new(&env);
        let type_id = simplify.simplify(r#type.id);

        let r#type = env.r#type(type_id);

        assert_matches!(r#type.kind, TypeKind::Unknown);
    }

    #[test]
    fn simplify_recursive_intersection_multiple() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        let r#type = env.types.intern(|id| PartialType {
            span: SpanId::SYNTHETIC,
            kind: env.intern_kind(TypeKind::Intersection(IntersectionType {
                variants: env
                    .intern_type_ids(&[id.value(), primitive!(env, PrimitiveType::Integer)]),
            })),
        });

        let mut simplify = SimplifyEnvironment::new(&env);
        let type_id = simplify.simplify(r#type.id);

        let r#type = env.r#type(type_id);

        assert_matches!(r#type.kind, TypeKind::Primitive(PrimitiveType::Integer));
    }

    #[test]
    fn is_bottom_recursive_intersection_multiple() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        let r#type = env.types.intern(|id| PartialType {
            span: SpanId::SYNTHETIC,
            kind: env.intern_kind(TypeKind::Intersection(IntersectionType {
                variants: env
                    .intern_type_ids(&[id.value(), primitive!(env, PrimitiveType::Integer)]),
            })),
        });

        let mut analysis = AnalysisEnvironment::new(&env);
        let is_bottom = analysis.is_bottom(r#type.id);
        assert!(!is_bottom);

        let r#type = env.types.intern(|id| PartialType {
            span: SpanId::SYNTHETIC,
            kind: env.intern_kind(TypeKind::Intersection(IntersectionType {
                variants: env.intern_type_ids(&[id.value(), instantiate(&env, TypeKind::Never)]),
            })),
        });

        let mut analysis = AnalysisEnvironment::new(&env);
        let is_bottom = analysis.is_bottom(r#type.id);
        assert!(is_bottom);
    }

    #[test]
    fn instantiate_intersection() {
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

        intersection!(env, value, [a, b]);

        let mut instantiate = InstantiateEnvironment::new(&env);
        let type_id = value.instantiate(&mut instantiate);
        assert!(instantiate.take_diagnostics().is_empty());

        let result = env.r#type(type_id);
        let intersection = result
            .kind
            .intersection()
            .expect("should be an intersection");
        assert_eq!(intersection.variants.len(), 2);

        let generic_arguments = [argument1, argument2];

        for (index, &variant) in intersection.variants.iter().enumerate() {
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

        let intersection = intersection!(env, []);

        let mut lattice = LatticeEnvironment::new(&env);
        let projection =
            lattice.projection(intersection, Ident::synthetic(heap.intern_symbol("foo")));
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

        let intersection =
            intersection!(env, [r#struct!(env, [struct_field!(env, "foo", string)])]);

        let mut lattice = LatticeEnvironment::new(&env);
        let projection =
            lattice.projection(intersection, Ident::synthetic(heap.intern_symbol("foo")));
        assert_eq!(lattice.diagnostics.len(), 0);

        assert_eq!(projection, Projection::Resolved(string));
    }

    #[test]
    fn projection_propagate_error() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        let string = primitive!(env, PrimitiveType::String);
        let integer = primitive!(env, PrimitiveType::Integer);

        let intersection = intersection!(env, [integer, string]);

        let mut lattice = LatticeEnvironment::new(&env);
        let projection =
            lattice.projection(intersection, Ident::synthetic(heap.intern_symbol("foo")));
        assert_eq!(lattice.diagnostics.len(), 2);
        assert_eq!(projection, Projection::Error);
    }

    #[test]
    fn projection_propagate_pending() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        let string = primitive!(env, PrimitiveType::String);
        let hole = env.counter.hole.next();

        let intersection = intersection!(env, [instantiate_infer(&env, hole), string]);

        let mut lattice = LatticeEnvironment::new(&env);
        let projection =
            lattice.projection(intersection, Ident::synthetic(heap.intern_symbol("foo")));
        assert_eq!(lattice.diagnostics.len(), 0);
        assert_eq!(projection, Projection::Pending);
    }

    #[test]
    fn projection_union_values() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        let string = primitive!(env, PrimitiveType::String);
        let integer = primitive!(env, PrimitiveType::Integer);

        let intersection = intersection!(
            env,
            [
                r#struct!(env, [struct_field!(env, "foo", integer)]),
                r#struct!(env, [struct_field!(env, "foo", string)])
            ]
        );

        let mut lattice = LatticeEnvironment::new(&env);
        let projection =
            lattice.projection(intersection, Ident::synthetic(heap.intern_symbol("foo")));
        assert_eq!(lattice.diagnostics.len(), 0);
        let Projection::Resolved(id) = projection else {
            panic!("expected resolved projection")
        };

        assert_equiv!(env, [id], [intersection!(env, [integer, string])]);
    }
}
