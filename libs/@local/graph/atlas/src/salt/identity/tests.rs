use type_system::{
    knowledge::entity::id::{EntityId, EntityUuid},
    principal::actor_group::WebId,
};
use uuid::Uuid;

use crate::salt::identity::{
    ArtifactIdentityMap, ArtifactOrdinal, GenerationRowId, IdentityDirectory, IdentityError,
    PackedIdDomain,
};

fn entity(seed: u128) -> EntityId {
    EntityId {
        web_id: WebId::new(Uuid::from_u128(seed)),
        entity_uuid: EntityUuid::new(Uuid::from_u128(seed + 1)),
        draft_id: None,
    }
}

#[test]
fn generation_rows_are_dense_and_bidirectional() {
    let entities = vec![entity(10), entity(20), entity(30)];
    let directory =
        IdentityDirectory::new(entities.clone()).expect("should build a unique directory");

    assert_eq!(
        directory.row(&entities[1]),
        GenerationRowId::try_from(1_u32).ok()
    );
    assert_eq!(
        directory.entity(GenerationRowId::try_from(2_u32).expect("should be a valid row")),
        Some(&entities[2])
    );
    assert_eq!(
        directory.iter().collect::<Vec<_>>(),
        vec![
            (
                GenerationRowId::try_from(0_u32).expect("should be a valid row"),
                &entities[0],
            ),
            (
                GenerationRowId::try_from(1_u32).expect("should be a valid row"),
                &entities[1],
            ),
            (
                GenerationRowId::try_from(2_u32).expect("should be a valid row"),
                &entities[2],
            ),
        ]
    );
}

#[test]
fn duplicate_graph_identity_is_rejected() {
    let duplicate = entity(10);
    let result = IdentityDirectory::new(vec![duplicate, entity(20), duplicate]);

    let Err(IdentityError::DuplicateEntity {
        entity_id,
        first,
        duplicate: second,
    }) = result
    else {
        panic!("should reject duplicate graph identities");
    };

    assert_eq!(entity_id, duplicate);
    assert_eq!(first.as_u32(), 0);
    assert_eq!(second.as_u32(), 2);
}

#[test]
fn reserved_packed_value_is_rejected_in_both_domains() {
    let row_error =
        GenerationRowId::try_from(u32::MAX).expect_err("should reject the reserved generation row");
    let ordinal_error = ArtifactOrdinal::try_from(u32::MAX)
        .expect_err("should reject the reserved artifact ordinal");

    assert_eq!(row_error.domain, PackedIdDomain::GenerationRow);
    assert_eq!(ordinal_error.domain, PackedIdDomain::ArtifactOrdinal);
    assert_eq!(GenerationRowId::MAX.as_u32(), u32::MAX - 1);
    assert_eq!(ArtifactOrdinal::MAX.as_u32(), u32::MAX - 1);
}

#[test]
fn artifact_ordinals_are_explicit_subset_mappings() {
    let entities = vec![entity(10), entity(20), entity(30)];
    let directory =
        IdentityDirectory::new(entities).expect("should build a unique identity directory");
    let row_zero = GenerationRowId::try_from(0_u32).expect("should be a valid row");
    let row_two = GenerationRowId::try_from(2_u32).expect("should be a valid row");
    let mapping = ArtifactIdentityMap::new(&directory, vec![row_two, row_zero])
        .expect("should map a valid subset");

    assert_eq!(
        mapping.ordinal(row_two),
        ArtifactOrdinal::try_from(0_u32).ok()
    );
    assert_eq!(
        mapping.ordinal(row_zero),
        ArtifactOrdinal::try_from(1_u32).ok()
    );
    assert_eq!(
        mapping.row(ArtifactOrdinal::try_from(1_u32).expect("should be a valid ordinal")),
        Some(row_zero)
    );
}

#[test]
fn artifact_map_rejects_unknown_and_duplicate_rows() {
    let directory =
        IdentityDirectory::new(vec![entity(10), entity(20)]).expect("should build a directory");
    let row_zero = GenerationRowId::try_from(0_u32).expect("should be a valid row");
    let unknown = GenerationRowId::try_from(2_u32).expect("should be a packed row");

    assert!(matches!(
        ArtifactIdentityMap::new(&directory, vec![unknown]),
        Err(IdentityError::UnknownGenerationRow { row, rows: 2 }) if row == unknown
    ));
    assert!(matches!(
        ArtifactIdentityMap::new(&directory, vec![row_zero, row_zero]),
        Err(IdentityError::DuplicateArtifactRow {
            row,
            first,
            duplicate,
        }) if row == row_zero && first.as_u32() == 0 && duplicate.as_u32() == 1
    ));
}
