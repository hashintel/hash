use core::ops::ControlFlow;
use std::env::vars;

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
        error::{cannot_be_subtype_of_never, type_mismatch, union_variant_mismatch},
        lattice::Lattice,
        pretty_print::PrettyPrint,
        recursion::RecursionDepthBoundary,
    },
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct UnionType<'heap> {
    pub variants: &'heap [TypeId],
}

impl<'heap> UnionType<'heap> {
    pub(crate) fn unnest(&self, env: &Environment) -> SmallVec<TypeId, 16> {
        let mut variants = SmallVec::with_capacity(self.variants.len());

        for &variant in self.variants {
            if let TypeKind::Union(union) = env.types[variant].copied().kind {
                variants.extend(union.unnest(env));
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
    ) -> SmallVec<TypeId, 4> {
        if lhs_variants.is_empty() {
            return SmallVec::from_slice(rhs_variants);
        }

        if rhs_variants.is_empty() {
            return SmallVec::from_slice(lhs_variants);
        }

        let mut variants = SmallVec::with_capacity(lhs_variants.len() + rhs_variants.len());
        variants.extend_from_slice(lhs_variants);
        variants.extend_from_slice(rhs_variants);

        // Order by the id, as a union is a set and therefore is irrespective of order
        variants.sort_unstable();
        variants.dedup();

        variants
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
        let mut variants =
            SmallVec::<_, 16>::with_capacity(lhs_variants.len() * rhs_variants.len());

        for &lhs in lhs_variants {
            for &rhs in rhs_variants {
                variants.push(env.meet(lhs, rhs));
            }
        }

        variants.sort_unstable();
        variants.dedup();

        // We need to wrap this in an explicit `Union`, as a `meet` with multiple returned values
        // turns into an intersection.
        let id = env.alloc(|id| Type {
            id,
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
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> bool
    where
        T: PrettyPrint,
        U: PrettyPrint,
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
                    union_variant_mismatch(env, env.types[self_variant].copied(), expected)
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
                    "The Never type (empty union) can only be equivalent to itself. A non-empty \
                     union cannot be equivalent to Never."
                } else {
                    "Union types must have the same number of variants to be equivalent."
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
                    union_variant_mismatch(env, env.types[lhs_variant].copied(), rhs)
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

impl<'heap> Lattice<'heap> for UnionType<'heap> {
    fn join(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> smallvec::SmallVec<TypeId, 4> {
        let lhs_variants = self.kind.unnest(env);
        let rhs_variants = other.kind.unnest(env);

        Self::join_variants(&lhs_variants, &rhs_variants)
    }

    fn meet(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> smallvec::SmallVec<TypeId, 4> {
        let lhs_variants = self.kind.unnest(env);
        let rhs_variants = other.kind.unnest(env);

        Self::meet_variants(self.span, &lhs_variants, &rhs_variants, env)
    }

    fn is_bottom(self: Type<'heap, Self>, _: &mut TypeAnalysisEnvironment<'_, 'heap>) -> bool {
        self.kind.variants.is_empty()
    }

    fn is_top(self: Type<'heap, Self>, env: &mut TypeAnalysisEnvironment<'_, 'heap>) -> bool {
        self.kind.variants.iter().any(|&id| env.is_top(id))
    }

    /// Checks if this union type is a subtype of the given supertype.
    ///
    /// In type theory, a union type `A | B` represents a type that has *either* the properties
    /// of `A` or `B`. A value of this type must satisfy the constraints of at least one of the
    /// component types.
    ///
    /// Unions decompose in the following way:
    /// ```ignore
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
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        let self_variants = self.kind.unnest(env);
        let super_variants = supertype.kind.unnest(env);

        Self::is_subtype_of_variants(self, supertype, &self_variants, &super_variants, env)
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

            if let Some(UnionType { variants: nested }) = env.types[variant].copied().kind.union() {
                variants.extend_from_slice(nested);
            } else {
                variants.push(variant);
            }
        }

        // Sort, dedupe, drop bottom
        variants.sort_unstable();
        variants.dedup();
        variants.retain(|&variant| !env.is_bottom(variant));

        // Propagate top type
        if variants.iter().any(|&variant| env.is_top(variant)) {
            return env.alloc(|id| Type {
                id,
                span: self.span,
                kind: env.intern_kind(TypeKind::Unknown),
            });
        }

        // TODO: Test - what happens on `Number | Integer`, what happens on `Number | Number`
        // Drop subtypes of other variants
        let backup = variants.clone();
        variants.retain(|&subtype| {
            // keep v only if it is *not* a subtype of any other distinct u
            !backup
                .iter()
                .any(|&supertype| subtype != supertype && env.is_subtype_of(subtype, supertype))
        });

        // Collapse empty or singleton
        match variants.len() {
            0 => env.alloc(|id| Type {
                id,
                span: self.span,
                kind: env.intern_kind(TypeKind::Never),
            }),
            1 => variants[0],
            _ if variants.as_slice() == self.kind.variants => self.id,
            _ => env.alloc(|id| Type {
                id,
                span: self.span,
                kind: env.intern_kind(TypeKind::Union(UnionType {
                    variants: env.intern_type_ids(&variants),
                })),
            }),
        }
    }
}

impl PrettyPrint for UnionType<'_> {
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
                .append(RcDoc::text("|"))
                .append(RcDoc::space()),
        )
        .nest(1)
        .group()
    }
}
