use type_system::{
    knowledge::entity::id::{EntityId, EntityUuid},
    principal::actor_group::WebId,
};
use uuid::Uuid;

use super::*;
use crate::salt::fit_boundary::GenerationRowId;

const ROWS: usize = 51;

#[test]
fn representation_audit_is_measured_and_corpus_bound() {
    let identities = identities();
    let roles = vec![EntityRole::KnowledgeEntity; ROWS];
    let candidates = candidates();
    let canonical = canonical();

    let prepared = audit_representations(&canonical, &identities, &candidates, &roles)
        .expect("quality audit should complete");

    assert_eq!(prepared.projector.len(), ROWS * PROJECTOR_DIMENSIONS);
    assert_eq!(prepared.audit.sample_rows, REPRESENTATION_AUDIT_SAMPLE_ROWS);
    assert!(
        prepared
            .audit
            .overall_recall
            .iter()
            .flatten()
            .all(|recall| (0.0..=1.0).contains(recall))
    );
    let mut tampered = canonical;
    tampered[0] += 0.25;
    assert!(
        prepared
            .audit
            .validate(
                &tampered,
                &prepared.projector,
                identities.content_hash(),
                representation_stratification_hash(&candidates, &roles)
                    .expect("stratification should validate"),
            )
            .is_err()
    );
}

#[test]
fn representation_audit_rejects_vacuous_corpora() {
    let identities =
        IdentityDirectory::new(vec![entity_id(1)]).expect("single identity should construct");
    let roles = [EntityRole::KnowledgeEntity];
    let candidates = [LandmarkCandidate {
        row: GenerationRowId::from_u32(0).expect("zero is a valid row"),
        sampling_weight: 1.0,
        density: 0,
        language: 0,
        source: 0,
        entity_role: EntityRole::KnowledgeEntity.index(),
        type_family: 0,
        community: 0,
        temporal_cohort: 0,
        prior_landmark: false,
    }];
    assert!(matches!(
        audit_representations(
            &vec![1.0; crate::salt::CANONICAL_DIMENSIONS],
            &identities,
            &candidates,
            &roles,
        ),
        Err(FitQualityError::CorpusTooSmall { .. })
    ));
}

#[test]
fn semantic_quality_is_measured_against_canonical_probes() {
    let identities = identities();
    let roles = vec![EntityRole::KnowledgeEntity; ROWS];
    let candidates = candidates();
    let canonical = canonical();
    audit_representations(&canonical, &identities, &candidates, &roles)
        .expect("quality audit should complete");
    let evaluator = LocalConditionQualityEvaluator::new(&canonical, &subgroups())
        .expect("semantic probes should construct");
    let coordinates = (0..ROWS)
        .map(|row| {
            let row = f64::from(u32::try_from(row).expect("fixture row should fit u32"));
            [row, row * row]
        })
        .collect::<Vec<_>>();
    let field = ContentHash::digest(b"test projected field");
    let quality = evaluator
        .measure_for_test(&coordinates, field, 0.5)
        .expect("finite coordinates should be measurable");

    assert_eq!(quality.projected_field(), field);
    assert!((0.0..=1.0).contains(&quality.semantic_fidelity()));
    assert!(quality.maximum_subgroup_degradation() >= 1.0);
    assert!(quality.maximum_subgroup_degradation().is_finite());
    assert_ne!(
        quality.semantic_fidelity_report(),
        quality.subgroup_report()
    );
}

#[test]
fn subgroup_quality_rejects_a_global_only_cohort() {
    let identities = identities();
    let roles = vec![EntityRole::KnowledgeEntity; ROWS];
    let candidates = candidates();
    let canonical = canonical();
    audit_representations(&canonical, &identities, &candidates, &roles)
        .expect("quality audit should complete");
    let uniform_subgroups = vec![ContentHash::digest(b"global fixture cohort"); ROWS];
    let uniform = LocalConditionQualityEvaluator::new(&canonical, &uniform_subgroups)
        .expect("global-only subgroup should construct");
    let coordinates = (0..ROWS)
        .map(|row| {
            let row = f64::from(u32::try_from(row).expect("fixture row should fit u32"));
            [row, row.sin()]
        })
        .collect::<Vec<_>>();
    let field = ContentHash::digest(b"subgroup field");
    assert!(uniform.measure_for_test(&coordinates, field, 0.5).is_err());
}

#[test]
fn persistence_evaluator_executes_all_planted_shapes() {
    assert_eq!(
        planted_shape_failures().expect("planted shapes should execute"),
        0
    );
}

fn identities() -> IdentityDirectory {
    IdentityDirectory::new((1..=ROWS as u128).map(entity_id).collect())
        .expect("fixture identities should be unique")
}

fn entity_id(discriminator: u128) -> EntityId {
    EntityId {
        web_id: WebId::new(Uuid::from_u128(1)),
        entity_uuid: EntityUuid::new(Uuid::from_u128(discriminator)),
        draft_id: None,
    }
}

fn candidates() -> Vec<LandmarkCandidate> {
    (0..ROWS)
        .map(|row| LandmarkCandidate {
            row: GenerationRowId::try_from(row).expect("fixture row should fit"),
            sampling_weight: 1.0,
            density: 0,
            language: 0,
            source: 0,
            entity_role: EntityRole::KnowledgeEntity.index(),
            type_family: 0,
            community: 0,
            temporal_cohort: 0,
            prior_landmark: false,
        })
        .collect()
}

fn canonical() -> Vec<f32> {
    (0..ROWS * crate::salt::CANONICAL_DIMENSIONS)
        .map(|index| {
            let row = index / crate::salt::CANONICAL_DIMENSIONS;
            let column = index % crate::salt::CANONICAL_DIMENSIONS;
            f32::from(
                u16::try_from((row * 31 + column * 7) % 251)
                    .expect("fixture remainder should fit u16"),
            ) / 251.0
                - 0.5
        })
        .collect()
}

fn subgroups() -> Vec<ContentHash> {
    (0..ROWS)
        .map(|row| ContentHash::digest(format!("fixture cohort {}", row % 4).as_bytes()))
        .collect()
}
