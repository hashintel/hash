//! Node-row lookup through the fitted layout's independent permutations.
//!
//! The geometry and importance columns store coordinates and ranks in [`BasePosition`] order, the
//! bucket-major delivery order, and [`NodeIndex`] maps a stable row to its position before either
//! lookup. Storing by position keeps a bucket's delivery one contiguous read, and addressing by
//! row keeps a node's identity independent of where the fit placed it.

use core::{error::Error, fmt};

use error_stack::{Report, TryReportTupleExt as _};
use hashql_core::id::Id as _;

use super::{
    OpenOptions,
    error::WorldError,
    geometry::Geometry,
    node_importance::{ImportanceProvider, NodeImportance, NodePriority},
    node_index::NodeIndex,
};
use crate::{
    identity::{BasePosition, ImportanceRank, NodeRowId},
    math::{Bounds2, Vec2},
    morton::{Depth, MortonCell, MortonKey},
    serve::delta::{
        epoch::Epoch,
        layout::provider::{NaiveLayoutProvider, VersionedLayoutProvider as _},
    },
};

/// Visible node coordinates addressed by stable row identity.
pub(crate) trait LayoutProvider {
    /// Returns the allocated row count, including withdrawn and unplaced rows.
    fn provide_node_count(&self) -> usize;
    /// Returns the visible position in the [wire frame](crate::salt::lod::stage::WIRE_FRAME).
    ///
    /// Returns [`None`] for withdrawn or unplaced rows.
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
        /// The rank's reverse position, absent outside the rank domain.
        roundtrip: Option<BasePosition>,
    },
    /// The row columns are not inverse.
    RowInverse {
        /// The sampled base position.
        position: BasePosition,
        /// The row the position carries.
        row: NodeRowId,
        /// The row's reverse position, absent outside the row domain.
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
    /// Node identities and the row/base-position permutation.
    pub index: NodeIndex,
    /// The rank/base-position permutation.
    importance: NodeImportance,

    /// Coordinates, Morton order and the spatial index in base-position order.
    geometry: Geometry,
}

impl Layout {
    /// Opens the fitted layout and checks column counts and sampled inverse mappings.
    ///
    /// # Errors
    ///
    /// Returns [`WorldError`] for artifact opening, count or sampled roundtrip failures.
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

        let nodes = this.index.len();
        if nodes != this.importance.len() || nodes != this.geometry.node_count() {
            return Err(Report::new(WorldError::LayoutCountMismatch {
                index: nodes,
                importance: this.importance.len(),
                geometry: this.geometry.node_count(),
            })
            .expand());
        }

        this.try_roundtrip_sample().map_err(|error| {
            Report::new(error)
                .change_context(WorldError::LayoutRoundtrip)
                .expand()
        })?;

        Ok(this)
    }

    /// Checks the rank and row permutations against their recorded inverses at sampled positions.
    ///
    /// The sample is at most 64 positions, evenly spaced over the base positions with both ends
    /// included. At 64 nodes or fewer every position is checked. Above that, the stored position
    /// of a row the sample does not reach is not checked here. Over two or more nodes, a column
    /// sending every position to one value fails no later than the first sampled position past
    /// zero, because a single roundtrip position can agree with at most one sampled position.
    ///
    /// # Errors
    ///
    /// Returns the first [`LayoutRoundtripError`] a sampled position produces: the rank pairing
    /// is checked before the row pairing at each position.
    #[expect(
        clippy::integer_division,
        clippy::integer_division_remainder_used,
        reason = "an evenly spaced sample point is the floor of its proportional position"
    )]
    fn try_roundtrip_sample(&self) -> Result<(), LayoutRoundtripError> {
        /// The number of positions checked, at most one per node.
        const SAMPLES: u64 = 64;
        let nodes = self.geometry.node_count() as u64;

        // opening the node index rejects out-of-range counts.
        if nodes == 0 || u32::try_from(nodes - 1).is_err() {
            return Ok(());
        }

        // The count check in `open` matched both permutation columns to the geometry, and every
        // sampled position lies below that count.
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
            let roundtrip = self.index.base_reverse(row);
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

    /// Reads one recorded bucket's rows and keys inside a cell, in base delivery order.
    pub(crate) fn base_run(
        &self,
        bucket: Depth,
        cell: MortonCell,
    ) -> impl Iterator<Item = (MortonKey, NodeRowId)> {
        let morton = self.geometry.morton_order();
        morton
            .run(bucket, cell)
            .map(move |position| (morton.code(position), self.index[position]))
    }

    /// Returns a base row's recorded bucket, independent of visibility.
    ///
    /// Returns [`None`] outside the fitted row domain.
    ///
    /// # Panics
    ///
    /// Panics when the row's recorded base position lies at or beyond the Morton order's count.
    /// The reverse column returns the recorded value unchecked, and opening samples that column
    /// rather than checking every row. A malformed entry at an unsampled row therefore reaches the
    /// Morton order's own assertion.
    pub(crate) fn base_bucket_of(&self, node: NodeRowId) -> Option<Depth> {
        let position = self.index.base_reverse(node)?;
        Some(self.geometry.morton_order().bucket_of(position))
    }

    /// Counts base rows in the recorded buckets from the root through `cut`, inclusive.
    pub(crate) fn base_count_through(&self, cut: Depth) -> usize {
        self.geometry
            .morton_order()
            .fenceposts()
            .segment(cut)
            .end
            .as_usize()
    }

    /// Returns the recorded world frame's image in the wire frame.
    ///
    /// The value is [`None`] when the Morton order holds no code. Open takes it from the
    /// generation's frame metadata rather than measuring the fitted coordinates. For canonical fit
    /// output it is their tight extent up to the normalization's rounding.
    pub(crate) const fn base_bounds(&self) -> Option<Bounds2> {
        self.geometry.bounds()
    }

    /// Returns the deepest recorded bucket holding a base row, [`None`] when no bucket does.
    pub(crate) fn base_deepest_occupied(&self) -> Option<Depth> {
        self.geometry
            .morton_order()
            .fenceposts()
            .segments()
            .into_iter()
            .enumerate()
            .rev()
            .find(|(_, segment)| !segment.is_empty())
            .map(|(bucket, _)| Depth::from_usize(bucket))
    }

    /// Returns whether a recorded bucket contains a base row inside `cell`.
    pub(crate) fn base_occupied(&self, bucket: Depth, cell: MortonCell) -> bool {
        !self.geometry.morton_order().run(bucket, cell).is_empty()
    }

    /// Returns the deepest prefix shared with any recorded base key.
    ///
    /// Returns [`None`] when the generation records no key.
    pub(crate) fn base_shared_depth(&self, key: MortonKey) -> Option<Depth> {
        let morton = self.geometry.morton_order();
        let codes = morton.codes();

        morton
            .fenceposts()
            .segments()
            .into_iter()
            .filter_map(|segment| {
                let codes = &codes[segment];
                let at = codes.partition_point(|code| code.get() < key.to_bits());
                // Codes sort within each bucket's segment. For every depth, the codes sharing that
                // depth's prefix with `key` form one contiguous run of the sorted segment, and a
                // non-empty run holds one of the two codes adjacent to `key`'s insertion point.
                // The deepest shared prefix in the segment is therefore attained at one of those
                // two codes.
                [at.checked_sub(1), (at < codes.len()).then_some(at)]
                    .into_iter()
                    .flatten()
                    .map(|index| key.shared_depth(MortonKey::from_bits(codes[index].get())))
                    .max()
            })
            .max()
    }

    /// Returns an allocated row's priority, independent of visibility.
    ///
    /// # Panics
    ///
    /// Panics if this layout does not belong to the epoch's world.
    pub(crate) fn priority(&self, epoch: &Epoch, node: NodeRowId) -> Option<NodePriority> {
        epoch.importance(self).provide_priority(node)
    }

    /// Returns the allocated node count, including withdrawn and unplaced rows.
    ///
    /// # Panics
    ///
    /// Panics if this layout does not belong to the epoch's world.
    pub(crate) fn node_count(&self, epoch: &Epoch) -> usize {
        let base = NaiveLayoutProvider::new(self);
        epoch.layout(self).bind(&base).provide_node_count()
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
            .bind(&base)
            .provide_position_at(node, epoch.revision())
    }
}

impl ImportanceProvider for Layout {
    /// Returns the fitted [`NodePriority::Rank`] at `node`'s base position.
    ///
    /// Returns [`None`] if the row has no base position or that position is outside the rank
    /// column.
    fn provide_priority(&self, node: NodeRowId) -> Option<NodePriority> {
        self.importance
            .lookup(self.index.base_reverse(node)?)
            .map(NodePriority::Rank)
    }
}

impl LayoutProvider for Layout {
    fn provide_node_count(&self) -> usize {
        self.geometry.node_count()
    }

    /// Returns the fitted coordinate at `node`'s base position.
    ///
    /// Returns [`None`] if the row has no base position or that position is outside the coordinate
    /// column.
    fn provide_position(&self, node: NodeRowId) -> Option<Vec2> {
        self.geometry.position(self.index.base_reverse(node)?)
    }
}

#[cfg(test)]
mod tests {
    use core::assert_matches;

    use hashql_core::id::Id as _;

    use super::{Layout, LayoutProvider, LayoutRoundtripError};
    use crate::{
        identity::{BasePosition, ImportanceRank, NodeRowId},
        serve::{
            schedule::ScopeSchedule,
            tests::fixture::{
                NODES, TamperFixture, constant_u32_column, constant_u64_column, secret,
                set_row_position, shorten_entities, shorten_u32_column,
            },
            world::{
                OpenOptions,
                error::WorldError,
                node_importance::{ImportanceProvider, NodePriority},
            },
        },
    };

    /// Priority follows the row-to-position permutation before rank lookup.
    #[test]
    fn priority_row_permutation() {
        let fixture = TamperFixture::publish("layout-priority-row-position-rank");
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
                ImportanceProvider::provide_priority(&layout, row),
                Some(NodePriority::Rank(layout.importance[position])),
                "should resolve the rank through the row's base position"
            );
        }
        assert!(permuted, "should exercise a non-identity row permutation");
        assert_eq!(
            ImportanceProvider::provide_priority(&layout, NodeRowId::MAX),
            None,
            "should return no priority outside the row domain"
        );
    }

    /// Position lookup follows the row-to-position permutation into the geometry.
    ///
    /// Every row answers its base position's coordinate over a non-identity permutation, and a row
    /// outside the domain answers [`None`].
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

    /// Rejects empty rank columns beside nonempty geometry before sampling positions.
    #[test]
    fn open_empty_importance() {
        let fixture = TamperFixture::publish("layout-empty-importance");
        let files = &fixture.generation().repository().files;
        let tampered = fixture.tamper(&files.rank_of_position.name(), |path| {
            shorten_u32_column(path, 0);
            shorten_u32_column(
                path.with_file_name(files.position_of_rank.name().as_str()),
                0,
            );
        });
        let report = Layout::open(OpenOptions {
            generation: &tampered,
            secret: &secret(),
        })
        .expect_err("should reject the mismatched layout counts");

        let nodes = usize::try_from(NODES).expect("fixture node counts should fit usize");
        assert_matches!(
            report.current_contexts().collect::<Vec<_>>().as_slice(),
            [WorldError::LayoutCountMismatch { index, importance: 0, geometry }]
                if *index == nodes && *geometry == nodes,
        );
    }

    /// Rejects an empty node index beside nonempty geometry before sampling positions.
    #[test]
    fn open_empty_index() {
        let fixture = TamperFixture::publish("layout-empty-index");
        let files = &fixture.generation().repository().files;
        let tampered = fixture.tamper(&files.row_of_position.name(), |path| {
            constant_u64_column(path, 0, 0);
            shorten_u32_column(
                path.with_file_name(files.position_of_row.name().as_str()),
                0,
            );
            shorten_entities::<NodeRowId>(
                path.with_file_name(files.node_identities.name().as_str()),
                0,
                0,
            );
        });
        let report = Layout::open(OpenOptions {
            generation: &tampered,
            secret: &secret(),
        })
        .expect_err("should reject the mismatched layout counts");

        let nodes = usize::try_from(NODES).expect("fixture node counts should fit usize");
        assert_matches!(
            report.current_contexts().collect::<Vec<_>>().as_slice(),
            [WorldError::LayoutCountMismatch { index: 0, importance, geometry }]
                if *importance == nodes && *geometry == nodes,
        );
    }

    /// Rejects a position-of-rank column that is not a permutation.
    ///
    /// Returns [`WorldError::LayoutRoundtrip`] from [`LayoutRoundtripError::RankInverse`].
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

    /// Rejects a rank outside the position-of-rank column's domain.
    ///
    /// Returns [`WorldError::LayoutRoundtrip`] from [`LayoutRoundtripError::RankInverse`].
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

    /// Rejects a position-of-row column that is not a permutation.
    ///
    /// Returns [`WorldError::LayoutRoundtrip`] from [`LayoutRoundtripError::RowInverse`].
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

    /// Rejects a node row outside the position-of-row column's domain.
    ///
    /// Returns [`WorldError::LayoutRoundtrip`] from [`LayoutRoundtripError::RowInverse`].
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

    /// Open accepts a malformed entry outside the roundtrip sample.
    ///
    /// The entry's first use refuses it. 65 nodes leave position 63 outside the sample, and the
    /// missing coordinate is first required during full-base schedule construction.
    #[test]
    #[should_panic(expected = "should resolve the base node's position")]
    fn row_position_unsampled() {
        let fixture = TamperFixture::publish_with_nodes("layout-unsampled-row", 65);
        let files = &fixture.generation().repository().files;
        let layout = Layout::open(OpenOptions {
            generation: fixture.generation(),
            secret: &secret(),
        })
        .expect("the untampered layout opens");

        // the sample uses index * 64 / 63 for index in 0..64, checking positions 0..=62 and 64.
        let unsampled = layout.index[BasePosition::from_u64(63)];

        let tampered = fixture.tamper(&files.position_of_row.name(), |path| {
            set_row_position(path, unsampled, BasePosition::MAX);
        });
        let layout = Layout::open(OpenOptions {
            generation: &tampered,
            secret: &secret(),
        })
        .expect("should open with the malformed entry outside the sample");

        assert_eq!(LayoutProvider::provide_position(&layout, unsampled), None);
        assert_eq!(
            ImportanceProvider::provide_priority(&layout, unsampled),
            None
        );

        ScopeSchedule::from_base(&layout);
    }

    /// Open refuses a malformed entry inside an exhaustive roundtrip sample.
    ///
    /// 64 nodes make the sample exhaustive, including the malformed entry at position 63.
    #[test]
    fn row_position_sampled() {
        let fixture = TamperFixture::publish_with_nodes("layout-unsampled-row-control", 64);
        let files = &fixture.generation().repository().files;
        let layout = Layout::open(OpenOptions {
            generation: fixture.generation(),
            secret: &secret(),
        })
        .expect("the untampered layout opens");

        let row = layout.index[BasePosition::from_u64(63)];

        let tampered = fixture.tamper(&files.position_of_row.name(), |path| {
            set_row_position(path, row, BasePosition::MAX);
        });
        let report = Layout::open(OpenOptions {
            generation: &tampered,
            secret: &secret(),
        })
        .expect_err("should reject the malformed entry inside the sample");

        assert_matches!(
            report.current_contexts().collect::<Vec<_>>().as_slice(),
            [WorldError::LayoutRoundtrip],
        );
        assert_matches!(
            report.downcast_ref::<LayoutRoundtripError>(),
            Some(LayoutRoundtripError::RowInverse {
                position,
                row: observed_row,
                roundtrip: Some(roundtrip),
            }) if *position == BasePosition::from_u64(63) && *observed_row == row && *roundtrip == BasePosition::MAX,
        );
    }
}
