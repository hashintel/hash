//! Grafts actor-specific authorization onto compiled queries at runtime.
//!
//! The compilation pipeline produces actor-agnostic queries. This module adds
//! permit/forbid admission conditions to WHERE.
use core::alloc::Allocator;

use hash_graph_authorization::policies::PolicyComponents;
use hash_graph_postgres_store::store::postgres::query::Expression;

use self::policy::{PolicyTranslation, PolicyTranslationUnit};
use super::{
    PatchPreparedQueryLayer,
    prepared::{PatchContext, PatchPreparedQuery},
};

mod policy;
#[cfg(test)]
mod tests;

/// Patch layer that adds actor-specific permit/forbid conditions to WHERE.
pub struct AuthorizationPatch<'policy> {
    policy: &'policy PolicyComponents,
}

impl<'policy> AuthorizationPatch<'policy> {
    #[must_use]
    pub const fn new(policy: &'policy PolicyComponents) -> Self {
        Self { policy }
    }
}

impl<A: Allocator + Clone, S: Allocator> PatchPreparedQueryLayer<A, S> for AuthorizationPatch<'_> {
    fn patch_query<N>(
        &self,
        context: &mut PatchContext<'_, A>,
        query: &mut super::PreparedQuery<'_, A>,
        scratch: S,
        next: &N,
    ) where
        N: PatchPreparedQuery<A, S>,
    {
        let mut policy = PolicyTranslationUnit {
            projections: &mut context.projections,
            parameters: &mut query.auxiliary_parameters,
            actor_id: self.policy.actor_id(),
        };
        let PolicyTranslation { condition } =
            policy.transpile(query.vertex_type, self.policy, &scratch);

        query
            .statement
            .select_clause
            .as_simple_mut()
            .unwrap_or_else(|| unreachable!("prepared queries are always simple queries"))
            .add_condition(condition, |lhs, rhs| Expression::all(vec![lhs, rhs]));

        next.patch_query(context, query, scratch);
    }
}
