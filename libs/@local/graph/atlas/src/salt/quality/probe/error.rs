use core::{error::Error, fmt, num::NonZero};

/// A design or canonical-delivery failure that prevents probe completion.
#[derive(Debug)]
pub(crate) enum ProbeError<E> {
    /// The options name no neighbourhood size.
    NoNeighbourhoods,
    /// A neighbourhood size violates the aggregate domain over one of the probe's universes.
    Neighbourhood { k: NonZero<usize>, universe: usize },
    /// The corpus row count exceeds the crate's `u32` row encoding.
    RowsExceedProbeDomain { rows: usize },
    /// A population below the rank domain contains a non-finite embedding component.
    NonFiniteEmbedding,
    /// The canonical stream failed.
    Dataset(E),
    /// The canonical stream delivered a node the probe never requested.
    UnrequestedEmbedding,
    /// The canonical stream delivered one node twice.
    RepeatedEmbedding,
    /// The canonical stream ended before covering every requested row.
    MissingEmbeddings { requested: usize, delivered: usize },
}

impl<E> fmt::Display for ProbeError<E> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::NoNeighbourhoods => {
                fmt.write_str("the options name no neighbourhood size to read at")
            }
            Self::Neighbourhood { k, universe } => write!(
                fmt,
                "neighbourhood size {k} lies outside the aggregate domain over a universe of \
                 {universe}",
            ),
            Self::RowsExceedProbeDomain { rows } => {
                write!(fmt, "{rows} rows exceed the crate's u32 row encoding")
            }
            Self::NonFiniteEmbedding => {
                fmt.write_str("a probe embedding contains a non-finite component")
            }
            Self::Dataset(_) => fmt.write_str("the canonical embedding stream failed"),
            Self::UnrequestedEmbedding => {
                fmt.write_str("the canonical stream delivered a node the probe never requested")
            }
            Self::RepeatedEmbedding => {
                fmt.write_str("the canonical stream delivered one node twice")
            }
            Self::MissingEmbeddings {
                requested,
                delivered,
            } => write!(
                fmt,
                "the canonical stream covered {delivered} of {requested} requested rows",
            ),
        }
    }
}

impl<E: Error + 'static> Error for ProbeError<E> {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Dataset(error) => Some(error),
            Self::NoNeighbourhoods
            | Self::NonFiniteEmbedding
            | Self::Neighbourhood { .. }
            | Self::RowsExceedProbeDomain { .. }
            | Self::UnrequestedEmbedding
            | Self::RepeatedEmbedding
            | Self::MissingEmbeddings { .. } => None,
        }
    }
}

/// A failed or mismatched id-keyed delivery stream.
#[derive(Debug)]
pub(crate) enum DeliveryError<E> {
    /// The stream failed.
    Dataset(E),
    /// The stream delivered an id that was never requested.
    Unrequested,
    /// The stream delivered one requested id twice.
    ///
    /// Every requested id permits one delivery. Repetition fails regardless of payload equality,
    /// without selecting one answer over another.
    Repeated,
    /// The stream ended before covering every requested id.
    Missing { requested: usize, delivered: usize },
}

impl<E> fmt::Display for DeliveryError<E> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::Dataset(_) => fmt.write_str("the delivery stream failed"),
            Self::Unrequested => {
                fmt.write_str("the stream delivered an id that was never requested")
            }
            Self::Repeated => fmt.write_str("the stream delivered one requested id twice"),
            Self::Missing {
                requested,
                delivered,
            } => write!(
                fmt,
                "the stream covered {delivered} of {requested} requested ids",
            ),
        }
    }
}

impl<E: Error + 'static> Error for DeliveryError<E> {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Dataset(error) => Some(error),
            Self::Unrequested | Self::Repeated | Self::Missing { .. } => None,
        }
    }
}
