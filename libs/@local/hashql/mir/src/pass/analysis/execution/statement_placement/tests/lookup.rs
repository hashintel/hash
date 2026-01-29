//! Unit tests for entity projection access lookup.

use hashql_core::{
    span::SpanId,
    symbol::{Symbol, sym},
};

use crate::{
    body::place::{Projection, ProjectionKind},
    pass::analysis::execution::statement_placement::lookup::{
        Access, AccessMode, entity_projection_access,
    },
};

fn proj(name: Symbol<'_>) -> Projection<'_> {
    Projection {
        kind: ProjectionKind::FieldByName(name),
        span: SpanId::SYNTHETIC,
    }
}

#[test]
fn properties_is_postgres() {
    let projections = &[proj(sym::lexical::properties)];
    let access = entity_projection_access(projections);
    assert_eq!(access, Some(Access::Postgres(AccessMode::Direct)));
}

#[test]
fn properties_subpath_is_postgres() {
    let projections = &[
        proj(sym::lexical::properties),
        proj(Symbol::new_unchecked("foo")),
        proj(Symbol::new_unchecked("bar")),
    ];
    let access = entity_projection_access(projections);
    assert_eq!(access, Some(Access::Postgres(AccessMode::Direct)));
}

#[test]
fn vectors_is_embedding() {
    let projections = &[proj(sym::lexical::encodings), proj(sym::lexical::vectors)];
    let access = entity_projection_access(projections);
    assert_eq!(access, Some(Access::Embedding(AccessMode::Direct)));
}

#[test]
fn metadata_columns_are_postgres() {
    let test_cases = [
        // metadata.record_id.entity_id.web_id
        vec![
            proj(sym::lexical::metadata),
            proj(sym::lexical::record_id),
            proj(sym::lexical::entity_id),
            proj(sym::lexical::web_id),
        ],
        // metadata.record_id.entity_id.entity_uuid
        vec![
            proj(sym::lexical::metadata),
            proj(sym::lexical::record_id),
            proj(sym::lexical::entity_id),
            proj(sym::lexical::entity_uuid),
        ],
        // metadata.record_id.entity_id.draft_id
        vec![
            proj(sym::lexical::metadata),
            proj(sym::lexical::record_id),
            proj(sym::lexical::entity_id),
            proj(sym::lexical::draft_id),
        ],
        // metadata.record_id.edition_id
        vec![
            proj(sym::lexical::metadata),
            proj(sym::lexical::record_id),
            proj(sym::lexical::edition_id),
        ],
        // metadata.temporal_versioning.decision_time
        vec![
            proj(sym::lexical::metadata),
            proj(sym::lexical::temporal_versioning),
            proj(sym::lexical::decision_time),
        ],
        // metadata.archived
        vec![proj(sym::lexical::metadata), proj(sym::lexical::archived)],
    ];

    for projections in test_cases {
        let access = entity_projection_access(&projections);
        assert_eq!(
            access,
            Some(Access::Postgres(AccessMode::Direct)),
            "expected Postgres(Direct) for path: {:?}",
            projections
                .iter()
                .map(|p| match p.kind {
                    ProjectionKind::FieldByName(name) => name.as_str(),
                    _ => "<unknown>",
                })
                .collect::<Vec<_>>()
        );
    }
}

#[test]
fn link_data_synthesized_is_none() {
    let projections = &[
        proj(sym::lexical::link_data),
        proj(sym::lexical::left_entity_id),
        proj(sym::lexical::draft_id),
    ];
    let access = entity_projection_access(projections);
    assert_eq!(access, None);
}

#[test]
fn unknown_path_returns_none() {
    let projections = &[proj(Symbol::new_unchecked("unknown"))];
    let access = entity_projection_access(projections);
    assert_eq!(access, None);
}
