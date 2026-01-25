use hashql_core::symbol::sym;

use super::trie::{Access, PathNode};
use crate::body::place::{Projection, ProjectionKind};

/// Entity path access trie for Postgres pushability.
///
/// Entry point: `entity_temporal_metadata` table, which joins to `entity_ids`,
/// `entity_editions`, `entity_is_of_type`, and `entity_edge`.
static ENTITY_PATHS: PathNode = PathNode::root(
    Access::None,
    &[
        // entity_editions.properties (JSONB)
        PathNode::jsonb(sym::lexical::properties),
        PathNode::branch(
            sym::lexical::metadata,
            Access::None,
            &[
                // entity_temporal_metadata: web_id, entity_uuid, draft_id, entity_edition_id
                PathNode::branch(
                    sym::lexical::record_id,
                    Access::Composite,
                    &[
                        // entity_temporal_metadata: web_id, entity_uuid, draft_id
                        PathNode::branch(
                            sym::lexical::entity_id,
                            Access::Composite,
                            &[
                                // entity_temporal_metadata.web_id
                                PathNode::leaf(sym::lexical::web_id, Access::Direct),
                                // entity_temporal_metadata.entity_uuid
                                PathNode::leaf(sym::lexical::entity_uuid, Access::Direct),
                                // entity_temporal_metadata.draft_id
                                PathNode::leaf(sym::lexical::draft_id, Access::Direct),
                            ],
                        ),
                        // entity_temporal_metadata.entity_edition_id
                        PathNode::leaf(sym::lexical::edition_id, Access::Direct),
                    ],
                ),
                // entity_temporal_metadata: decision_time, transaction_time
                PathNode::branch(
                    sym::lexical::temporal_versioning,
                    Access::Composite,
                    &[
                        // entity_temporal_metadata.decision_time
                        PathNode::leaf(sym::lexical::decision_time, Access::Direct),
                        // entity_temporal_metadata.transaction_time
                        PathNode::leaf(sym::lexical::transaction_time, Access::Direct),
                    ],
                ),
                // entity_is_of_type (via JOIN)
                PathNode::leaf(sym::lexical::entity_type_ids, Access::Direct),
                // entity_editions.archived
                PathNode::leaf(sym::lexical::archived, Access::Direct),
                // entity_editions.confidence
                PathNode::leaf(sym::lexical::confidence, Access::Direct),
                // spans entity_ids.provenance + entity_editions.provenance
                PathNode::branch(
                    sym::lexical::provenance,
                    Access::None,
                    &[
                        // entity_ids.provenance (JSONB)
                        PathNode::jsonb(sym::lexical::inferred),
                        // entity_editions.provenance (JSONB)
                        PathNode::jsonb(sym::lexical::edition),
                    ],
                ),
                // entity_editions.property_metadata (JSONB)
                PathNode::jsonb(sym::lexical::properties),
            ],
        ),
        // contains synthesized draft_id fields
        PathNode::branch(
            sym::lexical::link_data,
            Access::None,
            &[
                // draft_id is synthesized (always None), not stored
                PathNode::branch(
                    sym::lexical::left_entity_id,
                    Access::None,
                    &[
                        // entity_has_left_entity -> entity_edge.target_web_id
                        PathNode::leaf(sym::lexical::web_id, Access::Direct),
                        // entity_has_left_entity -> entity_edge.target_entity_uuid
                        PathNode::leaf(sym::lexical::entity_uuid, Access::Direct),
                        // synthesized, not in entity_edge
                        PathNode::leaf(sym::lexical::draft_id, Access::None),
                    ],
                ),
                // draft_id is synthesized (always None), not stored
                PathNode::branch(
                    sym::lexical::right_entity_id,
                    Access::None,
                    &[
                        // entity_has_right_entity -> entity_edge.target_web_id
                        PathNode::leaf(sym::lexical::web_id, Access::Direct),
                        // entity_has_right_entity -> entity_edge.target_entity_uuid
                        PathNode::leaf(sym::lexical::entity_uuid, Access::Direct),
                        // synthesized, not in entity_edge
                        PathNode::leaf(sym::lexical::draft_id, Access::None),
                    ],
                ),
                // entity_edge.confidence (via entity_has_left_entity)
                PathNode::leaf(sym::lexical::left_entity_confidence, Access::Direct),
                // entity_edge.provenance (JSONB, via entity_has_left_entity)
                PathNode::jsonb(sym::lexical::left_entity_provenance),
                // entity_edge.confidence (via entity_has_right_entity)
                PathNode::leaf(sym::lexical::right_entity_confidence, Access::Direct),
                // entity_edge.provenance (JSONB, via entity_has_right_entity)
                PathNode::jsonb(sym::lexical::right_entity_provenance),
            ],
        ),
    ],
);

pub(crate) fn entity_projection_access(projections: &[Projection<'_>]) -> Access {
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
