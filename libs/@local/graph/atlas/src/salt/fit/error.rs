//! The fit pipeline's failure surface.

use core::{error::Error, fmt};
use std::io;

use super::prepare::norm::{NormSpotCheck, SpotCheckError};
use crate::{
    file::{
        array::OpenArrayError, generation::SealError, landmark::read::OpenLandmarkError,
        sprs::read::OpenSprsError,
    },
    salt::{
        embedding::CardEmbeddingError,
        knn::{artifact::InvalidKnnFile, error::KnnError, hannoy::HannoyIndexError, recall},
        landmark::{
            artifact::InvalidLandmarkFile, assignment::AssignmentError, layout::EdgelessGraphError,
            quotient::QuotientError, select::SelectionError,
        },
        semantic::artifact::InvalidSemanticFile,
    },
};

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
            Self::Selection(error) => write!(fmt, "the landmark selection failed: {error}"),
            Self::Assignment(error) => write!(fmt, "the landmark assignment failed: {error}"),
            Self::Quotient(error) => write!(fmt, "the quotient contraction failed: {error}"),
            Self::Layout(error) => write!(fmt, "the landmark layout failed: {error}"),
            Self::MapRepresentations(error) => write!(
                fmt,
                "the staged representation matrix failed to map back: {error}"
            ),
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
            Self::Selection(error) => Some(error),
            Self::Assignment(error) => Some(error),
            Self::Quotient(error) => Some(error),
            Self::Layout(error) => Some(error),
            Self::MapRepresentations(error) => Some(error),
            Self::MapSparse(error) => Some(error),
            Self::InvalidKnn(error) => Some(error),
            Self::InvalidSemantic(error) => Some(error),
            Self::MapLandmarks(error) => Some(error),
            Self::InvalidLandmarks(error) => Some(error),
            Self::Seal(error) => Some(error),
            Self::RepresentationDefects(_) | Self::RecallBelowMinimum(_) => None,
        }
    }
}
