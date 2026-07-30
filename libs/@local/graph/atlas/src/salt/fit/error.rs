//! The fit pipeline's failure surface.
//!
//! Two layers mirror the pipeline's thread boundary. [`StageError`] is the compute side: every
//! failure a staged artifact or admission check can produce once ingest has finished streaming -
//! carrying no dataset or provider type, it is `Send + 'static` by construction and crosses the
//! rayon offload freely. [`FitError`] wraps it beside the failures only the async ingest can
//! produce: the dataset's, the card stream's, and the embedding provider's.

use core::{error::Error, fmt};
use std::io;

use super::prepare::{
    identity::InvalidIdentityFile,
    norm::{NormSpotCheck, SpotCheckError},
};
use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    file::{
        array::OpenArrayError,
        generation::SealError,
        identity::read::OpenIdentityError,
        landmark::read::OpenLandmarkError,
        policy::read::OpenPolicyError,
        sprs::{read::OpenSprsError, write::WriteSprsError},
    },
    identity::NodeRowId,
    salt::{
        adjacency::InvalidAdjacencyFile,
        embedding::CardEmbeddingError,
        knn::{
            artifact::InvalidKnnFile, descent::NnDescentError, error::KnnError,
            hannoy::HannoyIndexError, recall,
        },
        ladder::{CanonicalError, LadderError},
        landmark::{
            artifact::InvalidLandmarkFile, assignment::AssignmentError, layout::EdgelessGraphError,
            quotient::QuotientError, select::SelectionError,
        },
        lod::{quad::QuadError, stage::LodError},
        policy::{
            ResolveError,
            annotation::assembly::AssemblyError,
            artifact::InvalidPolicyFile,
            classifier::{FitError as ClassifierFitError, PredictError, TrainingSetError},
        },
        postings::build::PostingsError,
        projector::{
            artifact::CheckpointError,
            train::{TrainError, refresh::RefreshError},
        },
        relation::RelationIndexError,
        semantic::artifact::InvalidSemanticFile,
    },
};

/// The projector placement could not produce its canonical field.
///
/// Every variant aborts the fit: a generation whose coordinates the configured placement could not
/// produce publishes nothing.
#[derive(Debug)]
pub enum PlacementError {
    /// The projector objective rejects the fit's low-dimensional kernel or affinity offset.
    ObjectiveCurve { exponent: f32, offset: f32 },
    /// The configured architecture disagrees with the dataset's representation width.
    RepresentationWidth { configured: usize },
    /// Projector training failed.
    Train(TrainError<NodeRowId>),
    /// The projector checkpoint could not be encoded or staged.
    Checkpoint(CheckpointError),
    /// A whole-corpus inference pass failed.
    Projection(RefreshError<NodeRowId>),
    /// The ladder measurement rejected its fields.
    Ladder(LadderError),
    /// The configured canonical condition was refused.
    Canonical(CanonicalError),
}

impl fmt::Display for PlacementError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::ObjectiveCurve { exponent, offset } => write!(
                fmt,
                "the projector objective rejects the configuration: the curve exponent {exponent} \
                 must be at least 0.5 and the affinity offset {offset} finite and strictly \
                 positive",
            ),
            Self::RepresentationWidth { configured } => write!(
                fmt,
                "the architecture's representation width {configured} does not match the \
                 dataset's {PROJECTOR_DIMENSIONS}-dimensional projector contract",
            ),
            Self::Train(error) => write!(fmt, "projector training failed: {error}"),
            Self::Checkpoint(error) => {
                write!(fmt, "the projector checkpoint failed to stage: {error}")
            }
            Self::Projection(error) => {
                write!(fmt, "a whole-corpus inference pass failed: {error}")
            }
            Self::Ladder(error) => write!(fmt, "the ladder measurement failed: {error}"),
            Self::Canonical(error) => {
                write!(fmt, "the canonical condition was refused: {error}")
            }
        }
    }
}

impl Error for PlacementError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Train(error) => Some(error),
            Self::Checkpoint(error) => Some(error),
            Self::Projection(error) => Some(error),
            Self::Ladder(error) => Some(error),
            Self::Canonical(error) => Some(error),
            Self::ObjectiveCurve { .. } | Self::RepresentationWidth { .. } => None,
        }
    }
}

impl From<TrainError<NodeRowId>> for PlacementError {
    fn from(error: TrainError<NodeRowId>) -> Self {
        Self::Train(error)
    }
}

impl From<CheckpointError> for PlacementError {
    fn from(error: CheckpointError) -> Self {
        Self::Checkpoint(error)
    }
}

impl From<RefreshError<NodeRowId>> for PlacementError {
    fn from(error: RefreshError<NodeRowId>) -> Self {
        Self::Projection(error)
    }
}

impl From<LadderError> for PlacementError {
    fn from(error: LadderError) -> Self {
        Self::Ladder(error)
    }
}

impl From<CanonicalError> for PlacementError {
    fn from(error: CanonicalError) -> Self {
        Self::Canonical(error)
    }
}

/// A prior generation offered for reuse could not serve it.
///
/// The prior's artifacts are read exactly as published ones are; a prior that fails here is
/// corrupt, of another layout version, or of another dataset's id type, and the fit aborts rather
/// than silently running without reuse.
#[derive(Debug)]
pub enum PriorError {
    /// A prior card-embedding array failed to map.
    MapCards(OpenArrayError),
    /// The prior card files do not hold row-aligned digest and embedding columns.
    MalformedCards,
    /// The prior landmark file failed to map.
    MapLandmarks(OpenLandmarkError),
    /// The prior landmark file does not hold a valid skeleton.
    InvalidLandmarks(InvalidLandmarkFile),
    /// A prior identity file failed to map.
    MapIdentities(OpenIdentityError),
    /// A prior identity file does not hold a valid table over the dataset's id type.
    InvalidIdentities(InvalidIdentityFile),
    /// The prior skeleton selects a row beyond the prior identity table.
    ///
    /// The two artifacts describe different corpora.
    SkeletonBeyondIdentities { row: u64 },
}

impl fmt::Display for PriorError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::MapCards(error) => {
                write!(fmt, "a prior card-embedding array failed to map: {error}")
            }
            Self::MalformedCards => fmt.write_str(
                "the prior card files do not hold row-aligned digest and embedding columns",
            ),
            Self::MapLandmarks(error) => {
                write!(fmt, "the prior landmark file failed to map: {error}")
            }
            Self::InvalidLandmarks(error) => write!(
                fmt,
                "the prior landmark file is not a valid skeleton: {error}"
            ),
            Self::MapIdentities(error) => {
                write!(fmt, "a prior identity file failed to map: {error}")
            }
            Self::InvalidIdentities(error) => write!(
                fmt,
                "a prior identity file is not a valid table over the dataset's id type: {error}"
            ),
            Self::SkeletonBeyondIdentities { row } => write!(
                fmt,
                "the prior skeleton selects row {row}, beyond its own identity table"
            ),
        }
    }
}

impl Error for PriorError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::MapCards(error) => Some(error),
            Self::MapLandmarks(error) => Some(error),
            Self::InvalidLandmarks(error) => Some(error),
            Self::MapIdentities(error) => Some(error),
            Self::InvalidIdentities(error) => Some(error),
            Self::MalformedCards | Self::SkeletonBeyondIdentities { .. } => None,
        }
    }
}

/// A compute-side stage failed; nothing was published.
///
/// Every variant is dataset- and provider-free, so the whole enum is `Send + 'static` and crosses
/// the rayon offload boundary.
#[derive(Debug)]
pub enum StageError {
    /// A staged write, scratch directory, or digest pass failed.
    Io(io::Error),
    /// The norm spot check's sampling settings are unusable.
    NormCheck(SpotCheckError),
    /// Sampled representation rows violate the source contract.
    RepresentationDefects(NormSpotCheck),
    /// The search backend failed.
    Index(HannoyIndexError<NodeRowId>),
    /// The search backend's recall is demonstrably below the configured minimum.
    RecallBelowMinimum(recall::RecallSpotCheck),
    /// The k-NN table failed to assemble or admit.
    Knn(KnnError<NodeRowId, HannoyIndexError<NodeRowId>>),
    /// The NN-Descent construction failed.
    Descent(NnDescentError),
    /// The assembled corpus violates the classifier's training-set contract.
    ClassifierTraining(TrainingSetError),
    /// The relation classifier failed to fit.
    ClassifierFit(ClassifierFitError),
    /// A relation card's classification overflowed.
    Classify(PredictError),
    /// The policy resolution rejected its input.
    Policy(ResolveError),
    /// The staged policy file failed to map back.
    MapPolicies(OpenPolicyError),
    /// The staged policy file does not hold a valid table.
    InvalidPolicies(InvalidPolicyFile),
    /// The relation index build rejected its input.
    Relation(RelationIndexError),
    /// A sparse artifact failed to write.
    WriteSparse(WriteSprsError),
    /// The staged endpoint column failed to map back.
    MapEndpoints(OpenArrayError),
    /// The staged adjacency file failed to map back.
    MapAdjacency(OpenSprsError),
    /// The staged adjacency file does not hold valid lists.
    InvalidAdjacency(InvalidAdjacencyFile),
    /// The staged card-embedding matrix failed to map back.
    MapCards(OpenArrayError),
    /// The staged coordinate column failed to map back.
    MapCoordinates(OpenArrayError),
    /// The staged coordinate column is not an f32 pair array.
    CoordinateShape,
    /// The corpus exceeds the `u32` wire position encoding.
    WireEncoding { rows: u64 },
    /// The level-of-detail derivation rejected its input.
    Lod(LodError),
    /// The quadtree build rejected its input.
    Quad(QuadError),
    /// The postings build rejected its input.
    Postings(PostingsError),
    /// The landmark selection rejected its input.
    Selection(SelectionError),
    /// The landmark assignment failed.
    Assignment(AssignmentError<NodeRowId, HannoyIndexError<NodeRowId>>),
    /// The quotient contraction rejected its input.
    Quotient(QuotientError),
    /// The quotient graph stores no edges to lay out against.
    Layout(EdgelessGraphError),
    /// The staged representation matrix failed to map back.
    MapRepresentations(OpenArrayError),
    /// A staged sparse matrix file failed to map back.
    MapSparse(OpenSprsError),
    /// The staged k-NN file does not hold a valid table.
    InvalidKnn(InvalidKnnFile),
    /// The staged semantic file does not hold a valid graph.
    InvalidSemantic(InvalidSemanticFile),
    /// The staged landmark file failed to map back.
    MapLandmarks(OpenLandmarkError),
    /// The staged landmark file does not hold a valid skeleton.
    InvalidLandmarks(InvalidLandmarkFile),
    /// A staged identity file failed to map back.
    MapIdentities(OpenIdentityError),
    /// A staged identity file does not hold a valid table.
    InvalidIdentities(InvalidIdentityFile),
    /// The projector placement failed to train, measure, or publish.
    Placement(PlacementError),
    /// The prior generation offered for reuse could not serve it.
    Prior(PriorError),
    /// The finished staging failed to seal into a generation.
    Seal(SealError),
    /// A stage panicked on the compute pool.
    ///
    /// The payload's message survives, the staging directory was removed during unwinding, and the
    /// async executor never observes the unwind.
    Panicked { message: Option<String> },
}

impl From<io::Error> for StageError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<SpotCheckError> for StageError {
    fn from(error: SpotCheckError) -> Self {
        Self::NormCheck(error)
    }
}

impl From<HannoyIndexError<NodeRowId>> for StageError {
    fn from(error: HannoyIndexError<NodeRowId>) -> Self {
        Self::Index(error)
    }
}

impl From<PredictError> for StageError {
    fn from(error: PredictError) -> Self {
        Self::Classify(error)
    }
}

impl From<ResolveError> for StageError {
    fn from(error: ResolveError) -> Self {
        Self::Policy(error)
    }
}

impl From<OpenPolicyError> for StageError {
    fn from(error: OpenPolicyError) -> Self {
        Self::MapPolicies(error)
    }
}

impl From<InvalidPolicyFile> for StageError {
    fn from(error: InvalidPolicyFile) -> Self {
        Self::InvalidPolicies(error)
    }
}

impl From<RelationIndexError> for StageError {
    fn from(error: RelationIndexError) -> Self {
        Self::Relation(error)
    }
}

impl From<WriteSprsError> for StageError {
    fn from(error: WriteSprsError) -> Self {
        Self::WriteSparse(error)
    }
}

impl From<KnnError<NodeRowId, HannoyIndexError<NodeRowId>>> for StageError {
    fn from(error: KnnError<NodeRowId, HannoyIndexError<NodeRowId>>) -> Self {
        Self::Knn(error)
    }
}

impl From<NnDescentError> for StageError {
    fn from(error: NnDescentError) -> Self {
        Self::Descent(error)
    }
}

impl From<QuadError> for StageError {
    fn from(error: QuadError) -> Self {
        Self::Quad(error)
    }
}

impl From<PostingsError> for StageError {
    fn from(error: PostingsError) -> Self {
        Self::Postings(error)
    }
}

impl From<InvalidAdjacencyFile> for StageError {
    fn from(error: InvalidAdjacencyFile) -> Self {
        Self::InvalidAdjacency(error)
    }
}

impl From<LodError> for StageError {
    fn from(error: LodError) -> Self {
        Self::Lod(error)
    }
}

impl From<SelectionError> for StageError {
    fn from(error: SelectionError) -> Self {
        Self::Selection(error)
    }
}

impl From<AssignmentError<NodeRowId, HannoyIndexError<NodeRowId>>> for StageError {
    fn from(error: AssignmentError<NodeRowId, HannoyIndexError<NodeRowId>>) -> Self {
        Self::Assignment(error)
    }
}

impl From<QuotientError> for StageError {
    fn from(error: QuotientError) -> Self {
        Self::Quotient(error)
    }
}

impl From<EdgelessGraphError> for StageError {
    fn from(error: EdgelessGraphError) -> Self {
        Self::Layout(error)
    }
}

impl From<OpenSprsError> for StageError {
    fn from(error: OpenSprsError) -> Self {
        Self::MapSparse(error)
    }
}

impl From<InvalidKnnFile> for StageError {
    fn from(error: InvalidKnnFile) -> Self {
        Self::InvalidKnn(error)
    }
}

impl From<InvalidSemanticFile> for StageError {
    fn from(error: InvalidSemanticFile) -> Self {
        Self::InvalidSemantic(error)
    }
}

impl From<OpenLandmarkError> for StageError {
    fn from(error: OpenLandmarkError) -> Self {
        Self::MapLandmarks(error)
    }
}

impl From<InvalidLandmarkFile> for StageError {
    fn from(error: InvalidLandmarkFile) -> Self {
        Self::InvalidLandmarks(error)
    }
}

impl From<OpenIdentityError> for StageError {
    fn from(error: OpenIdentityError) -> Self {
        Self::MapIdentities(error)
    }
}

impl From<InvalidIdentityFile> for StageError {
    fn from(error: InvalidIdentityFile) -> Self {
        Self::InvalidIdentities(error)
    }
}

impl From<PlacementError> for StageError {
    fn from(error: PlacementError) -> Self {
        Self::Placement(error)
    }
}

impl From<TrainError<NodeRowId>> for StageError {
    fn from(error: TrainError<NodeRowId>) -> Self {
        Self::Placement(error.into())
    }
}

impl From<CheckpointError> for StageError {
    fn from(error: CheckpointError) -> Self {
        Self::Placement(error.into())
    }
}

impl From<RefreshError<NodeRowId>> for StageError {
    fn from(error: RefreshError<NodeRowId>) -> Self {
        Self::Placement(error.into())
    }
}

impl From<LadderError> for StageError {
    fn from(error: LadderError) -> Self {
        Self::Placement(error.into())
    }
}

impl From<CanonicalError> for StageError {
    fn from(error: CanonicalError) -> Self {
        Self::Placement(error.into())
    }
}

impl From<PriorError> for StageError {
    fn from(error: PriorError) -> Self {
        Self::Prior(error)
    }
}

impl From<SealError> for StageError {
    fn from(error: SealError) -> Self {
        Self::Seal(error)
    }
}

/// Formats one staged artifact's map-back failure.
fn map_back(fmt: &mut fmt::Formatter<'_>, artifact: &str, error: &dyn fmt::Display) -> fmt::Result {
    write!(fmt, "the staged {artifact} failed to map back: {error}")
}

impl fmt::Display for StageError {
    #[expect(
        clippy::too_many_lines,
        reason = "one display arm per stage failure; the taxonomy is the length"
    )]
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(fmt, "a staged write failed: {error}"),
            Self::NormCheck(error) => write!(fmt, "the norm spot check could not run: {error}"),
            Self::RepresentationDefects(check) => write!(
                fmt,
                "{} of {} sampled representation rows violate the source contract",
                check.defects.len(),
                check.sampled_rows,
            ),
            Self::Index(error) => write!(fmt, "the search backend failed: {error}"),
            Self::RecallBelowMinimum(check) => write!(
                fmt,
                "the search backend's recall {:.4} falls below the {:.4} minimum by more than the \
                 {:.4} its sample resolves",
                check.recall(),
                check.minimum_recall,
                check.resolution,
            ),
            Self::Descent(error) => {
                write!(fmt, "the NN-Descent construction failed: {error}")
            }
            Self::Knn(error) => {
                write!(fmt, "the k-NN table failed to assemble or admit: {error}")
            }
            Self::ClassifierTraining(error) => write!(
                fmt,
                "the assembled corpus violates the training-set contract: {error}"
            ),
            Self::ClassifierFit(error) => {
                write!(fmt, "the relation classifier failed to fit: {error}")
            }
            Self::Classify(error) => write!(fmt, "a relation card failed to classify: {error}"),
            Self::Policy(error) => write!(fmt, "the policy resolution failed: {error}"),
            Self::MapPolicies(error) => map_back(fmt, "policy file", error),
            Self::InvalidPolicies(error) => {
                write!(fmt, "the staged policy file is not a valid table: {error}")
            }
            Self::Relation(error) => write!(fmt, "the relation index build failed: {error}"),
            Self::WriteSparse(error) => {
                write!(fmt, "a sparse artifact failed to write: {error}")
            }
            Self::MapEndpoints(error) => map_back(fmt, "endpoint column", error),
            Self::MapAdjacency(error) => map_back(fmt, "adjacency", error),
            Self::InvalidAdjacency(error) => {
                write!(
                    fmt,
                    "the staged adjacency does not hold valid lists: {error}"
                )
            }
            Self::MapCards(error) => map_back(fmt, "card-embedding matrix", error),
            Self::MapCoordinates(error) => map_back(fmt, "coordinate column", error),
            Self::CoordinateShape => fmt.write_str("the staged coordinates are not f32 pairs"),
            Self::WireEncoding { rows } => write!(
                fmt,
                "the corpus holds {rows} rows, beyond the u32 wire position encoding"
            ),
            Self::Lod(error) => write!(fmt, "the level-of-detail derivation failed: {error}"),
            Self::Quad(error) => write!(fmt, "the quadtree build failed: {error}"),
            Self::Postings(error) => write!(fmt, "the postings build failed: {error}"),
            Self::Selection(error) => write!(fmt, "the landmark selection failed: {error}"),
            Self::Assignment(error) => write!(fmt, "the landmark assignment failed: {error}"),
            Self::Quotient(error) => write!(fmt, "the quotient contraction failed: {error}"),
            Self::Layout(error) => write!(fmt, "the landmark layout failed: {error}"),
            Self::MapRepresentations(error) => map_back(fmt, "representation matrix", error),
            Self::MapSparse(error) => {
                write!(fmt, "a staged sparse matrix failed to map back: {error}")
            }
            Self::InvalidKnn(error) => {
                write!(fmt, "the staged k-NN file is not a valid table: {error}")
            }
            Self::InvalidSemantic(error) => {
                write!(
                    fmt,
                    "the staged semantic file is not a valid graph: {error}"
                )
            }
            Self::MapLandmarks(error) => map_back(fmt, "landmark file", error),
            Self::InvalidLandmarks(error) => write!(
                fmt,
                "the staged landmark file is not a valid skeleton: {error}"
            ),
            Self::MapIdentities(error) => {
                write!(fmt, "a staged identity file failed to map back: {error}")
            }
            Self::InvalidIdentities(error) => {
                write!(fmt, "a staged identity file is not a valid table: {error}")
            }
            Self::Placement(error) => {
                write!(fmt, "the placement stage failed: {error}")
            }
            Self::Prior(error) => {
                write!(fmt, "the prior generation could not serve reuse: {error}")
            }
            Self::Seal(error) => write!(fmt, "the generation failed to publish: {error}"),
            Self::Panicked { message } => {
                fmt.write_str("a stage panicked on the compute pool")?;
                if let Some(message) = message {
                    write!(fmt, ": {message}")?;
                }
                Ok(())
            }
        }
    }
}

impl Error for StageError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::NormCheck(error) => Some(error),
            Self::Index(error) => Some(error),
            Self::Knn(error) => Some(error),
            Self::Descent(error) => Some(error),
            Self::ClassifierTraining(error) => Some(error),
            Self::ClassifierFit(error) => Some(error),
            Self::Classify(error) => Some(error),
            Self::Policy(error) => Some(error),
            Self::MapPolicies(error) => Some(error),
            Self::InvalidPolicies(error) => Some(error),
            Self::Relation(error) => Some(error),
            Self::WriteSparse(error) => Some(error),
            Self::MapAdjacency(error) | Self::MapSparse(error) => Some(error),
            Self::InvalidAdjacency(error) => Some(error),
            Self::Selection(error) => Some(error),
            Self::Assignment(error) => Some(error),
            Self::Quotient(error) => Some(error),
            Self::Layout(error) => Some(error),
            Self::MapRepresentations(error)
            | Self::MapCards(error)
            | Self::MapCoordinates(error)
            | Self::MapEndpoints(error) => Some(error),
            Self::Lod(error) => Some(error),
            Self::Quad(error) => Some(error),
            Self::Postings(error) => Some(error),
            Self::InvalidKnn(error) => Some(error),
            Self::InvalidSemantic(error) => Some(error),
            Self::MapLandmarks(error) => Some(error),
            Self::InvalidLandmarks(error) => Some(error),
            Self::MapIdentities(error) => Some(error),
            Self::InvalidIdentities(error) => Some(error),
            Self::Placement(error) => Some(error),
            Self::Prior(error) => Some(error),
            Self::Seal(error) => Some(error),
            Self::RepresentationDefects(_)
            | Self::RecallBelowMinimum(_)
            | Self::CoordinateShape
            | Self::WireEncoding { .. }
            | Self::Panicked { .. } => None,
        }
    }
}

/// One fit failed; nothing was published.
///
/// `D` is the dataset's error, `E` the embedding provider's; both can only arise during ingest.
/// Every compute-side failure arrives as [`FitError::Stage`].
#[derive(Debug)]
pub enum FitError<D, E> {
    /// The dataset failed to deliver a stream item.
    Dataset(D),
    /// The card stream failed.
    Cards(io::Error),
    /// The embedding provider failed to produce the card table.
    Embedding(CardEmbeddingError<E>),
    /// The supplied annotation corpus failed to assemble into the classifier's training set.
    Assembly(AssemblyError<E>),
    /// A streamed ingest write failed.
    Io(io::Error),
    /// A compute-side stage failed.
    Stage(StageError),
}

impl<D, E> From<io::Error> for FitError<D, E> {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

impl<D, E> From<StageError> for FitError<D, E> {
    fn from(error: StageError) -> Self {
        Self::Stage(error)
    }
}

impl<D, E> From<PriorError> for FitError<D, E> {
    fn from(error: PriorError) -> Self {
        Self::Stage(StageError::Prior(error))
    }
}

impl<D: fmt::Display, E: fmt::Display> fmt::Display for FitError<D, E> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Dataset(error) => write!(fmt, "the dataset failed to deliver: {error}"),
            Self::Cards(error) => write!(fmt, "the card stream failed: {error}"),
            Self::Embedding(error) => write!(fmt, "the card table failed to embed: {error}"),
            Self::Assembly(error) => {
                write!(fmt, "the annotation corpus failed to assemble: {error}")
            }
            Self::Io(error) => write!(fmt, "a streamed ingest write failed: {error}"),
            Self::Stage(error) => error.fmt(fmt),
        }
    }
}

impl<D, E> Error for FitError<D, E>
where
    D: Error + 'static,
    E: Error + 'static,
{
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Dataset(error) => Some(error),
            Self::Cards(error) | Self::Io(error) => Some(error),
            Self::Embedding(error) => Some(error),
            Self::Assembly(error) => Some(error),
            Self::Stage(error) => Some(error),
        }
    }
}
