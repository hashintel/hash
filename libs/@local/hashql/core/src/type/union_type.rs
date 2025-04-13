use ecow::EcoVec;
use hashql_diagnostics::{Diagnostic, help::Help, label::Label, severity::Severity};
use pretty::RcDoc;

use super::{
    Type, TypeId,
    error::TypeCheckDiagnosticCategory,
    pretty_print::{PrettyPrint, RecursionLimit},
    unify::{UnificationArena, UnificationContext},
};
use crate::arena::Arena;

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

/// Unifies union types, respecting variance without concern for backward compatibility.
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

        // Keep track of diagnostics before attempting to unify with each lhs variant
        let diagnostics_before = context.diagnostics.len();
        let mut all_diagnostics = Vec::new();

        // Try to unify with each lhs variant
        for &lhs_variant in &lhs.kind.variants {
            // Save diagnostics state before this attempt
            let variant_diagnostics_before = context.diagnostics.len();

            // Try to unify this specific pair of variants
            // In covariant context, we check if rhs_variant <: lhs_variant
            context.in_covariant(|ctx| {
                super::unify_type(ctx, lhs_variant, rhs_variant);
            });

            // If no new diagnostics were added, this variant pair is compatible
            if context.diagnostics.len() == variant_diagnostics_before {
                compatible_variant_found = true;
                break;
            } else {
                // Save diagnostics from this attempt before continuing
                let new_diagnostics = context.diagnostics[variant_diagnostics_before..].to_vec();
                all_diagnostics.extend(new_diagnostics);

                // Remove these diagnostics so we can try the next variant
                context.diagnostics.truncate(variant_diagnostics_before);
            }
        }

        // If this rhs variant isn't a subtype of any lhs variant, report an error
        if !compatible_variant_found {
            // Restore all collected diagnostics
            context.diagnostics.extend(all_diagnostics);

            // Get the rhs variant type for the error message
            let rhs_variant_type = &context.arena[rhs_variant];

            // Create a helpful error message
            let message = format!(
                "The variant {} in this union type is not compatible with any variant in the \
                 expected type. Every variant in a union must be compatible with at least one \
                 variant in the expected type.",
                rhs_variant_type.kind.pretty_print(&context.arena, 80)
            );

            // Generate a custom diagnostic
            let mut diagnostic =
                Diagnostic::new(TypeCheckDiagnosticCategory::TypeMismatch, Severity::ERROR);

            diagnostic
                .labels
                .push(Label::new(context.source, "Incompatible union variant").with_order(1));

            diagnostic.help = Some(Help::new(message));

            // Only record the diagnostic but don't mark the types as errors
            // This prevents error propagation that would mask the real issue
            context.record_diagnostic(diagnostic);
            return;
        }
    }

    // If we reach here, every rhs variant is a subtype of at least one lhs variant
    // In a strictly variance-aware system, we do NOT modify the union types
    // Each union maintains its original variants, preserving their identity and subtyping
    // relationships
}
