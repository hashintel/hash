use pretty::RcDoc;
use smallvec::SmallVec;

use super::TypeKind;
use crate::r#type::{
    Type, TypeId,
    environment::{Environment, LatticeEnvironment, SimplifyEnvironment, TypeAnalysisEnvironment},
    lattice::Lattice,
    pretty_print::PrettyPrint,
    recursion::RecursionDepthBoundary,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct IntersectionType<'heap> {
    pub variants: &'heap [TypeId],
}

impl IntersectionType<'_> {
    fn unnest(&self, env: &Environment) -> SmallVec<TypeId, 16> {
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
}

impl<'heap> Lattice<'heap> for IntersectionType<'heap> {
    fn join(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 4> {
        todo!()
    }

    fn meet(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 4> {
        // 1) Top ∧ Top = Top
        if self.kind.variants.is_empty() && other.kind.variants.is_empty() {
            return SmallVec::from_slice(&[env.alloc(|id| Type {
                id,
                span: self.span,
                kind: env.intern_kind(TypeKind::Unknown),
            })]);
        }

        // 2) Top ∧ X = X
        if self.kind.variants.is_empty() {
            return SmallVec::from_slice(other.kind.variants);
        }

        // 3) X ∧ Top = X
        if other.kind.variants.is_empty() {
            return SmallVec::from_slice(self.kind.variants);
        }

        let mut variants =
            SmallVec::with_capacity(self.kind.variants.len() + other.kind.variants.len());
        variants.extend_from_slice(self.kind.variants);
        variants.extend_from_slice(other.kind.variants);

        variants.sort_unstable();
        variants.dedup();

        variants
    }

    fn is_bottom(self: Type<'heap, Self>, env: &mut TypeAnalysisEnvironment<'_, 'heap>) -> bool {
        self.kind.variants.iter().any(|&id| env.is_bottom(id))
    }

    fn is_top(self: Type<'heap, Self>, _: &mut TypeAnalysisEnvironment<'_, 'heap>) -> bool {
        self.kind.variants.is_empty()
    }

    fn is_subtype_of(
        self: Type<'heap, Self>,
        supertype: Type<'heap, Self>,
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        todo!()
    }

    fn simplify(self: Type<'heap, Self>, env: &mut SimplifyEnvironment<'_, 'heap>) -> TypeId {
        todo!()
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
