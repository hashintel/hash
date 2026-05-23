//! Unit tests for entity projection path lookup, composite swallowing, transfer sizing,
//! and traversal analysis.

use core::ops::Bound;

use hashql_core::{symbol::sym, r#type::TypeId};

use crate::{
    body::{
        local::Local,
        place::{Projection, ProjectionKind},
    },
    pass::{
        analysis::{
            dataflow::lattice::{
                HasTop as _, JoinSemiLattice as _,
                laws::{assert_bounded_join_semilattice, assert_is_top_consistent},
            },
            size_estimation::{InformationRange, InformationUnit},
        },
        execution::{
            VertexType,
            traversal::{
                EntityPath, EntityPathBitSet, TransferCostConfig, TraversalLattice,
                TraversalPathBitSet,
            },
        },
    },
};

/// Helper to create a `FieldByName` projection.
fn proj(name: impl Into<hashql_core::symbol::Symbol<'static>>) -> Projection<'static> {
    Projection {
        kind: ProjectionKind::FieldByName(name.into()),
        r#type: TypeId::PLACEHOLDER,
    }
}

/// `link_data.left_entity_id.draft_id` → `None` (synthesized, not stored).
#[test]
fn link_data_synthesized_is_none() {
    let projections = &[
        proj(sym::link_data),
        proj(sym::left_entity_id),
        proj(sym::draft_id),
    ];
    assert_eq!(EntityPath::resolve(projections), None);
}

/// Invalid path like `[.unknown]` → `None`.
#[test]
fn unknown_path_returns_none() {
    let projections = &[proj(sym::unknown)];
    assert_eq!(EntityPath::resolve(projections), None);
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

// --- Composite swallowing tests ---

fn empty_bitset() -> EntityPathBitSet {
    EntityPathBitSet::new_empty()
}

/// Inserting a leaf path into an empty set adds that path.
#[test]
fn insert_leaf_into_empty() {
    let mut bitset = empty_bitset();
    bitset.insert(EntityPath::WebId);

    assert!(bitset.contains(EntityPath::WebId));
    assert!(!bitset.contains(EntityPath::EntityId));
    assert!(!bitset.contains(EntityPath::RecordId));
}

/// Inserting a composite removes any children already in the set.
#[test]
fn composite_swallows_children() {
    let mut bitset = empty_bitset();
    bitset.insert(EntityPath::WebId);
    bitset.insert(EntityPath::EntityUuid);
    bitset.insert(EntityPath::DraftId);

    assert!(bitset.contains(EntityPath::WebId));
    assert!(bitset.contains(EntityPath::EntityUuid));
    assert!(bitset.contains(EntityPath::DraftId));

    bitset.insert(EntityPath::EntityId);

    assert!(bitset.contains(EntityPath::EntityId));
    assert!(!bitset.contains(EntityPath::WebId));
    assert!(!bitset.contains(EntityPath::EntityUuid));
    assert!(!bitset.contains(EntityPath::DraftId));
}

/// Inserting a child when its ancestor composite is already present is a no-op.
#[test]
fn child_suppressed_by_ancestor() {
    let mut bitset = empty_bitset();
    bitset.insert(EntityPath::RecordId);

    bitset.insert(EntityPath::WebId);
    bitset.insert(EntityPath::EntityId);
    bitset.insert(EntityPath::EditionId);

    assert!(bitset.contains(EntityPath::RecordId));
    assert!(!bitset.contains(EntityPath::WebId));
    assert!(!bitset.contains(EntityPath::EntityId));
    assert!(!bitset.contains(EntityPath::EditionId));
}

/// Inserting a top-level composite swallows the entire subtree.
#[test]
fn record_id_swallows_entire_subtree() {
    let mut bitset = empty_bitset();
    bitset.insert(EntityPath::WebId);
    bitset.insert(EntityPath::EntityUuid);
    bitset.insert(EntityPath::EditionId);

    bitset.insert(EntityPath::RecordId);

    assert!(bitset.contains(EntityPath::RecordId));
    assert!(!bitset.contains(EntityPath::EntityId));
    assert!(!bitset.contains(EntityPath::WebId));
    assert!(!bitset.contains(EntityPath::EntityUuid));
    assert!(!bitset.contains(EntityPath::DraftId));
    assert!(!bitset.contains(EntityPath::EditionId));
}

/// `TemporalVersioning` swallows `DecisionTime` and `TransactionTime`.
#[test]
fn temporal_versioning_swallows_children() {
    let mut bitset = empty_bitset();
    bitset.insert(EntityPath::DecisionTime);
    bitset.insert(EntityPath::TransactionTime);

    bitset.insert(EntityPath::TemporalVersioning);

    assert!(bitset.contains(EntityPath::TemporalVersioning));
    assert!(!bitset.contains(EntityPath::DecisionTime));
    assert!(!bitset.contains(EntityPath::TransactionTime));
}

/// Non-composite paths are unaffected by each other.
#[test]
fn independent_leaves_coexist() {
    let mut bitset = empty_bitset();
    bitset.insert(EntityPath::Properties);
    bitset.insert(EntityPath::Archived);
    bitset.insert(EntityPath::Vectors);

    assert!(bitset.contains(EntityPath::Properties));
    assert!(bitset.contains(EntityPath::Archived));
    assert!(bitset.contains(EntityPath::Vectors));
}

/// Inserting `EntityId` into a set with `WebId` swallows `WebId`, but unrelated paths remain.
#[test]
fn swallow_selective() {
    let mut bitset = empty_bitset();
    bitset.insert(EntityPath::WebId);
    bitset.insert(EntityPath::Properties);
    bitset.insert(EntityPath::DecisionTime);

    bitset.insert(EntityPath::EntityId);

    assert!(bitset.contains(EntityPath::EntityId));
    assert!(!bitset.contains(EntityPath::WebId));
    // Unrelated paths untouched
    assert!(bitset.contains(EntityPath::Properties));
    assert!(bitset.contains(EntityPath::DecisionTime));
}

// --- insert_all tests ---

/// `insert_all` sets exactly the top-level paths (composites replace their children).
#[test]
fn insert_all_sets_top_level_paths() {
    let mut bitset = empty_bitset();
    bitset.insert_all();

    // Top-level and childless paths are present
    assert!(bitset.contains(EntityPath::Properties));
    assert!(bitset.contains(EntityPath::Vectors));
    assert!(bitset.contains(EntityPath::RecordId));
    assert!(bitset.contains(EntityPath::TemporalVersioning));
    assert!(bitset.contains(EntityPath::EntityTypeIds));
    assert!(bitset.contains(EntityPath::Archived));
    assert!(bitset.contains(EntityPath::Confidence));
    assert!(bitset.contains(EntityPath::ProvenanceInferred));
    assert!(bitset.contains(EntityPath::ProvenanceEdition));
    assert!(bitset.contains(EntityPath::PropertyMetadata));
    assert!(bitset.contains(EntityPath::LeftEntityWebId));
    assert!(bitset.contains(EntityPath::RightEntityWebId));

    // Children subsumed by composites are absent
    assert!(!bitset.contains(EntityPath::EntityId));
    assert!(!bitset.contains(EntityPath::WebId));
    assert!(!bitset.contains(EntityPath::EntityUuid));
    assert!(!bitset.contains(EntityPath::DraftId));
    assert!(!bitset.contains(EntityPath::EditionId));
    assert!(!bitset.contains(EntityPath::DecisionTime));
    assert!(!bitset.contains(EntityPath::TransactionTime));
}

/// `insert_all` produces the correct count: total variants minus children with ancestors.
#[test]
fn insert_all_len() {
    let mut bitset = empty_bitset();
    bitset.insert_all();

    // 25 variants - 7 children (EntityId, WebId, EntityUuid, DraftId, EditionId,
    // DecisionTime, TransactionTime) = 18
    assert_eq!(bitset.len(), 18);
}

/// An empty bitset has len 0.
#[test]
fn empty_bitset_len() {
    let bitset = empty_bitset();
    assert_eq!(bitset.len(), 0);
    assert!(bitset.is_empty());
}

/// `len` tracks individual inserts correctly.
#[test]
fn len_after_inserts() {
    let mut bitset = empty_bitset();
    assert_eq!(bitset.len(), 0);

    bitset.insert(EntityPath::Properties);
    assert_eq!(bitset.len(), 1);

    bitset.insert(EntityPath::Archived);
    assert_eq!(bitset.len(), 2);

    // Duplicate insert doesn't change count
    bitset.insert(EntityPath::Properties);
    assert_eq!(bitset.len(), 2);
}

/// Composite swallowing decreases `len` when children are removed.
#[test]
fn len_decreases_on_swallow() {
    let mut bitset = empty_bitset();
    bitset.insert(EntityPath::WebId);
    bitset.insert(EntityPath::EntityUuid);
    bitset.insert(EntityPath::DraftId);
    assert_eq!(bitset.len(), 3);

    // EntityId swallows all three children
    bitset.insert(EntityPath::EntityId);
    assert_eq!(bitset.len(), 1);
}

// --- Lattice law tests ---

/// Builds an `EntityPathBitSet` from a list of paths using `insert` (swallowing).
fn bitset_of(paths: &[EntityPath]) -> EntityPathBitSet {
    let mut bitset = empty_bitset();
    for &path in paths {
        bitset.insert(path);
    }
    bitset
}

/// `EntityPathBitSet` satisfies `BoundedJoinSemiLattice` laws.
///
/// Uses values that cross the composite hierarchy: leaves from different subtrees,
/// a mid-level composite, and a top-level composite with a sibling leaf.
#[test]
fn entity_path_bitset_bounded_join_semilattice() {
    let lattice = TraversalLattice::new(VertexType::Entity);

    let set_a = bitset_of(&[EntityPath::WebId, EntityPath::DecisionTime]);
    let set_b = bitset_of(&[EntityPath::EntityId, EntityPath::Properties]);
    let set_c = bitset_of(&[EntityPath::RecordId, EntityPath::TransactionTime]);

    assert_bounded_join_semilattice(&lattice, set_a, set_b, set_c);
}

/// `is_top(top())` is consistent for `EntityPathBitSet`.
#[test]
fn entity_path_bitset_top_consistent() {
    let lattice = TraversalLattice::new(VertexType::Entity);
    assert_is_top_consistent::<_, EntityPathBitSet>(&lattice);
}

/// `join(top, a) = top` for `EntityPathBitSet`.
#[test]
fn entity_path_bitset_top_absorbs_join() {
    let lattice = TraversalLattice::new(VertexType::Entity);
    let top: EntityPathBitSet = lattice.top();

    for path in EntityPath::all() {
        let singleton = bitset_of(&[path]);
        let result = lattice.join_owned(top, &singleton);
        assert_eq!(result, top);
    }
}

/// `TraversalPathBitSet` satisfies `BoundedJoinSemiLattice` laws.
#[test]
fn traversal_path_bitset_bounded_join_semilattice() {
    let lattice = TraversalLattice::new(VertexType::Entity);

    let set_a =
        TraversalPathBitSet::Entity(bitset_of(&[EntityPath::WebId, EntityPath::DecisionTime]));
    let set_b =
        TraversalPathBitSet::Entity(bitset_of(&[EntityPath::EntityId, EntityPath::Properties]));
    let set_c = TraversalPathBitSet::Entity(bitset_of(&[
        EntityPath::RecordId,
        EntityPath::TransactionTime,
    ]));

    assert_bounded_join_semilattice(&lattice, set_a, set_b, set_c);
}

/// `is_top(top())` is consistent for `TraversalPathBitSet`.
#[test]
fn traversal_path_bitset_top_consistent() {
    let lattice = TraversalLattice::new(VertexType::Entity);
    assert_is_top_consistent::<_, TraversalPathBitSet>(&lattice);
}

/// `join(top, a) = top` for `TraversalPathBitSet`.
#[test]
fn traversal_path_bitset_top_absorbs_join() {
    let lattice = TraversalLattice::new(VertexType::Entity);
    let top: TraversalPathBitSet = lattice.top();

    for path in EntityPath::all() {
        let singleton = TraversalPathBitSet::Entity(bitset_of(&[path]));
        let result = lattice.join_owned(top, &singleton);
        assert_eq!(result, top);
    }
}

/// `join` normalizes ancestor+descendant pairs produced by raw union.
///
/// When one side has a leaf and the other has its ancestor composite, the union
/// contains both. `normalize` must remove the descendant since the ancestor covers it.
#[test]
fn join_normalizes_ancestor_descendant_pairs() {
    let lattice = TraversalLattice::new(VertexType::Entity);

    let mut lhs = bitset_of(&[EntityPath::WebId, EntityPath::Properties]);
    let rhs = bitset_of(&[EntityPath::RecordId]);

    lattice.join(&mut lhs, &rhs);

    assert!(lhs.contains(EntityPath::RecordId));
    assert!(lhs.contains(EntityPath::Properties));
    assert!(!lhs.contains(EntityPath::WebId));
    assert_eq!(lhs.len(), 2);
}

// --- Transfer size tests ---

/// Each composite's `transfer_size` equals the sum of its immediate children's `transfer_sizes`.
///
/// Immediate children are identified automatically via `ancestors()`: a path is an immediate
/// child of composite C if C is its nearest ancestor (`ancestors()[0] == C`). This catches
/// drift if a new child is added to the hierarchy without updating the composite constant.
#[test]
fn composite_transfer_size_matches_children() {
    let config = TransferCostConfig::new(InformationRange::zero());

    for composite in EntityPath::all() {
        let mut expected = InformationRange::zero();
        let mut has_children = false;

        for path in EntityPath::all() {
            if path.ancestors().first() == Some(&composite) {
                expected += path.estimate_size(&config);
                has_children = true;
            }
        }

        if has_children {
            assert_eq!(
                composite.estimate_size(&config),
                expected,
                "{composite:?} transfer_size doesn't match sum of immediate children"
            );
        }
    }
}

/// `ProvenanceInferred` has a static `transfer_size` independent of config.
///
/// The type is a fixed structure (3 required scalars + 2 optional timestamps), so its
/// size is a constant `3..=5` regardless of `TransferCostConfig` values.
#[test]
fn inferred_provenance_transfer_size_is_static() {
    let small_config = TransferCostConfig::new(InformationRange::zero());
    let large_config = TransferCostConfig::new(InformationRange::value(InformationUnit::new(1000)));

    let small = EntityPath::ProvenanceInferred.estimate_size(&small_config);
    let large = EntityPath::ProvenanceInferred.estimate_size(&large_config);

    assert_eq!(small, large);
    assert_eq!(
        small,
        InformationRange::new(
            InformationUnit::new(3),
            Bound::Included(InformationUnit::new(5))
        )
    );
}
