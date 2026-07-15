use camino::Utf8PathBuf;

use super::{
    CANONICAL_DIMENSIONS, CanonicalGenerationError, GenerationManifestContract,
    RelationModelSources, RepresentationError, derive_representations, validate_and_sort_anchors,
    validate_strength_control,
};
use crate::salt::{
    identity::{ArtifactOrdinal, GenerationRowId},
    manifest::tests::fixture_manifest,
    policy::{CoincidentGate, PolicyEvidence, resolve},
    projector::CoordinateSupportRow,
    relation::RelationPolicy,
    strength::RelationStrength,
};

#[test]
fn canonical_suffix_is_validated_and_bound_without_entering_the_projector_prefix() {
    let mut first = [[0.0_f32; CANONICAL_DIMENSIONS]];
    first[0][0] = 1.0;
    let mut second = first;
    second[0][CANONICAL_DIMENSIONS - 1] = 2.0;

    let (first_hash, first_projector_hash, first_prefix) =
        derive_representations(&first).expect("finite canonical row should derive");
    let (second_hash, second_projector_hash, second_prefix) =
        derive_representations(&second).expect("finite canonical row should derive");

    assert_ne!(first_hash, second_hash);
    assert_eq!(first_projector_hash, second_projector_hash);
    assert!(
        first_prefix
            .iter()
            .zip(second_prefix.iter())
            .all(|(left, right)| left.to_bits() == right.to_bits())
    );

    second[0][CANONICAL_DIMENSIONS - 1] = f32::NAN;
    assert!(matches!(
        derive_representations(&second),
        Err(RepresentationError::NonFinite { index })
            if index == CANONICAL_DIMENSIONS - 1
    ));
}

#[test]
fn initial_strength_control_rejects_heads_and_free_multipliers() {
    let classifier = Utf8PathBuf::from("classifier.salt");
    let with_head = RelationModelSources {
        classifier: classifier.clone(),
        strength_head: Some(Utf8PathBuf::from("strength.salt")),
    };
    assert!(matches!(
        validate_strength_control(&with_head, &[]),
        Err(CanonicalGenerationError::StrengthHeadUnsupported)
    ));

    let no_head = RelationModelSources {
        classifier,
        strength_head: None,
    };
    let policy = RelationPolicy {
        relation: ArtifactOrdinal::try_from(0_u32).expect("zero ordinal should validate"),
        policy: resolve(PolicyEvidence::default(), CoincidentGate::default()),
        strength: RelationStrength::new(1.5).expect("fixture strength should validate"),
    };
    assert!(matches!(
        validate_strength_control(&no_head, &[policy]),
        Err(CanonicalGenerationError::NonUnitStrengthWithoutHead {
            strength,
            ..
        }) if strength.to_bits() == 1.5_f64.to_bits()
    ));
}

#[test]
fn anchors_are_fully_validated_and_canonicalized_before_sampling() {
    let anchor = |row: u32, target| CoordinateSupportRow {
        row: GenerationRowId::try_from(row).expect("fixture row should fit"),
        target,
        radius: 1.0,
        weight: 1.0,
    };
    let mut anchors = [
        anchor(1, [2.0, 0.0]),
        anchor(0, [3.0, 0.0]),
        anchor(1, [1.0, 0.0]),
    ];
    validate_and_sort_anchors(&mut anchors, 2).expect("valid anchors should canonicalize");
    assert_eq!(
        anchors
            .iter()
            .map(|anchor| (anchor.row.as_u32(), anchor.target[0].to_bits()))
            .collect::<Vec<_>>(),
        [
            (0, 3.0_f64.to_bits()),
            (1, 1.0_f64.to_bits()),
            (1, 2.0_f64.to_bits()),
        ]
    );

    anchors[0].weight = f64::NAN;
    assert!(matches!(
        validate_and_sort_anchors(&mut anchors, 2),
        Err(CanonicalGenerationError::AnchorScalar {
            field: "weight",
            ..
        })
    ));
}

#[test]
fn manifest_contract_rejects_caller_authored_artifact_claims() {
    let manifest = fixture_manifest();

    assert!(matches!(
        GenerationManifestContract::new(manifest),
        Err(CanonicalGenerationError::ManifestContractArtifacts { actual }) if actual > 0
    ));
}

#[test]
fn manifest_contract_requires_the_single_canonical_variant() {
    let mut manifest = fixture_manifest();
    manifest.artifacts.clear();
    manifest.variants.entries[0].id = crate::salt::revision::VariantId::new(1);

    assert!(matches!(
        GenerationManifestContract::new(manifest),
        Err(CanonicalGenerationError::ManifestContractCanonical)
    ));
}
