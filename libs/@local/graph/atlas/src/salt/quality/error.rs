//! The quality runner's error.

use core::{error::Error, fmt};

use super::probe::{DeliveryError, ProbeError};
use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    file::{array::OpenArrayError, identity::read::OpenIdentityError, sprs::read::OpenSprsError},
    salt::{fit::prepare::identity::InvalidIdentityFile, knn::artifact::InvalidKnnFile},
};

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
    /// The node-identity artifact does not hold a valid table over the dataset's id type.
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
