//! Prepare representations: persist the working artifacts of one
//! generation.
//!
//! The stage consumes dataset streams once and writes the artifacts
//! every later stage reads, so downstream stages address rows in
//! mapped files instead of re-consuming the source.
//! [`write_node_representations`] covers the node half: the `f32[N, 512]`
//! representation matrix, row-aligned with the node stream, and
//! [`norm::spot_check`] certifies the written rows' source contract
//! (finite, unit-norm) by acceptance sampling over the mapped matrix.
//! The card-embedding half of the stage is
//! [`embedding`](crate::salt::embedding).

use core::{error::Error, fmt, pin::pin};
use std::io::{self, Seek, Write};

use futures::TryStreamExt as _;
use zerocopy::IntoBytes as _;

use crate::{
    dataset::{Dataset, PROJECTOR_DIMENSIONS},
    file::array::{ArrayVariant, ArrayWriter, Dim},
};

pub(crate) mod norm;

#[cfg(test)]
mod tests;

/// The node representation matrix could not be persisted.
#[derive(Debug)]
pub(crate) enum PrepareError<E> {
    /// The dataset failed to deliver a node.
    Dataset(E),
    /// The destination failed to accept bytes.
    Io(io::Error),
}

impl<E: fmt::Display> fmt::Display for PrepareError<E> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Dataset(error) => write!(fmt, "the dataset failed to deliver a node: {error}"),
            Self::Io(error) => write!(fmt, "the representation matrix failed to write: {error}"),
        }
    }
}

impl<E: Error + 'static> Error for PrepareError<E> {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Dataset(error) => Some(error),
            Self::Io(error) => Some(error),
        }
    }
}

/// Streams every node's representation into one `f32[N, 512]` array file.
///
/// Row `i` of the written matrix is the embedding of node row `i`, so the
/// matrix is row-aligned with every artifact keyed by
/// [`NodeRowId`](crate::dataset::NodeRowId). Returns the number of rows
/// written. The finished file's repository digest is computed at publish.
///
/// Every node issues one write; wrap a raw [`File`](std::fs::File) in a
/// [`BufWriter`](io::BufWriter).
///
/// # Errors
///
/// Returns an error when the dataset fails to deliver a node or the
/// destination fails to accept bytes; either way the destination holds an
/// unfinished file no reader accepts.
#[expect(
    clippy::future_not_send,
    reason = "the `Dataset` trait does not promise `Send` streams; the future's sendability \
              follows the dataset's"
)]
pub(crate) async fn write_node_representations<D: Dataset>(
    dataset: &D,
    writer: impl Write + Seek,
) -> Result<u64, PrepareError<D::Error>> {
    let mut writer = ArrayWriter::new(
        writer,
        ArrayVariant::F32,
        &[Dim::new(PROJECTOR_DIMENSIONS as u64)],
    )
    .map_err(PrepareError::Io)?;

    let mut nodes = pin!(dataset.nodes());
    while let Some(node) = nodes.try_next().await.map_err(PrepareError::Dataset)? {
        writer
            .write_row(node.embedding.as_bytes())
            .map_err(PrepareError::Io)?;
    }

    writer.finish().map_err(PrepareError::Io)
}
