use core::{error::Error, fmt};

use rayon::prelude::*;
use usearch::{Index, IndexOptions, MetricKind, ScalarKind};

use crate::salt::{
    graph::{ProjectorEmbeddings, USearchConfig},
    hash::{ContentHash, ContentHasher},
    identity::GenerationRowId,
    representation::PROJECTOR_DIMENSIONS,
};

/// Dense corpus-to-landmark assignment in generation-row order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct LandmarkAssignment {
    landmark_by_row: Box<[u32]>,
    content_hash: ContentHash,
}

impl LandmarkAssignment {
    /// Returns the selected-landmark ordinal assigned to one generation row.
    #[must_use]
    #[inline]
    pub(crate) fn get(&self, row: GenerationRowId) -> u32 {
        self.landmark_by_row[row.as_usize()]
    }

    /// Borrows all assignment ordinals in generation-row order.
    #[must_use]
    #[inline]
    pub(crate) fn as_slice(&self) -> &[u32] {
        &self.landmark_by_row
    }

    /// Returns the assignment artifact identity.
    #[must_use]
    #[inline]
    pub(crate) const fn content_hash(&self) -> ContentHash {
        self.content_hash
    }
}

/// Invalid selected rows or ANN output during landmark assignment.
#[derive(Debug)]
pub(crate) enum LandmarkAssignmentError {
    EmptySelection,
    UnorderedSelection,
    UnknownRow { row: u32, rows: usize },
    Index(cxx::Exception),
    MissingMatch { row: u32 },
    IndexKeyOverflow { key: u64 },
}

impl fmt::Display for LandmarkAssignmentError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EmptySelection => formatter.write_str("landmark selection cannot be empty"),
            Self::UnorderedSelection => {
                formatter.write_str("landmark rows must be strictly ordered")
            }
            Self::UnknownRow { row, rows } => {
                write!(
                    formatter,
                    "landmark row {row} is outside {rows} corpus rows"
                )
            }
            Self::Index(error) => write!(formatter, "landmark assignment index failed: {error}"),
            Self::MissingMatch { row } => {
                write!(
                    formatter,
                    "landmark assignment returned no match for row {row}"
                )
            }
            Self::IndexKeyOverflow { key } => {
                write!(
                    formatter,
                    "landmark assignment returned oversized ordinal {key}"
                )
            }
        }
    }
}

impl Error for LandmarkAssignmentError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Index(error) => Some(error),
            Self::EmptySelection
            | Self::UnorderedSelection
            | Self::UnknownRow { .. }
            | Self::MissingMatch { .. }
            | Self::IndexKeyOverflow { .. } => None,
        }
    }
}

impl From<cxx::Exception> for LandmarkAssignmentError {
    #[inline]
    fn from(error: cxx::Exception) -> Self {
        Self::Index(error)
    }
}

/// Assigns every representation to its nearest selected representation.
///
/// Selected rows are assigned to themselves without consulting the approximate
/// index. All other rows use the pinned ANN backend configuration.
///
/// # Errors
///
/// This returns an error for empty, unordered, or out-of-range selected rows,
/// index failures, empty searches, or oversized backend keys.
pub(crate) fn assign_landmarks(
    embeddings: ProjectorEmbeddings<'_>,
    selected_rows: &[GenerationRowId],
    config: USearchConfig,
) -> Result<LandmarkAssignment, LandmarkAssignmentError> {
    if selected_rows.is_empty() {
        return Err(LandmarkAssignmentError::EmptySelection);
    }
    if selected_rows.windows(2).any(|rows| rows[0] >= rows[1]) {
        return Err(LandmarkAssignmentError::UnorderedSelection);
    }
    for row in selected_rows {
        if row.as_usize() >= embeddings.len() {
            return Err(LandmarkAssignmentError::UnknownRow {
                row: row.as_u32(),
                rows: embeddings.len(),
            });
        }
    }
    let index = Index::new(&IndexOptions {
        dimensions: PROJECTOR_DIMENSIONS,
        metric: MetricKind::Cos,
        quantization: ScalarKind::F32,
        connectivity: config.connectivity.get(),
        expansion_add: config.expansion_add.get(),
        expansion_search: config.expansion_search.get(),
        multi: false,
    })?;
    index.reserve_capacity_and_threads(selected_rows.len(), 1)?;
    for (ordinal, row) in selected_rows.iter().enumerate() {
        index.add(
            u64::try_from(ordinal).expect("landmark ordinal should fit u64"),
            embeddings.row(row.as_usize()),
        )?;
    }
    index.reserve_capacity_and_threads(selected_rows.len(), rayon::current_num_threads().max(1))?;
    let landmark_by_row = (0..embeddings.len())
        .into_par_iter()
        .map(|row| {
            let generation_row =
                GenerationRowId::try_from(row).expect("validated corpus row should fit u32");
            if let Ok(ordinal) = selected_rows.binary_search(&generation_row) {
                return Ok(u32::try_from(ordinal).expect("landmark ordinal should fit u32"));
            }
            let matches = index
                .search(embeddings.row(row), 1)
                .map_err(LandmarkAssignmentError::Index)?;
            let key = *matches
                .keys
                .first()
                .ok_or(LandmarkAssignmentError::MissingMatch {
                    row: generation_row.as_u32(),
                })?;
            u32::try_from(key).map_err(|_| LandmarkAssignmentError::IndexKeyOverflow { key })
        })
        .collect::<Result<Vec<_>, _>>()?;
    let mut hasher = ContentHasher::new(b"hash.graph.atlas.salt.landmark-assignment.v3");
    hasher.update(usearch::version().as_bytes());
    hasher.update(b"single-threaded-build");
    hasher.update(index.hardware_acceleration().as_bytes());
    hasher.update(
        &u64::try_from(PROJECTOR_DIMENSIONS)
            .expect("projector dimensions should fit u64")
            .to_le_bytes(),
    );
    for value in [
        config.connectivity.get(),
        config.expansion_add.get(),
        config.expansion_search.get(),
    ] {
        hasher.update(
            &u64::try_from(value)
                .expect("USearch option should fit u64")
                .to_le_bytes(),
        );
    }
    for row in selected_rows {
        hasher.update(&row.as_u32().to_le_bytes());
    }
    for ordinal in &landmark_by_row {
        hasher.update(&ordinal.to_le_bytes());
    }
    Ok(LandmarkAssignment {
        landmark_by_row: landmark_by_row.into_boxed_slice(),
        content_hash: hasher.finish(),
    })
}
