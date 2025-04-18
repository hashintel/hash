use pretty::RcDoc;
use smallvec::SmallVec;

use super::TypeKind;
use crate::r#type::{
    Type, TypeId,
    environment::{
        Environment, LatticeEnvironment, SimplifyEnvironment, TypeAnalysisEnvironment,
        UnificationEnvironment,
    },
    error::union_variant_mismatch,
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

    fn is_uninhabited(self: Type<'heap, Self>, _: &mut TypeAnalysisEnvironment<'_, 'heap>) -> bool {
        self.kind.variants.is_empty()
    }

    fn is_subtype_of(
        self: Type<'heap, Self>,
        supertype: Type<'heap, Self>,
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        // Unnest the variants to handle nested unions correctly
        let self_variants = self.kind.unnest(env);
        let super_variants = supertype.kind.unnest(env);

        // Empty union (corresponds to the Never type) is a subtype of any union type
        if self_variants.is_empty() {
            return true;
        }

        // If the supertype is empty, only an empty subtype can be a subtype of it
        if super_variants.is_empty() {
            // TODO: record issue

            return false; // We already checked that self is not empty
        }

        let mut compatible = true;

        // A union type is a subtype of another union type if every variant in the subtype
        // is a subtype of at least one variant in the supertype
        for self_variant in self_variants {
            // For each variant in the subtype, check if it's a subtype of any variant in the
            // supertype

            // try to find at least one match in the super‐variants
            let mut found = false;
            for &super_variant in &super_variants {
                if env.in_covariant(|env| env.is_subtype_of(self_variant, super_variant)) {
                    found = true;
                    break;
                }
            }

            if !found {
                // no match for this self_var → emit exactly one diagnostic
                let should_break = env
                    .record_diagnostic(|env| {
                        union_variant_mismatch(env, env.types[self_variant].copied(), supertype)
                    })
                    .is_break();

                compatible = false;
                if should_break {
                    return false;
                }
            }
        }

        compatible
    }

    fn is_equivalent(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        let lhs_variants = self.kind.unnest(env);
        let rhs_variants = other.kind.unnest(env);

        if lhs_variants.len() != rhs_variants.len() {
            return false;
        }

        // For every variant x in lhs_variants, there exists a y in rhs_variants where x ≡ y
        lhs_variants.iter().all(|&lhs_variant| {
            rhs_variants
                .iter()
                .any(|&rhs_variant| env.is_equivalent(lhs_variant, rhs_variant))
        })
    }

    fn unify(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut UnificationEnvironment<'_, 'heap>,
    ) {
        // For each variant in `other` (the provided type), check if it's a subtype of at least one
        // variant in `self`
        //
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
            !backup.iter().any(|&u| env.is_subtype_of(u, v))
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
