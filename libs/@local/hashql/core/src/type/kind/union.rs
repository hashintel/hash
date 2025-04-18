use pretty::RcDoc;
use smallvec::SmallVec;

use super::TypeKind;
use crate::r#type::{
    Type, TypeId,
    environment::{
        Environment, EquivalenceEnvironment, LatticeEnvironment, SimplifyEnvironment,
        TypeAnalysisEnvironment, UnificationEnvironment,
    },
    lattice::Lattice,
    pretty_print::PrettyPrint,
    recursion::RecursionDepthBoundary,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct UnionType<'heap> {
    pub variants: &'heap [TypeId],
}

impl UnionType<'_> {
    fn unnest(&self, env: &Environment) -> Vec<TypeId> {
        let mut variants = Vec::with_capacity(self.variants.len());

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
}

impl<'heap> Lattice<'heap> for UnionType<'heap> {
    fn join(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        _: &mut LatticeEnvironment<'_, 'heap>,
    ) -> smallvec::SmallVec<TypeId, 4> {
        if self.kind.variants.is_empty() {
            return SmallVec::from_slice(other.kind.variants);
        }

        if other.kind.variants.is_empty() {
            return SmallVec::from_slice(self.kind.variants);
        }

        let mut variants =
            SmallVec::with_capacity(self.kind.variants.len() + other.kind.variants.len());
        variants.extend_from_slice(self.kind.variants);
        variants.extend_from_slice(other.kind.variants);

        // Order by the id, as a union is a set and therefore is irrespective of order
        variants.sort_unstable();
        variants.dedup();

        variants
    }

    fn meet(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> smallvec::SmallVec<TypeId, 4> {
        // `meet` over a union is a distribution, e.g.
        // (A ∪ B) ∧ (C ∪ D)
        // = (A ∧ C) ∪ (A ∧ D) ∪ (B ∧ C) ∪ (B ∧ D)
        let mut variants =
            SmallVec::with_capacity(self.kind.variants.len() * other.kind.variants.len());

        for &lhs in self.kind.variants {
            for &rhs in other.kind.variants {
                variants.push(env.meet(lhs, rhs));
            }
        }

        variants
    }

    fn uninhabited(self: Type<'heap, Self>, _: &mut TypeAnalysisEnvironment<'_, 'heap>) -> bool {
        self.kind.variants.is_empty()
    }

    fn semantically_equivalent(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut EquivalenceEnvironment<'_, 'heap>,
    ) -> bool {
        let lhs_variants = self.kind.unnest(env);
        let rhs_variants = other.kind.unnest(env);

        if lhs_variants.len() != rhs_variants.len() {
            return false;
        }

        // For every variant x in lhs_variants, there exists a y in rhs_variants where x ≡ y
        lhs_variants.iter().all(|&x| {
            rhs_variants
                .iter()
                .any(|&y| env.semantically_equivalent(x, y))
        })
    }

    fn unify(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut UnificationEnvironment<'_, 'heap>,
    ) {
        todo!()
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
        variants.retain(|&variant| !env.uninhabited(variant));

        // Drop supertypes of other variants
        let backup = variants.clone();
        variants.retain(|&v| {
            // keep v only if *no* other distinct u is a subtype of v
            !backup.iter().any(|&u| env.is_subtype(u, v))
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
