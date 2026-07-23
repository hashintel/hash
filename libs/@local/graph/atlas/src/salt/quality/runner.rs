//! The quality runner: one probe over a published generation.
//!
//! [`run`] wires the suite end to end: it opens the generation's mapped artifacts - the k-NN table
//! for the clump grouping, the representation matrix, the coordinate frame, the node identities -
//! probes them against the dataset's canonical space, resolves the sampled anchors' direct types
//! through the dataset's probe-scoped type stream, and renders the readings into a
//! [`QualityReport`] under the given thresholds.
//!
//! The dataset must observe the snapshot the generation was fitted from (its metadata records the
//! axes): the runner matches artifact rows to source identities through the identity artifact, and
//! a dataset at other axes would resolve types for a different corpus.

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
        array::ArrayFile, generation::Generation, identity::read::IdentityFile,
        sprs::read::SprsFile,
    },
    salt::{fit::prepare::identity::IdentityTableArchive, knn::artifact::KnnArchive},
};

/// Sampling, grouping, and threshold settings for one quality run.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct QualityRunOptions {
    /// The probe's sampling and neighbourhood settings.
    pub probe: ProbeOptions = ProbeOptions::default(),
    /// The report's thresholds.
    pub thresholds: QualityThresholds = QualityThresholds::default(),
    /// The clump grouping's distance threshold.
    pub epsilon: f32 = super::clump::DEFAULT_EPSILON,
}

const impl Default for QualityRunOptions {
    fn default() -> Self {
        Self { .. }
    }
}

/// Probes a published generation and reports its map fidelity.
///
/// The generation's artifacts are read from their whole-file mappings; nothing is copied onto the
/// heap beyond the probe's own bounded scratch. The dataset serves two probe-scoped streams -
/// canonical embeddings for the sampled rows, direct types for the anchors - and must observe the
/// snapshot recorded in the generation's metadata.
///
/// # Errors
///
/// Returns an error when an artifact cannot be opened or does not hold its role's layout, the
/// artifacts disagree about the corpus row count, the probe design cannot run over the corpus, or a
/// dataset stream fails or misdelivers.
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
            SprsFile::open(generation.path_of(&files.knn.name))
                .map_err(QualityRunError::OpenKnn)?,
        )
        .map_err(QualityRunError::InvalidKnn)?
    };

    let representations_file = ArrayFile::open(generation.path_of(&files.representations.name))
        .map_err(QualityRunError::OpenRepresentations)?;
    let representations = representations_file
        .vectors::<PROJECTOR_DIMENSIONS>()
        .ok_or(QualityRunError::InvalidRepresentations)?;

    let coordinates_file = ArrayFile::open(generation.path_of(&files.coordinates.name))
        .map_err(QualityRunError::OpenCoordinates)?;
    let coordinates = coordinates_file
        .points()
        .ok_or(QualityRunError::InvalidCoordinates)?;

    let identities = IdentityTableArchive::<D::NodeId>::new(
        IdentityFile::open(generation.path_of(&files.node_identities.name))
            .map_err(QualityRunError::OpenIdentities)?,
    )
    .map_err(QualityRunError::InvalidIdentities)?;
    let node_ids = identities.ids();

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
        ProbeCorpus::new(node_ids, representations, coordinates).with_clumps(&clumps),
        &options.probe,
        rng,
    )
    .instrument(tracing::info_span!("probe"))
    .await
    .map_err(QualityRunError::Probe)?;

    let anchor_types = {
        let requests: Vec<D::NodeId> = readings
            .anchors
            .iter()
            .map(|&row| node_ids[row.usize()])
            .collect();

        match_deliveries(&requests, dataset.node_types(requests.iter().copied()))
            .instrument(tracing::info_span!("types"))
            .await
            .map_err(QualityRunError::Types)?
    };

    Ok(assess(&readings, &anchor_types, &options.thresholds))
}
