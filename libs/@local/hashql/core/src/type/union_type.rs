use ecow::EcoVec;
use pretty::RcDoc;

use super::{
    Type, TypeId, TypeKind,
    error::union_variant_mismatch,
    pretty_print::{PrettyPrint, RecursionLimit},
    unify::{UnificationArena, UnificationContext},
};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct UnionType {
    pub variants: EcoVec<TypeId>,
}

impl PrettyPrint for UnionType {
    fn pretty<'a>(
        &'a self,
        arena: &'a UnificationArena,
        limit: RecursionLimit,
    ) -> pretty::RcDoc<'a, anstyle::Style> {
        RcDoc::intersperse(
            self.variants
                .iter()
                .map(|&variant| limit.pretty(&arena[variant], arena)),
            RcDoc::line()
                .append(RcDoc::text("|"))
                .append(RcDoc::space()),
        )
        .nest(1)
        .group()
    }
}

/// Unifies union types
///
/// In a covariant context (checking if `rhs <: lhs`):
/// - For each variant in `rhs`, it must be a subtype of at least one variant in `lhs`
/// - This is the correct union subtyping rule: (A | B) <: C if and only if A <: C and B <: C
///
/// For example, if `lhs` is `Number | String` and `rhs` is `Integer | String`,
/// this would be valid because:
/// - `Integer <: Number`, so the `Integer` variant in `rhs` is covered
/// - `String <: String`, so the `String` variant in `rhs` is covered
pub(crate) fn unify_union(
    context: &mut UnificationContext,
    lhs: &Type<UnionType>,
    rhs: &Type<UnionType>,
) {
    // For each variant in rhs (the provided type), check if it's a subtype of at least one lhs
    // variant
    for &rhs_variant in &rhs.kind.variants {
        // We need to find at least one lhs variant that this rhs variant is a subtype of
        let mut compatible_variant_found = false;

        for &lhs_variant in &lhs.kind.variants {
            let diagnostics = context.diagnostics.len();

            context.in_transaction(|context| {
                // Try to unify this specific pair of variants
                // In covariant context, we check if rhs_variant <: lhs_variant
                context.in_covariant(|ctx| {
                    super::unify_type(ctx, lhs_variant, rhs_variant);
                });

                if context.diagnostics.len() == diagnostics {
                    compatible_variant_found = true;

                    true
                } else {
                    false
                }
            });
        }

        if !compatible_variant_found {
            let diagnostic =
                union_variant_mismatch(rhs.span, &context.arena, &context.arena[rhs_variant], lhs);

            context.record_diagnostic(diagnostic);
            context.mark_error(rhs_variant);
        }
    }

    // If we reach here, every rhs variant is a subtype of at least one lhs variant
    // In a strictly variance-aware system, we do NOT modify the union types.
    // Each union maintains its original variants, preserving their identity and subtyping
    // relationships

    // TODO: flatten union type iff not "virtual"
}

pub(crate) fn unify_union_lhs(
    context: &mut UnificationContext,
    lhs: &Type<UnionType>,
    rhs: &Type<TypeKind>,
) {
    let rhs = rhs.as_ref().map(|_| UnionType {
        variants: EcoVec::from([rhs.id]),
    });

    unify_union(context, lhs, &rhs);
}

pub(crate) fn unify_union_rhs(
    context: &mut UnificationContext,
    lhs: &Type<TypeKind>,
    rhs: &Type<UnionType>,
) {
    let lhs = lhs.as_ref().map(|_| UnionType {
        variants: EcoVec::from([lhs.id]),
    });

    unify_union(context, &lhs, rhs);
}
