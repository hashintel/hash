use super::{
    AUDITED_PREFIX_DIMENSIONS, RepresentationAuditError, RepresentationAuditReport,
    prefix_corpus_hash,
};
use crate::salt::{
    hash::ContentHash,
    representation::{
        CANONICAL_DIMENSIONS, CanonicalEmbedding, PROJECTOR_DIMENSIONS, canonical_corpus_hash,
        projector_corpus_hash,
    },
};

#[test]
fn report_is_bound_to_every_persisted_representation_width() {
    let (canonical, projector) = corpora();
    report(&canonical, &projector)
        .validate(
            &canonical,
            &projector,
            hash("identities"),
            hash("stratification"),
        )
        .expect("complete corpus-bound report should validate");

    let mut mismatched = report(&canonical, &projector);
    mismatched.prefix_corpus_hashes[1] = ContentHash::digest(b"wrong-prefix");
    assert_eq!(
        mismatched.validate(
            &canonical,
            &projector,
            hash("identities"),
            hash("stratification"),
        ),
        Err(RepresentationAuditError::PrefixBinding { dimensions: 256 })
    );
}

#[test]
fn invalid_recall_and_detailed_report_references_fail_closed() {
    let (canonical, projector) = corpora();
    let mut invalid_recall = report(&canonical, &projector);
    invalid_recall.overall_recall[2][1] = f64::NAN;
    assert_eq!(
        invalid_recall.validate(
            &canonical,
            &projector,
            hash("identities"),
            hash("stratification"),
        ),
        Err(RepresentationAuditError::Recall {
            dimensions: 512,
            neighbors: 30,
        })
    );

    let mut missing = report(&canonical, &projector);
    missing.stratified_report_hash = ContentHash::from_bytes([0; 32]);
    assert_eq!(
        missing.validate(
            &canonical,
            &projector,
            hash("identities"),
            hash("stratification"),
        ),
        Err(RepresentationAuditError::MissingReport)
    );
}

#[test]
fn signed_report_identity_changes_with_an_overall_measurement() {
    let (canonical, projector) = corpora();
    let first = report(&canonical, &projector);
    let mut second = first.clone();
    second.overall_recall[0][0] = 0.8;
    assert_ne!(first.content_hash(), second.content_hash());
}

fn corpora() -> (Vec<f32>, Vec<f32>) {
    let mut canonical = vec![0.0_f32; 2 * CANONICAL_DIMENSIONS];
    canonical[0] = 1.0;
    canonical[CANONICAL_DIMENSIONS + 1] = 1.0;
    let mut projector = Vec::with_capacity(2 * PROJECTOR_DIMENSIONS);
    for row in canonical.chunks_exact(CANONICAL_DIMENSIONS) {
        let mut prefix = [0.0; PROJECTOR_DIMENSIONS];
        let _normalization = CanonicalEmbedding::new(row)
            .expect("fixture row should validate")
            .normalize_prefix(&mut prefix);
        projector.extend_from_slice(&prefix);
    }
    (canonical, projector)
}

fn report(canonical: &[f32], projector: &[f32]) -> RepresentationAuditReport {
    RepresentationAuditReport {
        suite_version: "representation-audit-v1".to_owned(),
        canonical_corpus_hash: canonical_corpus_hash(canonical),
        projector_corpus_hash: projector_corpus_hash(projector),
        identity_directory_hash: hash("identities"),
        stratification_input_hash: hash("stratification"),
        prefix_corpus_hashes: AUDITED_PREFIX_DIMENSIONS
            .map(|dimensions| prefix_corpus_hash(canonical, dimensions)),
        query_sample_hash: hash("sample"),
        sample_rows: 2,
        overall_recall: [[0.9; 3]; 4],
        stratified_report_hash: hash("stratified"),
        diagnostic_report_hash: hash("diagnostics"),
        clump_report_hash: hash("clumps"),
    }
}

fn hash(name: &str) -> ContentHash {
    ContentHash::digest(name.as_bytes())
}
