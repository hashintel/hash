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

pub struct UnionType<'heap> {
    pub variants: &'heap [TypeId],
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
        todo!()
    }

    fn unify(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut UnificationEnvironment<'_, 'heap>,
    ) {
        todo!()
    }

    fn simplify(self: Type<'heap, Self>, env: &mut SimplifyEnvironment<'_, 'heap>) -> TypeId {
        let mut variants = Vec::with_capacity(self.kind.variants.len());
        variants.extend_from_slice(&self.kind.variants);

        // Deduplicate variants
        variants.sort_unstable();
        variants.dedup();

        // Simplify each variant
        for variant in &mut variants {
            *variant = env.simplify(*variant);
        }

        // Flatten any nested unions
        let mut flattened = Vec::with_capacity(variants.len());
        for variant in variants {
            if let &TypeKind::Union(UnionType { variants }) = env.types[variant].copied().kind {
                flattened.extend_from_slice(variants);
            } else {
                flattened.push(variant);
            }
        }

        let mut variants = flattened;

        // Deduplicate variants again after simplification and flattening
        variants.sort_unstable();
        variants.dedup();

        // Remove any uninhabited variants
        variants.retain(|&variant| !env.uninhabited(variant));

        if variants.is_empty() {
            let kind = env.intern_kind(TypeKind::Never);

            return env.alloc(|id| Type {
                id,
                span: self.span,
                kind,
            });
        }

        if variants.len() == 1 {
            return variants[0];
        }

        // ... if for some reason, the type returned is the same as the original type, return it
        if variants == self.kind.variants {
            return self.id;
        }

        env.alloc(|id| Type {
            id,
            span: self.span,
            kind: env.intern_kind(TypeKind::Union(UnionType {
                variants: env.intern_type_ids(&variants),
            })),
        })
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
