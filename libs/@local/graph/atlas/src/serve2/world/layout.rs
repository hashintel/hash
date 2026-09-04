use core::{error::Error, fmt};

use error_stack::{Report, ReportSink, TryReportTupleExt as _};
use hashql_core::id::Id as _;

use super::{
    OpenOptions, error::WorldError, geometry::Geometry, node_importance::NodeImportance,
    node_index::NodeIndex,
};
use crate::identity::{BasePosition, ImportanceRank, NodeRowId};

/// A layout permutation whose recorded inverse disagrees with it at a sampled position.
#[derive(Debug)]
pub(crate) enum LayoutRoundtripError {
    /// The rank columns are not inverse.
    RankInverse {
        /// The sampled base position.
        position: BasePosition,
        /// The rank the position carries.
        rank: ImportanceRank,
        /// The position the reverse column holds at that rank, absent when the rank lies outside
        /// the rank domain.
        roundtrip: Option<BasePosition>,
    },
    /// The row columns are not inverse.
    RowInverse {
        /// The sampled base position.
        position: BasePosition,
        /// The row the position carries.
        row: NodeRowId,
        /// The position the reverse column holds at that row, absent when the row lies outside
        /// the row domain.
        roundtrip: Option<BasePosition>,
    },
}

impl fmt::Display for LayoutRoundtripError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::RankInverse {
                position,
                rank,
                roundtrip: Some(roundtrip),
            } => write!(
                fmt,
                "the rank columns are not inverse: position {position} carries rank {rank}, which \
                 the reverse column sends to position {roundtrip}",
            ),
            Self::RankInverse {
                position,
                rank,
                roundtrip: None,
            } => write!(
                fmt,
                "the rank columns are not inverse: position {position} carries rank {rank}, which \
                 lies outside the rank domain",
            ),
            Self::RowInverse {
                position,
                row,
                roundtrip: Some(roundtrip),
            } => write!(
                fmt,
                "the row columns are not inverse: position {position} carries row {row}, which \
                 the reverse column sends to position {roundtrip}",
            ),
            Self::RowInverse {
                position,
                row,
                roundtrip: None,
            } => write!(
                fmt,
                "the row columns are not inverse: position {position} carries row {row}, which \
                 lies outside the row domain",
            ),
        }
    }
}

impl Error for LayoutRoundtripError {}

pub(crate) struct Layout {
    index: NodeIndex,
    importance: NodeImportance,

    geometry: Geometry,
}

impl Layout {
    pub(crate) fn open(options: OpenOptions<'_>) -> Result<Self, Report<[WorldError]>> {
        let index = NodeIndex::open(options);
        let importance = NodeImportance::open(options);
        let geometry = Geometry::open(options);

        let (index, importance, geometry) = (index, importance, geometry).try_collect()?;

        let this = Self {
            index,
            importance,
            geometry,
        };

        let mut sink = ReportSink::new_armed();

        let nodes = this.index.len();
        if nodes != this.importance.len() || nodes != this.geometry.node_count() {
            sink.capture(WorldError::LayoutCountMismatch {
                index: nodes,
                importance: this.importance.len(),
                geometry: this.geometry.node_count(),
            });
        }

        if let Err(error) = u32::try_from(nodes) {
            sink.capture(Report::new(error).change_context(WorldError::TooManyNodes { nodes }));
        }

        if let Err(error) = this.try_roundtrip_sample() {
            sink.capture(Report::new(error).change_context(WorldError::LayoutRoundtrip));
        }

        sink.finish_ok(this)
    }

    #[expect(
        clippy::integer_division,
        clippy::integer_division_remainder_used,
        reason = "an evenly spaced sample point is the floor of its proportional position"
    )]
    fn try_roundtrip_sample(&self) -> Result<(), LayoutRoundtripError> {
        const SAMPLES: u64 = 64;
        let nodes = self.node_count() as u64;

        // Validation reports the node bound rather than returning on it, and a position is a u32.
        if nodes == 0 || u32::try_from(nodes - 1).is_err() {
            return Ok(());
        }

        let samples = SAMPLES.min(nodes);
        for index in 0..samples {
            let at = if samples == 1 {
                0
            } else {
                index * (nodes - 1) / (samples - 1)
            };

            let position = BasePosition::from_u64(at);

            let rank = self.importance[position];
            let roundtrip = self.importance.reverse(rank);
            if roundtrip != Some(position) {
                return Err(LayoutRoundtripError::RankInverse {
                    position,
                    rank,
                    roundtrip,
                });
            }

            let row = self.index[position];
            let roundtrip = self.index.reverse(row);
            if roundtrip != Some(position) {
                return Err(LayoutRoundtripError::RowInverse {
                    position,
                    row,
                    roundtrip,
                });
            }
        }

        Ok(())
    }

    pub(crate) fn node_count(&self) -> usize {
        self.geometry.node_count()
    }
}
