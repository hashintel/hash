mod entity;
mod trie;

use self::entity::ENTITY_PATHS;
pub(crate) use self::trie::Access;
use crate::body::place::{Projection, ProjectionKind};

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
