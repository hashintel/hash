//! Unit tests for entity projection path lookup.

use hashql_core::{symbol::sym, r#type::TypeId};

use super::{
    entity_projection_access,
    trie::{Access, AccessMode},
};
use crate::body::place::{Projection, ProjectionKind};

/// Helper to create a `FieldByName` projection.
fn proj(name: impl Into<hashql_core::symbol::Symbol<'static>>) -> Projection<'static> {
    Projection {
        kind: ProjectionKind::FieldByName(name.into()),
        r#type: TypeId::PLACEHOLDER,
    }
}

/// `[.properties]` → `Access::Postgres(Direct)` (JSONB column).
#[test]
fn properties_is_postgres() {
    let projections = &[proj(sym::lexical::properties)];
    let access = entity_projection_access(projections);

    assert_eq!(access, Some(Access::Postgres(AccessMode::Direct)));
}

/// `[.properties.foo.bar]` → Postgres (JSONB otherwise).
///
/// JSONB nodes have `otherwise` set, so any sub-path is also Postgres-accessible.
#[test]
fn properties_subpath_is_postgres() {
    let projections = &[
        proj(sym::lexical::properties),
        proj(sym::lexical::foo),
        proj(sym::lexical::bar),
    ];
    let access = entity_projection_access(projections);

    assert_eq!(access, Some(Access::Postgres(AccessMode::Direct)));
}

/// `[.encodings.vectors]` → `Access::Embedding(Direct)`.
#[test]
fn vectors_is_embedding() {
    let projections = &[proj(sym::lexical::encodings), proj(sym::lexical::vectors)];
    let access = entity_projection_access(projections);

    assert_eq!(access, Some(Access::Embedding(AccessMode::Direct)));
}

/// Various metadata paths map to Postgres columns.
#[test]
fn metadata_columns_are_postgres() {
    // metadata.archived -> Direct
    let projections = &[proj(sym::lexical::metadata), proj(sym::lexical::archived)];
    assert_eq!(
        entity_projection_access(projections),
        Some(Access::Postgres(AccessMode::Direct))
    );

    // metadata.record_id -> Composite
    let projections = &[proj(sym::lexical::metadata), proj(sym::lexical::record_id)];
    assert_eq!(
        entity_projection_access(projections),
        Some(Access::Postgres(AccessMode::Composite))
    );

    // metadata.record_id.entity_id.web_id -> Direct
    let projections = &[
        proj(sym::lexical::metadata),
        proj(sym::lexical::record_id),
        proj(sym::lexical::entity_id),
        proj(sym::lexical::web_id),
    ];
    assert_eq!(
        entity_projection_access(projections),
        Some(Access::Postgres(AccessMode::Direct))
    );

    // metadata.temporal_versioning.decision_time -> Direct
    let projections = &[
        proj(sym::lexical::metadata),
        proj(sym::lexical::temporal_versioning),
        proj(sym::lexical::decision_time),
    ];
    assert_eq!(
        entity_projection_access(projections),
        Some(Access::Postgres(AccessMode::Direct))
    );
}

/// `link_data.left_entity_id.draft_id` → `None` (synthesized, not stored).
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

/// Invalid path like `[.unknown]` → `None`.
#[test]
fn unknown_path_returns_none() {
    let projections = &[proj(sym::lexical::unknown)];
    let access = entity_projection_access(projections);

    assert_eq!(access, None);
}
