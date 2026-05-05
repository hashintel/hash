//! Unit tests for entity projection path lookup.

use hashql_core::{symbol::sym, r#type::TypeId};

use super::access::{Access, AccessMode};
use crate::{
    body::{
        local::Local,
        place::{Projection, ProjectionKind},
    },
    pass::execution::storage::EntityPath,
};

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
    let projections = &[proj(sym::properties)];
    let access = EntityPath::resolve(projections).map(|(path, _)| path.access());

    assert_eq!(access, Some(Access::Postgres(AccessMode::Direct)));
}

/// `[.properties.foo.bar]` → Postgres (JSONB otherwise).
///
/// JSONB nodes have `otherwise` set, so any sub-path is also Postgres-accessible.
#[test]
fn properties_subpath_is_postgres() {
    let projections = &[proj(sym::properties), proj(sym::foo), proj(sym::bar)];
    let access = EntityPath::resolve(projections).map(|(path, _)| path.access());

    assert_eq!(access, Some(Access::Postgres(AccessMode::Direct)));
}

/// `[.encodings.vectors]` → `Access::Embedding(Direct)`.
#[test]
fn vectors_is_embedding() {
    let projections = &[proj(sym::encodings), proj(sym::vectors)];
    let access = EntityPath::resolve(projections).map(|(path, _)| path.access());

    assert_eq!(access, Some(Access::Embedding(AccessMode::Direct)));
}

/// Various metadata paths map to Postgres columns.
#[test]
fn metadata_columns_are_postgres() {
    // metadata.archived -> Direct
    let projections = &[proj(sym::metadata), proj(sym::archived)];
    assert_eq!(
        EntityPath::resolve(projections).map(|(path, _)| path.access()),
        Some(Access::Postgres(AccessMode::Direct))
    );

    // metadata.record_id -> Composite
    let projections = &[proj(sym::metadata), proj(sym::record_id)];
    assert_eq!(
        EntityPath::resolve(projections).map(|(path, _)| path.access()),
        Some(Access::Postgres(AccessMode::Composite))
    );

    // metadata.record_id.entity_id.web_id -> Direct
    let projections = &[
        proj(sym::metadata),
        proj(sym::record_id),
        proj(sym::entity_id),
        proj(sym::web_id),
    ];
    assert_eq!(
        EntityPath::resolve(projections).map(|(path, _)| path.access()),
        Some(Access::Postgres(AccessMode::Direct))
    );

    // metadata.temporal_versioning.decision_time -> Direct
    let projections = &[
        proj(sym::metadata),
        proj(sym::temporal_versioning),
        proj(sym::decision_time),
    ];
    assert_eq!(
        EntityPath::resolve(projections).map(|(path, _)| path.access()),
        Some(Access::Postgres(AccessMode::Direct))
    );
}

/// `link_data.left_entity_id.draft_id` → `None` (synthesized, not stored).
#[test]
fn link_data_synthesized_is_none() {
    let projections = &[
        proj(sym::link_data),
        proj(sym::left_entity_id),
        proj(sym::draft_id),
    ];
    let access = EntityPath::resolve(projections).map(|(path, _)| path.access());

    assert_eq!(access, None);
}

/// Invalid path like `[.unknown]` → `None`.
#[test]
fn unknown_path_returns_none() {
    let projections = &[proj(sym::unknown)];
    let access = EntityPath::resolve(projections).map(|(path, _)| path.access());

    assert_eq!(access, None);
}

/// The returned index reflects how many projections were consumed during resolution.
#[test]
fn index_counts_consumed_projections() {
    // Single-segment: `.properties` consumes 1
    let projections = &[proj(sym::properties)];
    assert_eq!(
        EntityPath::resolve(projections),
        Some((EntityPath::Properties, 1))
    );

    // Two segments: `.encodings.vectors` consumes 2
    let projections = &[proj(sym::encodings), proj(sym::vectors)];
    assert_eq!(
        EntityPath::resolve(projections),
        Some((EntityPath::Vectors, 2))
    );

    // Three segments: `.metadata.provenance.inferred` consumes 3
    let projections = &[
        proj(sym::metadata),
        proj(sym::provenance),
        proj(sym::inferred),
    ];
    assert_eq!(
        EntityPath::resolve(projections),
        Some((EntityPath::ProvenanceInferred, 3))
    );

    // Four segments: `.metadata.record_id.entity_id.web_id` consumes 4
    let projections = &[
        proj(sym::metadata),
        proj(sym::record_id),
        proj(sym::entity_id),
        proj(sym::web_id),
    ];
    assert_eq!(
        EntityPath::resolve(projections),
        Some((EntityPath::WebId, 4))
    );
}

/// Composite paths that stop early via `next!(else ...)` return the correct index.
#[test]
fn index_for_composite_early_exit() {
    // `.metadata.record_id` with no further projections → RecordId at index 2
    let projections = &[proj(sym::metadata), proj(sym::record_id)];
    assert_eq!(
        EntityPath::resolve(projections),
        Some((EntityPath::RecordId, 2))
    );

    // `.metadata.record_id.entity_id` without a leaf → EntityId at index 3
    let projections = &[
        proj(sym::metadata),
        proj(sym::record_id),
        proj(sym::entity_id),
    ];
    assert_eq!(
        EntityPath::resolve(projections),
        Some((EntityPath::EntityId, 3))
    );

    // `.metadata.temporal_versioning` without a leaf → TemporalVersioning at index 2
    let projections = &[proj(sym::metadata), proj(sym::temporal_versioning)];
    assert_eq!(
        EntityPath::resolve(projections),
        Some((EntityPath::TemporalVersioning, 2))
    );
}

/// A non-FieldByName projection (e.g. `Index`) after a composite node must return `None`, not
/// the composite path. Previously the `next!(else ...)` macro conflated "no more projections" with
/// "non-FieldByName projection", bypassing the exhaustion guard.
#[test]
fn non_field_projection_after_composite_returns_none() {
    let index_projection = Projection {
        kind: ProjectionKind::Index(Local::new(0)),
        r#type: TypeId::PLACEHOLDER,
    };

    // `.metadata.record_id` followed by an index projection: not a valid entity path
    let projections = &[proj(sym::metadata), proj(sym::record_id), index_projection];
    assert_eq!(EntityPath::resolve(projections), None);

    // `.metadata.record_id.entity_id` followed by an index projection
    let projections = &[
        proj(sym::metadata),
        proj(sym::record_id),
        proj(sym::entity_id),
        index_projection,
    ];
    assert_eq!(EntityPath::resolve(projections), None);

    // `.metadata.temporal_versioning` followed by an index projection
    let projections = &[
        proj(sym::metadata),
        proj(sym::temporal_versioning),
        index_projection,
    ];
    assert_eq!(EntityPath::resolve(projections), None);
}

/// JSONB paths stop consuming at the storage boundary; sub-path projections are excess.
#[test]
fn jsonb_index_excludes_subpath() {
    // `.properties.foo.bar` → Properties at index 1, leaving 2 excess projections
    let projections = &[proj(sym::properties), proj(sym::foo), proj(sym::bar)];
    assert_eq!(
        EntityPath::resolve(projections),
        Some((EntityPath::Properties, 1))
    );

    // `.metadata.provenance.inferred.foo.bar` → ProvenanceInferred at index 3
    let projections = &[
        proj(sym::metadata),
        proj(sym::provenance),
        proj(sym::inferred),
        proj(sym::foo),
        proj(sym::bar),
    ];
    assert_eq!(
        EntityPath::resolve(projections),
        Some((EntityPath::ProvenanceInferred, 3))
    );
}
