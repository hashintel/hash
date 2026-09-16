//! One quality probe over a published generation.
//!
//! [`run`] opens a generation's k-NN table, representation matrix, coordinate frame and node
//! identities. It groups stored near-duplicate edges and probes neighbourhood fidelity against
//! dataset canonical embeddings. After resolving the anchors' direct types, it returns a
//! [`QualityReport`] under the configured thresholds.
//!
//! The dataset must supply canonical embeddings and type memberships consistent with the fitted
//! corpus. Matching source ids and counts leaves those values unverified. Recorded temporal axes
//! select the same query parameters, but do not by themselves restore the fit's database snapshot.
//! The report is returned in memory without changing activation.

use hashql_core::id::IdSlice;
use rand::Rng;
use tracing::Instrument as _;

use super::{
    clump::Clumps,
    error::QualityRunError,
    probe::{ProbeCorpus, ProbeOptions, match_deliveries, probe},
    report::{QualityReport, QualityThresholds, assess},
};
use crate::{
    dataset::{Dataset, PROJECTOR_DIMENSIONS},
    file::{
        ArtifactFile as _, array::ArrayFile, generation::Generation, identity::read::IdentityFile,
        sprs::read::SprsFile,
    },
    identity::NodeRowId,
    math::FinitePointField,
    salt::{fit::prepare::identity::IdentityTableArchive, knn::artifact::KnnArchive},
};

/// Sampling, grouping, and threshold settings for one quality run.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct QualityRunOptions {
    /// Sampling settings, using [`ProbeOptions::default`] by default.
    pub probe: ProbeOptions = ProbeOptions::default(),
    /// Thresholds, using the permissive [`QualityThresholds::default`] by default.
    pub thresholds: QualityThresholds = QualityThresholds::default(),
    /// Clump cosine-distance threshold, using [`DEFAULT_EPSILON`](super::clump::DEFAULT_EPSILON) (0.002) by default.
    pub epsilon: f32 = super::clump::DEFAULT_EPSILON,
}

const impl Default for QualityRunOptions {
    fn default() -> Self {
        Self { .. }
    }
}

/// Probes a published generation and reports its map fidelity.
///
/// Artifact arrays borrow whole-file mappings. Clump construction allocates corpus-sized labels and
/// working state, in addition to probe scratch, sampled canonical payloads and report data. Backing
/// files must remain immutable while mapped. The dataset supplies canonical embeddings for sampled
/// rows and direct types for anchors, consistent with the fitted corpus.
///
/// [`probe`] defines numerical and design-capacity requirements beyond artifact layout and
/// row-count checks. In particular, finite coordinates do not guarantee finite squared distances,
/// and the representation matrix's layout check does not validate its components.
///
/// # Errors
///
/// Returns [`QualityRunError`] for an invalid or unreadable artifact, mismatched row counts, a
/// failed probe or mismatched type delivery.
///
/// # Panics
///
/// Unchecked design or aggregate arithmetic can panic when integer overflow checks are enabled, as
/// described by [`probe`].
pub(crate) async fn run<D: Dataset>(
    dataset: &D,
    generation: &Generation,
    options: &QualityRunOptions,
    rng: impl Rng,
) -> Result<QualityReport, QualityRunError<D::Error>> {
    let files = &generation.repository().files;

    let knn = {
        let _span = tracing::info_span!("knn").entered();
        KnnArchive::new(
            SprsFile::open(generation.path_of(&files.knn.name()))
                .map_err(QualityRunError::OpenKnn)?,
        )
        .map_err(QualityRunError::InvalidKnn)?
    };

    let representations_file = ArrayFile::open(generation.path_of(&files.representations.name()))
        .map_err(QualityRunError::OpenRepresentations)?;
    let representations = representations_file
        .vectors::<PROJECTOR_DIMENSIONS>()
        .ok_or(QualityRunError::InvalidRepresentations)?;

    let coordinates_file = ArrayFile::open(generation.path_of(&files.coordinates.name()))
        .map_err(QualityRunError::OpenCoordinates)?;
    let coordinates = coordinates_file
        .points()
        .ok_or(QualityRunError::InvalidCoordinates)?;
    let coordinates = FinitePointField::new(IdSlice::from_raw(coordinates))
        .map_err(QualityRunError::NonFiniteCoordinate)?;

    let identities = IdentityTableArchive::<D::NodeId, NodeRowId>::new(
        IdentityFile::open(generation.path_of(&files.node_identities.name()))
            .map_err(QualityRunError::OpenIdentities)?,
    )
    .map_err(QualityRunError::InvalidIdentities)?;
    let node_ids = identities.keys();

    let view = knn.view();
    #[expect(
        clippy::suspicious_operation_groupings,
        reason = "the identity count is deliberately the reference every artifact is compared \
                  against"
    )]
    if node_ids.len() != representations.len()
        || node_ids.len() != coordinates.len()
        || node_ids.len() != view.rows()
    {
        return Err(QualityRunError::Rows {
            identities: node_ids.len(),
            representations: representations.len(),
            coordinates: coordinates.len(),
            knn: view.rows(),
        });
    }

    let clumps = {
        let _span = tracing::info_span!("clumps").entered();
        Clumps::from_knn(&view, options.epsilon)
    };

    let readings = probe(
        dataset,
        ProbeCorpus::new(node_ids, IdSlice::from_raw(representations), coordinates)
            .with_clumps(&clumps),
        &options.probe,
        rng,
    )
    .instrument(tracing::info_span!("probe"))
    .await
    .map_err(QualityRunError::Probe)?;

    let anchor_types = {
        let anchor_ids = readings.anchors.iter().map(|&row| node_ids[row]);

        match_deliveries(node_ids, &readings.anchors, dataset.node_types(anchor_ids))
            .instrument(tracing::info_span!("types"))
            .await
            .map_err(QualityRunError::Types)?
    };

    Ok(assess(
        readings.with_anchor_types(&anchor_types),
        &options.thresholds,
    ))
}
