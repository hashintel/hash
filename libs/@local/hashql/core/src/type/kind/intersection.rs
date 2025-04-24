use core::ops::ControlFlow;

use bitvec::bitvec;
use pretty::RcDoc;
use smallvec::SmallVec;

use super::TypeKind;
use crate::{
    span::SpanId,
    r#type::{
        Type, TypeId,
        collection::TypeIdSet,
        environment::{
            AnalysisEnvironment, Environment, InferenceEnvironment, LatticeEnvironment,
            SimplifyEnvironment,
        },
        error::{cannot_be_supertype_of_unknown, intersection_variant_mismatch, type_mismatch},
        infer::Inference,
        lattice::Lattice,
        pretty_print::PrettyPrint,
        recursion::RecursionDepthBoundary,
    },
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct IntersectionType<'heap> {
    pub variants: &'heap [TypeId],
}

impl<'heap> IntersectionType<'heap> {
    pub(crate) fn unnest(&self, env: &Environment) -> SmallVec<TypeId, 16> {
        let mut variants = TypeIdSet::with_capacity(env, self.variants.len());

        for &variant in self.variants {
            if let TypeKind::Intersection(intersection) = env.types[variant].copied().kind {
                variants.extend(intersection.unnest(env));
            } else {
                variants.push(variant);
            }
        }

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
        let id = env.alloc(|id| Type {
            id,
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
            return SmallVec::from_slice(&[env.alloc(|id| Type {
                id,
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
        T: PrettyPrint,
        U: PrettyPrint,
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
                    intersection_variant_mismatch(env, env.types[self_variant].copied(), expected)
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
        T: PrettyPrint,
        U: PrettyPrint,
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
                    intersection_variant_mismatch(env, env.types[lhs_variant].copied(), rhs)
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
                    intersection_variant_mismatch(env, env.types[rhs_variant].copied(), lhs)
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
                let this = env.alloc(|id| Type {
                    id,
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
                let supertype = env.alloc(|id| Type {
                    id,
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
        let lhs_variants = self.kind.unnest(env);
        let rhs_variants = other.kind.unnest(env);

        Self::join_variants(self.span, &lhs_variants, &rhs_variants, env)
    }

    fn meet(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 4> {
        let lhs_variants = self.kind.unnest(env);
        let rhs_variants = other.kind.unnest(env);

        Self::meet_variants(self.span, &lhs_variants, &rhs_variants, env)
    }

    fn is_bottom(self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        if self.kind.variants.iter().any(|&id| env.is_bottom(id)) {
            return true;
        }

        // check if any of the variants are disjoint from each other
        for (index, &lhs) in self.kind.variants.iter().enumerate() {
            for &rhs in &self.kind.variants[index + 1..] {
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
        let self_variants = self.kind.unnest(env);
        let supertype_variants = supertype.kind.unnest(env);

        Self::is_subtype_of_variants(self, supertype, &self_variants, &supertype_variants, env)
    }

    fn is_equivalent(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        let lhs_variants = self.kind.unnest(env);
        let rhs_variants = other.kind.unnest(env);

        Self::is_equivalent_variants(self, other, &lhs_variants, &rhs_variants, env)
    }

    fn simplify(self: Type<'heap, Self>, env: &mut SimplifyEnvironment<'_, 'heap>) -> TypeId {
        // Gather + flatten + simplify
        let mut variants =
            TypeIdSet::<16>::with_capacity(env.environment, self.kind.variants.len());
        for &variant in self.kind.variants {
            let variant = env.simplify(variant);

            if let Some(IntersectionType { variants: nested }) =
                env.types[variant].copied().kind.intersection()
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
            return env.alloc(|id| Type {
                id,
                span: self.span,
                kind: env.intern_kind(TypeKind::Never),
            });
        }

        // Check for disjoint types - if any two types are unrelated, the intersection is Never
        // TODO: check if this will make problems during inference, if we simplify there
        // (in theory we can just side-step simplification until the very end)
        for index in 0..variants.len() {
            for jndex in (index + 1)..variants.len() {
                let lhs = variants[index];
                let rhs = variants[jndex];

                if env.is_disjoint(lhs, rhs) {
                    return env.alloc(|id| Type {
                        id,
                        span: self.span,
                        kind: env.intern_kind(TypeKind::Never),
                    });
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

        match variants.len() {
            0 => env.alloc(|id| Type {
                id,
                span: self.span,
                kind: env.intern_kind(TypeKind::Unknown),
            }),
            1 => variants[0],
            _ if variants.as_slice() == self.kind.variants => self.id,
            _ => env.alloc(|id| Type {
                id,
                span: self.span,
                kind: env.intern_kind(TypeKind::Intersection(IntersectionType {
                    variants: env.intern_type_ids(&variants),
                })),
            }),
        }
    }
}

impl<'heap> Inference<'heap> for IntersectionType<'heap> {
    fn collect_constraints(
        self: Type<'heap, Self>,
        supertype: Type<'heap, Self>,
        env: &mut InferenceEnvironment<'_, 'heap>,
    ) {
        let self_variants = self.kind.unnest(env);
        let super_variants = supertype.kind.unnest(env);

        Self::collect_constraints_variants(
            self.span,
            supertype.span,
            &self_variants,
            &super_variants,
            env,
        );
    }

    fn instantiate(self: Type<'heap, Self>, _: &mut AnalysisEnvironment<'_, 'heap>) -> TypeId {
        unimplemented!("See H-4384 for more details")
    }
}

impl PrettyPrint for IntersectionType<'_> {
    fn pretty<'env>(
        &self,
        env: &'env Environment,
        limit: RecursionDepthBoundary,
    ) -> pretty::RcDoc<'env, anstyle::Style> {
        RcDoc::text("(")
            .append(
                RcDoc::intersperse(
                    self.variants
                        .iter()
                        .map(|&variant| limit.pretty(env, variant)),
                    RcDoc::line()
                        .append(RcDoc::text("&"))
                        .append(RcDoc::space()),
                )
                .nest(1)
                .group(),
            )
            .append(RcDoc::text(")"))
    }
}

#[cfg(test)]
mod test {
    #![expect(clippy::min_ident_chars)]

    use core::assert_matches::assert_matches;

    use super::IntersectionType;
    use crate::{
        heap::Heap,
        span::SpanId,
        r#type::{
            environment::{
                AnalysisEnvironment, Environment, InferenceEnvironment, LatticeEnvironment,
                SimplifyEnvironment,
            },
            infer::{Constraint, Inference as _, Variable},
            kind::{
                TypeKind,
                generic_argument::GenericArgumentId,
                infer::HoleId,
                intrinsic::{DictType, IntrinsicType},
                primitive::PrimitiveType,
                test::{assert_equiv, dict, intersection, primitive, tuple, union},
                tuple::TupleType,
                union::UnionType,
            },
            lattice::{Lattice as _, test::assert_lattice_laws},
            pretty_print::PrettyPrint as _,
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
        let unnested = intersection_type.kind.unnest(&env);

        assert_eq!(unnested, [boolean, string, number]);
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
        let tuple1 = tuple!(env, [], [primitive!(env, PrimitiveType::Number)]);
        let tuple2 = tuple!(env, [], [primitive!(env, PrimitiveType::String)]);

        // Create an intersection of tuple types
        intersection!(env, intersection_type, [tuple1, tuple2]);

        let mut analysis_env = AnalysisEnvironment::new(&env);

        // Intersection operations should work with non-primitive types
        assert!(!intersection_type.is_top(&mut analysis_env));

        // Test subtyping with tuples in intersections
        let tuple3 = tuple!(env, [], [primitive!(env, PrimitiveType::Number)]);
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
                variable: Variable::Hole(var),
                bound
            }] if *env.types[*bound].copied().kind == TypeKind::Unknown && *var == hole
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
                variable: Variable::Hole(var),
                bound
            }] if *env.types[*bound].copied().kind == TypeKind::Unknown && *var == hole
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
        assert_eq!(
            constraints,
            [Constraint::UpperBound {
                variable: Variable::Hole(hole),
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
        assert_eq!(
            constraints,
            [Constraint::LowerBound {
                variable: Variable::Hole(hole),
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
        assert_eq!(
            constraints,
            [
                Constraint::UpperBound {
                    variable: Variable::Hole(hole_a),
                    bound: string,
                },
                Constraint::UpperBound {
                    variable: Variable::Hole(hole_a),
                    bound: number,
                },
                Constraint::UpperBound {
                    variable: Variable::Hole(hole_b),
                    bound: string,
                },
                Constraint::UpperBound {
                    variable: Variable::Hole(hole_b),
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
        assert_eq!(
            constraints,
            [Constraint::UpperBound {
                variable: Variable::Hole(hole),
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
                lower: Variable::Generic(arg1),
                upper: Variable::Generic(arg2)
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
}
