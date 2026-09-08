//! Node-row lookup through the fitted layout's independent permutations.
//!
//! [`NodeIndex`] maps stable rows to [`BasePosition`] before coordinate and importance lookup.
//! Keeping these domains distinct preserves the layout's storage order.

use core::{error::Error, fmt};

use error_stack::{Report, ReportSink, TryReportTupleExt as _};
use hashql_core::id::Id as _;

use super::{
    OpenOptions, error::WorldError, geometry::Geometry, node_importance::NodeImportance,
    node_index::NodeIndex,
};
use crate::{
    identity::{BasePosition, ImportanceRank, NodeRowId},
    math::Vec2,
    serve2::delta::{
        epoch::Epoch,
        layout::provider::{NaiveLayoutProvider, VersionedLayoutProvider as _},
    },
};

/// Visible node coordinates addressed by stable row identity.
///
/// Positions use the [wire frame](crate::salt::lod::stage::WIRE_FRAME). The allocated row count
/// includes withdrawn and unplaced rows, whose position lookups return [`None`].
pub(crate) trait LayoutProvider {
    fn provide_node_count(&self) -> usize;
    fn provide_position(&self, node: NodeRowId) -> Option<Vec2>;
}

impl<T: LayoutProvider + ?Sized> LayoutProvider for &T {
    fn provide_node_count(&self) -> usize {
        T::provide_node_count(self)
    }

    fn provide_position(&self, node: NodeRowId) -> Option<Vec2> {
        T::provide_position(self, node)
    }
}

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

/// Fitted coordinates and importance ranks joined through the base-position permutation.
#[derive(Debug)]
pub(crate) struct Layout {
    index: NodeIndex,
    importance: NodeImportance,

    geometry: Geometry,
}

impl Layout {
    /// Opens the fitted layout and checks column counts and sampled inverse mappings.
    ///
    /// # Errors
    ///
    /// Returns [`WorldError`] for artifact opening, count, row-domain or sampled roundtrip
    /// failures.
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
        let nodes = self.geometry.node_count() as u64;

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

    /// Returns the allocated node count, including withdrawn and unplaced rows.
    ///
    /// # Panics
    ///
    /// Panics if this layout does not belong to the epoch's world.
    pub(crate) fn node_count(&self, epoch: &Epoch) -> usize {
        let base = NaiveLayoutProvider::new(self);
        epoch.layout(self).provider(&base).provide_node_count()
    }

    /// Returns the visible wire-frame position at the captured epoch's revision.
    ///
    /// # Panics
    ///
    /// Panics if this layout does not belong to the epoch's world.
    pub(crate) fn position(&self, epoch: &Epoch, node: NodeRowId) -> Option<Vec2> {
        let base = NaiveLayoutProvider::new(self);
        epoch
            .layout(self)
            .provider(&base)
            .provide_position_at(node, epoch.revision())
    }
}

impl LayoutProvider for Layout {
    fn provide_node_count(&self) -> usize {
        self.geometry.node_count()
    }

    fn provide_position(&self, node: NodeRowId) -> Option<Vec2> {
        self.geometry.position(self.index.reverse(node)?)
    }
}

#[cfg(test)]
mod tests {
    use core::assert_matches;

    use hashql_core::id::Id as _;

    use super::{Layout, LayoutProvider, LayoutRoundtripError};
    use crate::{
        identity::{BasePosition, ImportanceRank, NodeRowId},
        serve2::{
            tests::fixture::{
                NODES, TamperFixture, constant_u32_column, constant_u64_column, secret,
            },
            world::{OpenOptions, error::WorldError},
        },
    };

    #[test]
    fn positions_row_permutation() {
        let fixture = TamperFixture::publish("layout-position-permutation");
        let layout = Layout::open(OpenOptions {
            generation: fixture.generation(),
            secret: &secret(),
        })
        .expect("should open the fitted layout");

        let mut permuted = false;
        for index in 0..LayoutProvider::provide_node_count(&layout) {
            let position = BasePosition::from_usize(index);
            let row = layout.index[position];
            permuted |= row.as_usize() != index;
            assert_eq!(
                LayoutProvider::provide_position(&layout, row),
                layout.geometry.position(position),
            );
        }
        assert!(permuted, "should exercise a non-identity row permutation");
        assert_eq!(
            LayoutProvider::provide_position(&layout, NodeRowId::MAX),
            None
        );
    }

    /// Open refuses a position-of-rank column that is no permutation, under
    /// [`WorldError::LayoutRoundtrip`] from [`LayoutRoundtripError::RankInverse`].
    ///
    /// Every rank claiming position zero keeps the length and the format. The roundtrip sample
    /// therefore refuses the pairing at the first sampled position past zero.
    #[test]
    fn rank_positions_constant() {
        let fixture = TamperFixture::publish("layout-rank-positions-constant");
        let files = &fixture.generation().repository().files;

        let tampered = fixture.tamper(&files.position_of_rank.name(), |path| {
            constant_u32_column(path, NODES, 0);
        });
        let report = Layout::open(OpenOptions {
            generation: &tampered,
            secret: &secret(),
        })
        .expect_err("open refuses a position-of-rank column that is no permutation");

        assert_matches!(
            report.current_contexts().collect::<Vec<_>>().as_slice(),
            [WorldError::LayoutRoundtrip],
        );
        assert_matches!(
            report.downcast_ref::<LayoutRoundtripError>(),
            Some(LayoutRoundtripError::RankInverse {
                position,
                rank: _,
                roundtrip: Some(roundtrip),
            }) if *position > BasePosition::MIN && *roundtrip == BasePosition::MIN,
        );
    }

    /// Open refuses a rank outside the position-of-rank column's domain, under
    /// [`WorldError::LayoutRoundtrip`] from [`LayoutRoundtripError::RankInverse`].
    ///
    /// The sample reports the roundtrip as absent at the first sampled position.
    #[test]
    fn ranks_out_of_domain() {
        let fixture = TamperFixture::publish("layout-ranks-out-of-domain");
        let files = &fixture.generation().repository().files;

        let tampered = fixture.tamper(&files.rank_of_position.name(), |path| {
            constant_u32_column(path, NODES, u32::MAX);
        });
        let report = Layout::open(OpenOptions {
            generation: &tampered,
            secret: &secret(),
        })
        .expect_err("open refuses an out-of-domain rank");

        assert_matches!(
            report.current_contexts().collect::<Vec<_>>().as_slice(),
            [WorldError::LayoutRoundtrip],
        );
        assert_matches!(
            report.downcast_ref::<LayoutRoundtripError>(),
            Some(LayoutRoundtripError::RankInverse {
                position,
                rank,
                roundtrip: None,
            }) if *position == BasePosition::MIN && *rank == ImportanceRank::MAX,
        );
    }

    /// Open refuses a position-of-row column that is no permutation, under
    /// [`WorldError::LayoutRoundtrip`] from [`LayoutRoundtripError::RowInverse`].
    ///
    /// Every node claiming position zero keeps the length and the format. Position zero's own node
    /// roundtrips, and the first sampled position past it does not.
    #[test]
    fn row_positions_constant() {
        let fixture = TamperFixture::publish("layout-row-positions-constant");
        let files = &fixture.generation().repository().files;

        let tampered = fixture.tamper(&files.position_of_row.name(), |path| {
            constant_u32_column(path, NODES, 0);
        });
        let report = Layout::open(OpenOptions {
            generation: &tampered,
            secret: &secret(),
        })
        .expect_err("open refuses a position-of-row column that is no permutation");

        assert_matches!(
            report.current_contexts().collect::<Vec<_>>().as_slice(),
            [WorldError::LayoutRoundtrip],
        );
        assert_matches!(
            report.downcast_ref::<LayoutRoundtripError>(),
            Some(LayoutRoundtripError::RowInverse {
                position,
                row: _,
                roundtrip: Some(roundtrip),
            }) if *position > BasePosition::MIN && *roundtrip == BasePosition::MIN,
        );
    }

    /// Open refuses a node row outside the position-of-row column's domain, under
    /// [`WorldError::LayoutRoundtrip`] from [`LayoutRoundtripError::RowInverse`].
    ///
    /// The sample reports the roundtrip as absent at the first sampled position.
    #[test]
    fn rows_out_of_domain() {
        let fixture = TamperFixture::publish("layout-rows-out-of-domain");
        let files = &fixture.generation().repository().files;

        let tampered = fixture.tamper(&files.row_of_position.name(), |path| {
            constant_u64_column(path, NODES, u64::MAX);
        });
        let report = Layout::open(OpenOptions {
            generation: &tampered,
            secret: &secret(),
        })
        .expect_err("open refuses an out-of-domain node row");

        assert_matches!(
            report.current_contexts().collect::<Vec<_>>().as_slice(),
            [WorldError::LayoutRoundtrip],
        );
        assert_matches!(
            report.downcast_ref::<LayoutRoundtripError>(),
            Some(LayoutRoundtripError::RowInverse {
                position,
                row,
                roundtrip: None,
            }) if *position == BasePosition::MIN && *row == NodeRowId::MAX,
        );
    }
}
