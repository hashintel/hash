mod entity;
mod trie;

#[cfg(test)]
mod tests;

use self::entity::ENTITY_PATHS;
pub(crate) use self::trie::Access;
use crate::body::place::{Projection, ProjectionKind};

/// Determines which backend can access an entity field projection.
///
/// Walks the projection path through the entity schema trie to determine whether the field is
/// stored in Postgres (as a column or JSONB path) or in the embedding store. Returns `None` if
/// the path doesn't map to any supported backend storage.
///
/// For example:
/// - `entity.properties.foo` → `Some(Access::Postgres(Direct))` (JSONB)
/// - `entity.encodings.vectors` → `Some(Access::Embedding(Direct))`
/// - `entity.metadata.record_id.entity_id.web_id` → `Some(Access::Postgres(Direct))`
pub(crate) fn entity_projection_access(projections: &[Projection<'_>]) -> Option<Access> {
    let mut node = &ENTITY_PATHS;

    for projection in projections {
        if node.children.is_empty() {
            return node.otherwise;
        }

        let ProjectionKind::FieldByName(name) = projection.kind else {
            return node.otherwise;
        };

        let Some(next_node) = node.lookup(name) else {
            return node.otherwise;
        };

        node = next_node;
    }

    node.access
}
