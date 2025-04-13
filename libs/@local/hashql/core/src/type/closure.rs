use ecow::EcoVec;
use pretty::RcDoc;

use super::{
    Type, TypeId,
    error::function_parameter_count_mismatch,
    generic_argument::GenericArguments,
    pretty_print::{PrettyPrint, RecursionLimit},
    unify::{UnificationArena, UnificationContext},
    unify_type,
};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ClosureType {
    pub params: EcoVec<TypeId>,
    pub return_type: TypeId,

    pub body: TypeId,

    pub arguments: GenericArguments,
}

impl PrettyPrint for ClosureType {
    fn pretty<'a>(
        &'a self,
        arena: &'a UnificationArena,
        limit: RecursionLimit,
    ) -> pretty::RcDoc<'a, anstyle::Style> {
        self.arguments
            .pretty(arena, limit)
            .append(RcDoc::text("("))
            .append(
                RcDoc::intersperse(
                    self.params
                        .iter()
                        .map(|&param| limit.pretty(&arena[param], arena)),
                    RcDoc::text(",").append(RcDoc::line()),
                )
                .nest(1)
                .group(),
            )
            .append(RcDoc::text(")"))
            .append(RcDoc::line())
            .append(RcDoc::text("->"))
            .append(RcDoc::line())
            .append(limit.pretty(&arena[self.return_type], arena))
    }
}

/// Unifies closure types, respecting variance without concern for backward compatibility.
///
/// In a covariant context (checking if `rhs <: lhs`):
/// - Parameters are contravariant (checked with reversed subtyping relationship)
/// - Return type is covariant (checked with standard subtyping relationship)
/// - Parameter count must match exactly (invariant)
///
/// This follows standard function subtyping rules where:
/// - A function is a subtype of another if it accepts a wider range of inputs
/// - And produces a narrower range of outputs
pub(crate) fn unify_closure(
    context: &mut UnificationContext,
    lhs: &Type<ClosureType>,
    rhs: &Type<ClosureType>,
) {
    // Function parameter count is invariant
    if lhs.kind.params.len() != rhs.kind.params.len() {
        // Create diagnostic for parameter count mismatch
        let diagnostic = function_parameter_count_mismatch(
            context.source,
            lhs,
            rhs,
            lhs.kind.params.len(),
            rhs.kind.params.len(),
        );

        context.record_diagnostic(diagnostic);
        return;
    }

    // Enter generic argument scope for both closures
    lhs.kind.arguments.enter_scope(context);
    rhs.kind.arguments.enter_scope(context);

    // Parameters are contravariant
    // This means lhs parameters must be subtypes of rhs parameters
    // (lhs params can accept a wider range of inputs than rhs params)
    for (&lhs_param, &rhs_param) in lhs.kind.params.iter().zip(rhs.kind.params.iter()) {
        context.in_contravariant(|ctx| {
            unify_type(ctx, lhs_param, rhs_param);
        });
    }

    // Return type is covariant
    // This means rhs return type must be a subtype of lhs return type
    // (rhs can return a more specific type than lhs requires)
    context.in_covariant(|ctx| {
        unify_type(ctx, lhs.kind.return_type, rhs.kind.return_type);
    });

    // Clean up generic argument scope
    rhs.kind.arguments.exit_scope(context);
    lhs.kind.arguments.exit_scope(context);

    // We don't unify the body of the closure - that's handled elsewhere during type checking
    // In a strictly variance-aware system, we do NOT modify the closure types
    // Each closure maintains its original structure, preserving identity and subtyping
    // relationships
}
