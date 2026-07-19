//! The fit pipeline's failure surface.

use core::{error::Error, fmt};
use std::io;

use super::prepare::{
    identity::InvalidIdentityFile,
    norm::{NormSpotCheck, SpotCheckError},
};
use crate::{
    file::{
        array::OpenArrayError, generation::SealError, identity::read::OpenIdentityError,
        landmark::read::OpenLandmarkError, sprs::read::OpenSprsError,
    },
    salt::{
        embedding::CardEmbeddingError,
        knn::{artifact::InvalidKnnFile, error::KnnError, hannoy::HannoyIndexError, recall},
        landmark::{
            artifact::InvalidLandmarkFile, assignment::AssignmentError, layout::EdgelessGraphError,
            quotient::QuotientError, select::SelectionError,
        },
        lod::stage::LodError,
        policy::{ResolveError, classifier::PredictError},
        semantic::artifact::InvalidSemanticFile,
    },
};

/// A prior generation offered for reuse could not serve it.
///
/// The prior's artifacts are read exactly as published ones are; a
/// prior that fails here is corrupt, of another layout version, or of
/// another dataset's id type, and the fit aborts rather than silently
/// running without reuse.
#[derive(Debug)]
pub(crate) enum PriorError {
    /// A prior card-embedding array failed to map.
    MapCards(OpenArrayError),
    /// The prior card files do not hold row-aligned digest and
    /// embedding columns.
    MalformedCards,
    /// The prior landmark file failed to map.
    MapLandmarks(OpenLandmarkError),
    /// The prior landmark file does not hold a valid skeleton.
    InvalidLandmarks(InvalidLandmarkFile),
    /// A prior identity file failed to map.
    MapIdentities(OpenIdentityError),
    /// A prior identity file does not hold a valid table over the
    /// dataset's id type.
    InvalidIdentities(InvalidIdentityFile),
    /// The prior skeleton selects a row beyond the prior identity
    /// table: the two artifacts describe different corpora.
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

/// One fit failed; nothing was published.
///
/// `D` is the dataset's error, `E` the embedding provider's.
#[derive(Debug)]
pub(crate) enum FitError<D, E> {
    /// The dataset failed to deliver a stream item.
    Dataset(D),
    /// The card stream failed.
    Cards(io::Error),
    /// The embedding provider failed to produce the card table.
    Embedding(CardEmbeddingError<E>),
    /// A staged write, scratch directory, or digest pass failed.
    Io(io::Error),
    /// The norm spot check's sampling settings are unusable.
    NormCheck(SpotCheckError),
    /// Sampled representation rows violate the source contract.
    RepresentationDefects(NormSpotCheck),
    /// The search backend failed.
    Index(HannoyIndexError),
    /// The recall spot check failed to run.
    RecallCheck(KnnError<HannoyIndexError>),
    /// The search backend fell below the configured recall minimum.
    RecallBelowMinimum(recall::RecallSpotCheck),
    /// The k-NN table failed to assemble.
    Knn(KnnError<HannoyIndexError>),
    /// A relation card's classification overflowed.
    Classify(PredictError),
    /// The policy resolution rejected its input.
    Policy(ResolveError),
    /// The staged card-embedding matrix failed to map back.
    MapCards(OpenArrayError),
    /// The landmark selection rejected its input.
    Selection(SelectionError),
    /// The landmark assignment failed.
    Assignment(AssignmentError<HannoyIndexError>),
    /// The quotient contraction rejected its input.
    Quotient(QuotientError),
    /// The quotient graph stores no edges to lay out against.
    Layout(EdgelessGraphError),
    /// The staged representation matrix failed to map back.
    MapRepresentations(OpenArrayError),
    /// The staged coordinate column failed to map back.
    MapCoordinates(OpenArrayError),
    /// The corpus exceeds the `u32` wire position encoding.
    WireEncoding { rows: u64 },
    /// The level-of-detail derivation rejected its input.
    Lod(LodError),
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
    /// The prior generation offered for reuse could not serve it.
    Prior(PriorError),
    /// The finished staging failed to seal into a generation.
    Seal(SealError),
}

impl<D, E> From<io::Error> for FitError<D, E> {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

impl<D, E> From<SpotCheckError> for FitError<D, E> {
    fn from(error: SpotCheckError) -> Self {
        Self::NormCheck(error)
    }
}

impl<D, E> From<HannoyIndexError> for FitError<D, E> {
    fn from(error: HannoyIndexError) -> Self {
        Self::Index(error)
    }
}

impl<D, E> From<SelectionError> for FitError<D, E> {
    fn from(error: SelectionError) -> Self {
        Self::Selection(error)
    }
}

impl<D, E> From<AssignmentError<HannoyIndexError>> for FitError<D, E> {
    fn from(error: AssignmentError<HannoyIndexError>) -> Self {
        Self::Assignment(error)
    }
}

impl<D, E> From<QuotientError> for FitError<D, E> {
    fn from(error: QuotientError) -> Self {
        Self::Quotient(error)
    }
}

impl<D, E> From<EdgelessGraphError> for FitError<D, E> {
    fn from(error: EdgelessGraphError) -> Self {
        Self::Layout(error)
    }
}

impl<D, E> From<OpenSprsError> for FitError<D, E> {
    fn from(error: OpenSprsError) -> Self {
        Self::MapSparse(error)
    }
}

impl<D, E> From<OpenLandmarkError> for FitError<D, E> {
    fn from(error: OpenLandmarkError) -> Self {
        Self::MapLandmarks(error)
    }
}

impl<D, E> From<PriorError> for FitError<D, E> {
    fn from(error: PriorError) -> Self {
        Self::Prior(error)
    }
}

impl<D: fmt::Display, E: fmt::Display> fmt::Display for FitError<D, E> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Dataset(error) => write!(fmt, "the dataset failed to deliver: {error}"),
            Self::Cards(error) => write!(fmt, "the card stream failed: {error}"),
            Self::Embedding(error) => write!(fmt, "the card table failed to embed: {error}"),
            Self::Io(error) => write!(fmt, "a staged write failed: {error}"),
            Self::NormCheck(error) => {
                write!(fmt, "the norm spot check could not run: {error}")
            }
            Self::RepresentationDefects(check) => write!(
                fmt,
                "{} of {} sampled representation rows violate the source contract",
                check.defects.len(),
                check.sampled_rows,
            ),
            Self::Index(error) => write!(fmt, "the search backend failed: {error}"),
            Self::RecallCheck(error) => {
                write!(fmt, "the recall spot check could not run: {error}")
            }
            Self::RecallBelowMinimum(check) => write!(
                fmt,
                "the search backend's recall {:.4} falls below the {:.4} minimum",
                check.recall(),
                check.minimum_recall,
            ),
            Self::Knn(error) => write!(fmt, "the k-NN table failed to assemble: {error}"),
            Self::Classify(error) => {
                write!(fmt, "a relation card failed to classify: {error}")
            }
            Self::Policy(error) => write!(fmt, "the policy resolution failed: {error}"),
            Self::MapCards(error) => write!(
                fmt,
                "the staged card-embedding matrix failed to map back: {error}"
            ),
            Self::Selection(error) => write!(fmt, "the landmark selection failed: {error}"),
            Self::Assignment(error) => write!(fmt, "the landmark assignment failed: {error}"),
            Self::Quotient(error) => write!(fmt, "the quotient contraction failed: {error}"),
            Self::Layout(error) => write!(fmt, "the landmark layout failed: {error}"),
            Self::MapRepresentations(error) => write!(
                fmt,
                "the staged representation matrix failed to map back: {error}"
            ),
            Self::MapCoordinates(error) => write!(
                fmt,
                "the staged coordinate column failed to map back: {error}"
            ),
            Self::WireEncoding { rows } => write!(
                fmt,
                "the corpus holds {rows} rows, beyond the u32 wire position encoding"
            ),
            Self::Lod(error) => {
                write!(fmt, "the level-of-detail derivation failed: {error}")
            }
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
            Self::MapLandmarks(error) => {
                write!(fmt, "the staged landmark file failed to map back: {error}")
            }
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
            Self::Prior(error) => {
                write!(fmt, "the prior generation could not serve reuse: {error}")
            }
            Self::Seal(error) => write!(fmt, "the generation failed to publish: {error}"),
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
            Self::NormCheck(error) => Some(error),
            Self::Index(error) => Some(error),
            Self::RecallCheck(error) | Self::Knn(error) => Some(error),
            Self::Classify(error) => Some(error),
            Self::Policy(error) => Some(error),
            Self::Selection(error) => Some(error),
            Self::Assignment(error) => Some(error),
            Self::Quotient(error) => Some(error),
            Self::Layout(error) => Some(error),
            Self::MapRepresentations(error)
            | Self::MapCards(error)
            | Self::MapCoordinates(error) => Some(error),
            Self::MapSparse(error) => Some(error),
            Self::InvalidKnn(error) => Some(error),
            Self::InvalidSemantic(error) => Some(error),
            Self::MapLandmarks(error) => Some(error),
            Self::InvalidLandmarks(error) => Some(error),
            Self::MapIdentities(error) => Some(error),
            Self::InvalidIdentities(error) => Some(error),
            Self::Lod(error) => Some(error),
            Self::Prior(error) => Some(error),
            Self::Seal(error) => Some(error),
            Self::RepresentationDefects(_)
            | Self::RecallBelowMinimum(_)
            | Self::WireEncoding { .. } => None,
        }
    }
}
