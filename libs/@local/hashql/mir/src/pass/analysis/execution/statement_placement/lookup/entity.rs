use hashql_core::symbol::sym;

use super::trie::{Access, AccessMode, PathNode};

/// Entity path access trie mapping field paths to backend access types.
///
/// The trie structure mirrors the entity schema, with paths mapping to their storage location:
///
/// - `properties` → JSONB column in `entity_editions`
/// - `encodings.vectors` → Embedding backend
/// - `metadata.*` → Various columns in `entity_temporal_metadata`, `entity_editions`, etc.
/// - `link_data.*` → `entity_edge` table via joins
///
/// Entry point is the `entity_temporal_metadata` table which joins to `entity_ids`,
/// `entity_editions`, `entity_is_of_type`, and `entity_edge`.
// The static ref here is required, so that the symbols are not duplicated across crates and have
// the same interned string.
pub(super) static ENTITY_PATHS: PathNode = PathNode::root(&[
    // entity_editions.properties (JSONB)
    PathNode::jsonb(sym::properties),
    // (tbd) encodings
    PathNode::branch(
        sym::encodings,
        None,
        &[
            // Vectors are stored outside the entity inside of an embeddings database
            PathNode::branch(sym::vectors, Access::Embedding(AccessMode::Direct), &[]),
        ],
    ),
    PathNode::branch(
        sym::metadata,
        None,
        &[
            // entity_temporal_metadata: web_id, entity_uuid, draft_id, entity_edition_id
            PathNode::branch(
                sym::record_id,
                Access::Postgres(AccessMode::Composite),
                &[
                    // entity_temporal_metadata: web_id, entity_uuid, draft_id
                    PathNode::branch(
                        sym::entity_id,
                        Access::Postgres(AccessMode::Composite),
                        &[
                            // entity_temporal_metadata.web_id
                            PathNode::leaf(sym::web_id, Access::Postgres(AccessMode::Direct)),
                            // entity_temporal_metadata.entity_uuid
                            PathNode::leaf(sym::entity_uuid, Access::Postgres(AccessMode::Direct)),
                            // entity_temporal_metadata.draft_id
                            PathNode::leaf(sym::draft_id, Access::Postgres(AccessMode::Direct)),
                        ],
                    ),
                    // entity_temporal_metadata.entity_edition_id
                    PathNode::leaf(sym::edition_id, Access::Postgres(AccessMode::Direct)),
                ],
            ),
            // entity_temporal_metadata: decision_time, transaction_time
            PathNode::branch(
                sym::temporal_versioning,
                Access::Postgres(AccessMode::Composite),
                &[
                    // entity_temporal_metadata.decision_time
                    PathNode::leaf(sym::decision_time, Access::Postgres(AccessMode::Direct)),
                    // entity_temporal_metadata.transaction_time
                    PathNode::leaf(sym::transaction_time, Access::Postgres(AccessMode::Direct)),
                ],
            ),
            // entity_is_of_type (via JOIN)
            PathNode::leaf(sym::entity_type_ids, Access::Postgres(AccessMode::Direct)),
            // entity_editions.archived
            PathNode::leaf(sym::archived, Access::Postgres(AccessMode::Direct)),
            // entity_editions.confidence
            PathNode::leaf(sym::confidence, Access::Postgres(AccessMode::Direct)),
            // spans entity_ids.provenance + entity_editions.provenance
            PathNode::branch(
                sym::provenance,
                None,
                &[
                    // entity_ids.provenance (JSONB)
                    PathNode::jsonb(sym::inferred),
                    // entity_editions.provenance (JSONB)
                    PathNode::jsonb(sym::edition),
                ],
            ),
            // entity_editions.property_metadata (JSONB)
            PathNode::jsonb(sym::properties),
        ],
    ),
    // contains synthesized draft_id fields
    PathNode::branch(
        sym::link_data,
        None,
        &[
            // draft_id is synthesized (always None), not stored
            PathNode::branch(
                sym::left_entity_id,
                None,
                &[
                    // entity_has_left_entity -> entity_edge.target_web_id
                    PathNode::leaf(sym::web_id, Access::Postgres(AccessMode::Direct)),
                    // entity_has_left_entity -> entity_edge.target_entity_uuid
                    PathNode::leaf(sym::entity_uuid, Access::Postgres(AccessMode::Direct)),
                    // synthesized, not in entity_edge
                    PathNode::leaf(sym::draft_id, None),
                ],
            ),
            // draft_id is synthesized (always None), not stored
            PathNode::branch(
                sym::right_entity_id,
                None,
                &[
                    // entity_has_right_entity -> entity_edge.target_web_id
                    PathNode::leaf(sym::web_id, Access::Postgres(AccessMode::Direct)),
                    // entity_has_right_entity -> entity_edge.target_entity_uuid
                    PathNode::leaf(sym::entity_uuid, Access::Postgres(AccessMode::Direct)),
                    // synthesized, not in entity_edge
                    PathNode::leaf(sym::draft_id, None),
                ],
            ),
            // entity_edge.confidence (via entity_has_left_entity)
            PathNode::leaf(
                sym::left_entity_confidence,
                Access::Postgres(AccessMode::Direct),
            ),
            // entity_edge.provenance (JSONB, via entity_has_left_entity)
            PathNode::jsonb(sym::left_entity_provenance),
            // entity_edge.confidence (via entity_has_right_entity)
            PathNode::leaf(
                sym::right_entity_confidence,
                Access::Postgres(AccessMode::Direct),
            ),
            // entity_edge.provenance (JSONB, via entity_has_right_entity)
            PathNode::jsonb(sym::right_entity_provenance),
        ],
    ),
]);
