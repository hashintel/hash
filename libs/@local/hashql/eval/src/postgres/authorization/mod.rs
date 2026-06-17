//! Grafts actor-specific authorization onto compiled queries at runtime.
//!
//! The compilation pipeline produces actor-agnostic queries. This module patches
//! them with two kinds of runtime conditions:
//!
//! - **Policy** ([`policy`]): permit/forbid admission conditions added to WHERE
//! - **Protection** ([`protection`]): property masking applied inside the entity_editions LATERAL
//!   subquery
use core::alloc::Allocator;

use hash_graph_authorization::policies::PolicyComponents;
use hash_graph_postgres_store::store::postgres::query::SelectStatement;
use hash_graph_store::filter::protection::PropertyProtectionFilterConfig;
use hashql_mir::pass::execution::VertexType;

use self::{
    policy::{PolicyTranslation, PolicyTranslationUnit},
    protection::{ProtectionTranslation, ProtectionTranslationUnit},
};
use super::prepared::PatchContext;

mod policy;
mod protection;

pub struct AuthorizationPatch<'policy, 'path> {
    policy: &'policy PolicyComponents,
    properties: &'policy PropertyProtectionFilterConfig<'path>,
}

// impl<A: Allocator + Clone, S: Allocator> PatchPreparedQuery<A, S> for AuthorizationPatch<'_, '_>
// {     fn patch_statement(
//         &mut self,
//         context: &mut PatchContext<'_, '_, A>,
//         statement: &mut SelectStatement,
//         scratch: S,
//     ) {
//         let mut policy = PolicyTranslationUnit {
//             projections: context.projections,
//             parameters: context.parameters,
//             actor_id: self.policy.actor_id(),
//             alloc: context.alloc.clone(),
//         };
//         let PolicyTranslation { condition } =
//             policy.transpile(context.vertex_type, self.policy, &scratch);
//         statement.where_expression.add_condition(condition);

//         // TODO: skip if entity_editions isn't requested
//         let mut protection = ProtectionTranslationUnit {
//             projections: context.projections,
//             parameters: context.parameters,
//             actor_id: self.policy.actor_id(),
//         };
//         let ProtectionTranslation { keys_to_remove } =
//             protection.transpile(self.policy, self.properties);

//         // we must now find the entity_editions column, and apply the filter if it exists, this
// is         // done by simply scanning the from items for the name which we gave it

//         todo!()
//     }
// }
