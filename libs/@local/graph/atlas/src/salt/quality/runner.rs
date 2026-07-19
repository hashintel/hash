//! The quality runner: one probe over a published generation.
//!
//! [`run`] wires the suite end to end: it opens the generation's
//! mapped artifacts - the k-NN table for the clump grouping, the
//! representation matrix, the coordinate frame, the node identities -
//! probes them against the dataset's canonical space, resolves the
//! sampled anchors' direct types through the dataset's probe-scoped
//! type stream, and renders the readings into a [`QualityReport`]
//! under the given thresholds.
//!
//! The dataset must observe the snapshot the generation was fitted
//! from (its metadata records the axes): the runner matches artifact
//! rows to source identities through the identity artifact, and a
//! dataset at other axes would resolve types for a different corpus.

use core::{error::Error, fmt};

use rand::Rng;
use tracing::Instrument as _;

use super::{
    clump::Clumps,
    probe::{DeliveryError, ProbeCorpus, ProbeError, ProbeOptions, match_deliveries, probe},
    report::{QualityReport, QualityThresholds, assess},
};
use crate::{
    dataset::{Dataset, PROJECTOR_DIMENSIONS},
    file::{
        array::{ArrayFile, OpenArrayError},
        generation::Generation,
        identity::read::{IdentityFile, OpenIdentityError},
        sprs::read::{OpenSprsError, SprsFile},
    },
    salt::{
        fit::prepare::identity::{InvalidIdentityFile, MappedIdentityTable},
        knn::artifact::{InvalidKnnFile, MappedKnn},
    },
};

/// Sampling, grouping, and gating settings for one quality run.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct QualityRunOptions {
    /// The probe's sampling and neighbourhood settings.
    pub probe: ProbeOptions = ProbeOptions { .. },
    /// The report's gates.
    pub thresholds: QualityThresholds = QualityThresholds { .. },
    /// The clump grouping's distance threshold.
    pub epsilon: f32 = super::clump::DEFAULT_EPSILON,
}

const impl Default for QualityRunOptions {
    fn default() -> Self {
        Self { .. }
    }
}

/// The quality run could not produce a report.
#[derive(Debug)]
pub(crate) enum QualityRunError<E> {
    /// The k-NN artifact could not be opened.
    OpenKnn(OpenSprsError),
    /// The opened k-NN file does not hold a valid table.
    InvalidKnn(InvalidKnnFile),
    /// The representation artifact could not be opened.
    OpenRepresentations(OpenArrayError),
    /// The representation artifact is not a projector matrix.
    InvalidRepresentations,
    /// The coordinate artifact could not be opened.
    OpenCoordinates(OpenArrayError),
    /// The coordinate artifact is not a coordinate frame.
    InvalidCoordinates,
    /// The node-identity artifact could not be opened.
    OpenIdentities(OpenIdentityError),
    /// The node-identity artifact does not hold a valid table over the
    /// dataset's id type.
    InvalidIdentities(InvalidIdentityFile),
    /// The artifacts disagree about the corpus row count.
    Rows {
        identities: usize,
        representations: usize,
        coordinates: usize,
        knn: usize,
    },
    /// The probe could not run.
    Probe(ProbeError<E>),
    /// The anchors' type lists could not be resolved.
    Types(DeliveryError<E>),
}

impl<E> fmt::Display for QualityRunError<E> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::OpenKnn(_) => fmt.write_str("the k-NN artifact could not be opened"),
            Self::InvalidKnn(_) => {
                fmt.write_str("the opened k-NN file does not hold a valid table")
            }
            Self::OpenRepresentations(_) => {
                fmt.write_str("the representation artifact could not be opened")
            }
            Self::InvalidRepresentations => write!(
                fmt,
                "the representation artifact is not an f32 matrix of width {PROJECTOR_DIMENSIONS}",
            ),
            Self::OpenCoordinates(_) => {
                fmt.write_str("the coordinate artifact could not be opened")
            }
            Self::InvalidCoordinates => {
                fmt.write_str("the coordinate artifact is not an f32 matrix of width 2")
            }
            Self::OpenIdentities(_) => {
                fmt.write_str("the node-identity artifact could not be opened")
            }
            Self::InvalidIdentities(_) => fmt.write_str(
                "the node-identity artifact does not hold a valid table over the dataset's id type",
            ),
            Self::Rows {
                identities,
                representations,
                coordinates,
                knn,
            } => write!(
                fmt,
                "the artifacts disagree about the corpus row count: {identities} identities, \
                 {representations} representations, {coordinates} coordinates, {knn} k-NN rows",
            ),
            Self::Probe(_) => fmt.write_str("the probe could not run"),
            Self::Types(_) => fmt.write_str("the anchors' type lists could not be resolved"),
        }
    }
}

impl<E: Error + 'static> Error for QualityRunError<E> {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::OpenKnn(error) => Some(error),
            Self::InvalidKnn(error) => Some(error),
            Self::OpenRepresentations(error) | Self::OpenCoordinates(error) => Some(error),
            Self::OpenIdentities(error) => Some(error),
            Self::InvalidIdentities(error) => Some(error),
            Self::Probe(error) => Some(error),
            Self::Types(error) => Some(error),
            Self::InvalidRepresentations | Self::InvalidCoordinates | Self::Rows { .. } => None,
        }
    }
}

/// Probes a published generation and reports its map fidelity.
///
/// The generation's artifacts are read from their whole-file mappings;
/// nothing is copied onto the heap beyond the probe's own bounded
/// scratch. The dataset serves two probe-scoped streams - canonical
/// embeddings for the sampled rows, direct types for the anchors - and
/// must observe the snapshot recorded in the generation's metadata.
///
/// # Errors
///
/// Returns an error when an artifact cannot be opened or does not hold
/// its role's layout, the artifacts disagree about the corpus row
/// count, the probe design cannot run over the corpus, or a dataset
/// stream fails or misdelivers.
#[expect(
    clippy::future_not_send,
    reason = "the `Dataset` trait does not promise `Send` streams; the future's sendability \
              follows the dataset's"
)]
pub(crate) async fn run<D: Dataset>(
    dataset: &D,
    generation: &Generation,
    options: &QualityRunOptions,
    rng: impl Rng,
) -> Result<QualityReport, QualityRunError<D::Error>> {
    let files = &generation.repository().files;

    let knn = {
        let _span = tracing::info_span!("knn").entered();
        MappedKnn::new(
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
    let identities = MappedIdentityTable::<D::NodeId>::new(
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
