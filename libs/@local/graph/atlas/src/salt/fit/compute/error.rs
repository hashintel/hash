//! The compute run's failure surface.
//!
//! [`ComputeError`] holds every failure a compute stage produces, one variant per way a stage
//! can refuse, and grows with the stages. It carries no dataset or provider type, so it is
//! `Send + 'static` by construction and crosses the rayon offload. The boundary map-ins (the
//! corpus matrix, the endpoint and card columns, the identity tables) and the placement's
//! deliberate re-reads of persisted artifacts are the only open failures here: a stage never
//! reads its own staged bytes back mid-run, so no map-back variant exists for the values that
//! now flow as owned containers.

use core::{error::Error, fmt};
use std::io;

use super::{
    super::{error::PriorError, prepare::identity::InvalidIdentityFile},
    projector::error::ProjectorError,
};
use crate::{
    file::{
        array::OpenArrayError, generation::SealError, identity::read::OpenIdentityError,
        sprs::write::WriteSprsError,
    },
    identity::NodeRowId,
    salt::{
        file::OpenVectorError,
        knn::{descent::NnDescentError, error::KnnError, hannoy::HannoyIndexError, recall},
        landmark::{
            assignment::AssignmentError, layout::EdgelessGraphError, quotient::QuotientError,
            select::SelectionError,
        },
        lod::{quad::QuadError, stage::LodError},
        policy::{
            ResolveError,
            classifier::{FitError as ClassifierFitError, PredictError, TrainingSetError},
        },
        postings::build::PostingsError,
        relation::RelationIndexError,
    },
};

/// A compute-side stage failed and published nothing.
///
/// Every variant is dataset- and provider-free, so the whole enum is `Send + 'static` and
/// crosses the rayon offload boundary.
#[derive(Debug)]
pub(crate) enum ComputeError {
    /// The staged representation matrix failed to map in at the run's boundary.
    OpenRepresentations(OpenVectorError),
    /// The staged endpoint column failed to map in.
    OpenEndpoints(OpenArrayError),
    /// The staged card table failed to map in.
    OpenCards(OpenVectorError),
    /// The staged identity table failed to map in.
    OpenIdentities(OpenIdentityError),
    /// A staged identity table does not hold a valid table.
    InvalidIdentities(InvalidIdentityFile),
    /// The quotient's distinct matrix failed to materialize.
    PersistQuotient(io::Error),
    /// A staged write or a scratch directory failed.
    Io(io::Error),
    /// A sparse artifact failed to write.
    WriteSparse(WriteSprsError),
    /// The assembled corpus violates the classifier's training-set contract.
    ClassifierTraining(TrainingSetError),
    /// The relation classifier failed to fit.
    ClassifierFit(ClassifierFitError),
    /// A relation card's classification overflowed.
    Classify(PredictError),
    /// The policy resolution rejected its input.
    Policy(ResolveError),
    /// The relation index build rejected its input.
    Relation(RelationIndexError),
    /// The search backend failed.
    Index(HannoyIndexError<NodeRowId>),
    /// The search backend's recall is demonstrably below the configured minimum.
    RecallBelowMinimum(recall::RecallSpotCheck),
    /// The k-NN table failed to assemble or admit.
    Knn(KnnError<NodeRowId, HannoyIndexError<NodeRowId>>),
    /// The NN-Descent construction failed.
    Descent(NnDescentError),
    /// The landmark selection rejected its input.
    Selection(SelectionError),
    /// The landmark assignment failed.
    Assignment(AssignmentError<NodeRowId, HannoyIndexError<NodeRowId>>),
    /// The quotient contraction rejected its input.
    Quotient(QuotientError),
    /// The quotient graph stores no edges to lay out against.
    Layout(EdgelessGraphError),
    /// The prior generation offered for reuse could not serve it.
    Prior(PriorError),
    /// The placement stage failed to bind, train, measure, or publish.
    Projector(ProjectorError),
    /// The corpus exceeds the `u32` wire position encoding.
    WireEncoding { rows: u64 },
    /// The level-of-detail derivation rejected its input.
    Lod(LodError),
    /// The quadtree build rejected its input.
    Quad(QuadError),
    /// The postings build rejected its input.
    Postings(PostingsError),
    /// The finished staging failed to seal into a generation.
    Seal(SealError),
    /// A stage panicked on the compute pool.
    ///
    /// The payload's message survives, unwinding removes the staging directory, and the async
    /// executor never observes the unwind.
    Panicked { message: Option<String> },
}

impl From<io::Error> for ComputeError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<WriteSprsError> for ComputeError {
    fn from(error: WriteSprsError) -> Self {
        Self::WriteSparse(error)
    }
}

impl From<OpenIdentityError> for ComputeError {
    fn from(error: OpenIdentityError) -> Self {
        Self::OpenIdentities(error)
    }
}

impl From<InvalidIdentityFile> for ComputeError {
    fn from(error: InvalidIdentityFile) -> Self {
        Self::InvalidIdentities(error)
    }
}

impl From<TrainingSetError> for ComputeError {
    fn from(error: TrainingSetError) -> Self {
        Self::ClassifierTraining(error)
    }
}

impl From<ClassifierFitError> for ComputeError {
    fn from(error: ClassifierFitError) -> Self {
        Self::ClassifierFit(error)
    }
}

impl From<PredictError> for ComputeError {
    fn from(error: PredictError) -> Self {
        Self::Classify(error)
    }
}

impl From<ResolveError> for ComputeError {
    fn from(error: ResolveError) -> Self {
        Self::Policy(error)
    }
}

impl From<RelationIndexError> for ComputeError {
    fn from(error: RelationIndexError) -> Self {
        Self::Relation(error)
    }
}

impl From<HannoyIndexError<NodeRowId>> for ComputeError {
    fn from(error: HannoyIndexError<NodeRowId>) -> Self {
        Self::Index(error)
    }
}

impl From<KnnError<NodeRowId, HannoyIndexError<NodeRowId>>> for ComputeError {
    fn from(error: KnnError<NodeRowId, HannoyIndexError<NodeRowId>>) -> Self {
        Self::Knn(error)
    }
}

impl From<NnDescentError> for ComputeError {
    fn from(error: NnDescentError) -> Self {
        Self::Descent(error)
    }
}

impl From<SelectionError> for ComputeError {
    fn from(error: SelectionError) -> Self {
        Self::Selection(error)
    }
}

impl From<AssignmentError<NodeRowId, HannoyIndexError<NodeRowId>>> for ComputeError {
    fn from(error: AssignmentError<NodeRowId, HannoyIndexError<NodeRowId>>) -> Self {
        Self::Assignment(error)
    }
}

impl From<QuotientError> for ComputeError {
    fn from(error: QuotientError) -> Self {
        Self::Quotient(error)
    }
}

impl From<EdgelessGraphError> for ComputeError {
    fn from(error: EdgelessGraphError) -> Self {
        Self::Layout(error)
    }
}

impl From<PriorError> for ComputeError {
    fn from(error: PriorError) -> Self {
        Self::Prior(error)
    }
}

impl From<ProjectorError> for ComputeError {
    fn from(error: ProjectorError) -> Self {
        Self::Projector(error)
    }
}

impl From<QuadError> for ComputeError {
    fn from(error: QuadError) -> Self {
        Self::Quad(error)
    }
}

impl From<LodError> for ComputeError {
    fn from(error: LodError) -> Self {
        Self::Lod(error)
    }
}

impl From<PostingsError> for ComputeError {
    fn from(error: PostingsError) -> Self {
        Self::Postings(error)
    }
}

impl From<SealError> for ComputeError {
    fn from(error: SealError) -> Self {
        Self::Seal(error)
    }
}

/// Formats one boundary artifact's map-in failure.
fn map_in(fmt: &mut fmt::Formatter<'_>, artifact: &str, error: &dyn fmt::Display) -> fmt::Result {
    write!(fmt, "the staged {artifact} failed to map in: {error}")
}

impl fmt::Display for ComputeError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::OpenRepresentations(error) => map_in(fmt, "representation matrix", error),
            Self::OpenEndpoints(error) => map_in(fmt, "endpoint column", error),
            Self::OpenCards(error) => map_in(fmt, "card-embedding matrix", error),
            Self::OpenIdentities(error) => map_in(fmt, "identity table", error),
            Self::InvalidIdentities(error) => {
                write!(fmt, "a staged identity table is not a valid table: {error}")
            }
            Self::PersistQuotient(error) => {
                write!(fmt, "the distinct matrix failed to materialize: {error}")
            }
            Self::Io(error) => write!(fmt, "a staged write failed: {error}"),
            Self::WriteSparse(error) => {
                write!(fmt, "a sparse artifact failed to write: {error}")
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
            Self::Relation(error) => write!(fmt, "the relation index build failed: {error}"),
            Self::Index(error) => write!(fmt, "the search backend failed: {error}"),
            Self::RecallBelowMinimum(check) => write!(
                fmt,
                "the search backend's recall {:.4} falls below the {:.4} minimum by more than the \
                 {:.4} its sample resolves",
                check.recall(),
                check.minimum_recall,
                check.resolution,
            ),
            Self::Knn(error) => {
                write!(fmt, "the k-NN table failed to assemble or admit: {error}")
            }
            Self::Descent(error) => {
                write!(fmt, "the NN-Descent construction failed: {error}")
            }
            Self::Selection(error) => write!(fmt, "the landmark selection failed: {error}"),
            Self::Assignment(error) => write!(fmt, "the landmark assignment failed: {error}"),
            Self::Quotient(error) => write!(fmt, "the quotient contraction failed: {error}"),
            Self::Layout(error) => write!(fmt, "the landmark layout failed: {error}"),
            Self::Prior(error) => {
                write!(fmt, "the prior generation could not serve reuse: {error}")
            }
            Self::Projector(error) => {
                write!(fmt, "the placement stage failed: {error}")
            }
            Self::WireEncoding { rows } => write!(
                fmt,
                "the corpus holds {rows} rows, beyond the u32 wire position encoding"
            ),
            Self::Lod(error) => write!(fmt, "the level-of-detail derivation failed: {error}"),
            Self::Quad(error) => write!(fmt, "the quadtree build failed: {error}"),
            Self::Postings(error) => write!(fmt, "the postings build failed: {error}"),
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

impl Error for ComputeError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::OpenRepresentations(error) | Self::OpenCards(error) => Some(error),
            Self::OpenEndpoints(error) => Some(error),
            Self::OpenIdentities(error) => Some(error),
            Self::InvalidIdentities(error) => Some(error),
            Self::PersistQuotient(error) | Self::Io(error) => Some(error),
            Self::WriteSparse(error) => Some(error),
            Self::ClassifierTraining(error) => Some(error),
            Self::ClassifierFit(error) => Some(error),
            Self::Classify(error) => Some(error),
            Self::Policy(error) => Some(error),
            Self::Relation(error) => Some(error),
            Self::Index(error) => Some(error),
            Self::Knn(error) => Some(error),
            Self::Descent(error) => Some(error),
            Self::Selection(error) => Some(error),
            Self::Assignment(error) => Some(error),
            Self::Quotient(error) => Some(error),
            Self::Layout(error) => Some(error),
            Self::Prior(error) => Some(error),
            Self::Projector(error) => Some(error),
            Self::Lod(error) => Some(error),
            Self::Quad(error) => Some(error),
            Self::Postings(error) => Some(error),
            Self::Seal(error) => Some(error),
            Self::RecallBelowMinimum(_) | Self::WireEncoding { .. } | Self::Panicked { .. } => None,
        }
    }
}
