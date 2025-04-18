use core::ops::ControlFlow;

use pretty::RcDoc;
use smallvec::SmallVec;

use super::TypeKind;
use crate::{
    span::SpanId,
    r#type::{
        Type, TypeId,
        environment::{
            Environment, LatticeEnvironment, SimplifyEnvironment, TypeAnalysisEnvironment,
        },
        error::{cannot_be_supertype_of_unknown, intersection_variant_mismatch, type_mismatch},
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
        let mut variants = SmallVec::with_capacity(self.variants.len());

        for &variant in self.variants {
            if let TypeKind::Intersection(intersection) = env.types[variant].copied().kind {
                variants.extend(intersection.unnest(env));
            } else {
                variants.push(variant);
            }
        }

        variants.sort_unstable();
        variants.dedup();

        variants
    }

    pub(crate) fn join_variants(
        lhs_variants: &[TypeId],
        rhs_variants: &[TypeId],
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 4> {
        // `join` over an intersection is a distribution, e.g.
        // (A ∩ B) ∨ (C ∩ D)
        // = (A ∨ C) ∩ (A ∨ D) ∩ (B ∨ C) ∩ (B ∨ D)
        let mut variants = SmallVec::with_capacity(lhs_variants.len() * rhs_variants.len());

        for &lhs in lhs_variants {
            for &rhs in rhs_variants {
                variants.push(env.join(lhs, rhs));
            }
        }

        variants.sort_unstable();
        variants.dedup();

        variants
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

        let mut variants = SmallVec::with_capacity(lhs_variants.len() + rhs_variants.len());
        variants.extend_from_slice(lhs_variants);
        variants.extend_from_slice(rhs_variants);

        variants.sort_unstable();
        variants.dedup();

        variants
    }

    pub(crate) fn is_subtype_of_variants<T, U>(
        actual: Type<'heap, T>,
        expected: Type<'heap, U>,
        self_variants: &[TypeId],
        supertype_variants: &[TypeId],
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
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
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> bool
    where
        T: PrettyPrint,
        U: PrettyPrint,
    {
        if lhs_variants.len() != rhs_variants.len() {
            // We always fail-fast here
            let _: ControlFlow<()> = env.record_diagnostic(|env| {
                let help = if lhs_variants.is_empty() || rhs_variants.is_empty() {
                    "The Unknown type (empty intersection) can only be equivalent to itself. A \
                     non-empty intersection cannot be equivalent to Unknown."
                } else {
                    "Intersection types must have the same number of variants to be equivalent."
                };

                type_mismatch(env, lhs, rhs, Some(help))
            });

            return false;
        }

        let mut equivalent = true;

        // For every variant x in lhs_variants, there exists a y in rhs_variants where x ≡ y
        for &lhs_variant in lhs_variants {
            let found = rhs_variants
                .iter()
                .any(|&rhs_variant| env.is_equivalent(lhs_variant, rhs_variant));

            if found {
                continue;
            }

            if env
                .record_diagnostic(|env| {
                    intersection_variant_mismatch(env, env.types[lhs_variant].copied(), rhs)
                })
                .is_break()
            {
                return false;
            }

            equivalent = false;
        }

        equivalent
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

        Self::join_variants(&lhs_variants, &rhs_variants, env)
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

    fn is_bottom(self: Type<'heap, Self>, env: &mut TypeAnalysisEnvironment<'_, 'heap>) -> bool {
        self.kind.variants.iter().any(|&id| env.is_bottom(id))
    }

    fn is_top(self: Type<'heap, Self>, _: &mut TypeAnalysisEnvironment<'_, 'heap>) -> bool {
        self.kind.variants.is_empty()
    }

    /// Checks if this intersection type is a subtype of the given supertype.
    ///
    /// In type theory, an intersection type `A & B` represents a type that has *all* the properties
    /// of both `A` and `B`. A value of this type must satisfy all constraints of both component
    /// types.
    ///
    /// Intersection types decompose in the following way:
    ///
    /// ```ignore
    /// (A & B) <: (C & D)
    ///   <=> A <: (C & D) ∧ B <: (C & D)
    ///   <=> (A <: C ∧ A <: D) ∧ (B <: C ∧ B <: D)
    /// ```
    fn is_subtype_of(
        self: Type<'heap, Self>,
        supertype: Type<'heap, Self>,
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        let self_variants = self.kind.unnest(env);
        let supertype_variants = supertype.kind.unnest(env);

        Self::is_subtype_of_variants(self, supertype, &self_variants, &supertype_variants, env)
    }

    fn is_equivalent(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        let lhs_variants = self.kind.unnest(env);
        let rhs_variants = other.kind.unnest(env);

        Self::is_equivalent_variants(self, other, &lhs_variants, &rhs_variants, env)
    }

    fn simplify(self: Type<'heap, Self>, env: &mut SimplifyEnvironment<'_, 'heap>) -> TypeId {
        // Gather + flatten + simplify
        let mut variants = Vec::with_capacity(self.kind.variants.len());
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
        variants.sort_unstable();
        variants.dedup();
        variants.retain(|&variant| !env.is_top(variant));

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
        variants.retain(|&supertype| {
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

impl PrettyPrint for IntersectionType<'_> {
    fn pretty<'env>(
        &self,
        env: &'env Environment,
        limit: RecursionDepthBoundary,
    ) -> pretty::RcDoc<'env, anstyle::Style> {
        RcDoc::intersperse(
            self.variants
                .iter()
                .map(|&variant| limit.pretty(env, variant)),
            RcDoc::line()
                .append(RcDoc::text("&"))
                .append(RcDoc::space()),
        )
        .nest(1)
        .group()
    }
}
