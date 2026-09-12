//! Priority lookup through existing rank and identity providers.
//!
//! Identity ordering extends the base priorities without allocating another per-node index.

use super::overlay::VersionedIdentityProvider;
use crate::{
    identity::NodeRowId,
    postgres::id::ArchivedEntityId,
    serve::world::node_importance::{ImportanceProvider, NodePriority},
};

#[cfg(test)]
mod tests;

pub(super) struct DeltaImportanceProvider<B, I> {
    base: B,
    identities: I,
}

impl<B, I> DeltaImportanceProvider<B, I> {
    pub(super) const fn from_parts(base: B, identities: I) -> Self {
        Self { base, identities }
    }
}

impl<B, I> ImportanceProvider for DeltaImportanceProvider<B, I>
where
    B: ImportanceProvider,
    I: VersionedIdentityProvider<ArchivedEntityId, NodeRowId>,
{
    fn provide_priority(&self, node: NodeRowId) -> Option<NodePriority> {
        self.base.provide_priority(node).or_else(|| {
            self.identities
                .provide_allocated_key_of(node)
                .map(NodePriority::Identity)
        })
    }
}
