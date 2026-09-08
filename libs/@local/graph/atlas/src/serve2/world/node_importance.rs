//! Importance ranks in base-position order.
//!
//! [`ImportanceRank`] orders nodes by importance, with zero first. [`BasePosition`] indexes their
//! geometry. The inverse mappings support access in either order.

use core::ops::Index;

use error_stack::{Report, ReportSink, ResultExt as _, TryReportTupleExt as _};

use super::{OpenOptions, error::WorldError};
use crate::{
    identity::{BasePosition, Column, ImportanceRank, NodeRowId},
    postgres::id::ArchivedEntityId,
};

/// Node-selection order, with lower values more prominent.
///
/// Identity keys give nodes without an [`ImportanceRank`] a stable order after ranked nodes.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub(crate) enum NodePriority {
    Rank(ImportanceRank),
    Identity(ArchivedEntityId),
}

/// Node ordering over allocated rows, independent of visibility.
pub(crate) trait ImportanceProvider {
    fn provide_priority(&self, node: NodeRowId) -> Option<NodePriority>;
}

impl<T: ImportanceProvider + ?Sized> ImportanceProvider for &T {
    fn provide_priority(&self, node: NodeRowId) -> Option<NodePriority> {
        T::provide_priority(self, node)
    }
}

/// Inverse mappings between importance ranks and base positions.
#[derive(Debug)]
pub(crate) struct NodeImportance {
    lookup: Column<BasePosition, ImportanceRank>,
    reverse: Column<ImportanceRank, BasePosition>,
}

impl NodeImportance {
    /// Opens the rank permutations and checks their lengths.
    ///
    /// # Errors
    ///
    /// Returns [`WorldError`] for artifact opening or mismatched rank counts.
    pub(crate) fn open(
        OpenOptions { generation, .. }: OpenOptions<'_>,
    ) -> Result<Self, Report<[WorldError]>> {
        let files = &generation.repository().files;

        let lookup = files
            .rank_of_position
            .open(generation)
            .change_context(WorldError::Open {
                file: files.rank_of_position.name(),
            });

        let reverse = files
            .position_of_rank
            .open(generation)
            .change_context(WorldError::Open {
                file: files.position_of_rank.name(),
            });

        let (lookup, reverse) = (lookup, reverse).try_collect()?;

        let this = Self { lookup, reverse };

        let mut sink = ReportSink::new_armed();

        if this.lookup.len() != this.reverse.len() {
            sink.capture(WorldError::NodeImportanceCountMismatch {
                lookup: this.lookup.len(),
                reverse: this.reverse.len(),
            });
        }

        sink.finish_ok(this)
    }

    /// Returns the rank at `index`, or [`None`] outside the position domain.
    pub(crate) fn lookup(&self, index: BasePosition) -> Option<ImportanceRank> {
        self.lookup.view().get(index).copied()
    }

    /// Returns the position at `index`, or [`None`] outside the rank domain.
    pub(crate) fn reverse(&self, index: ImportanceRank) -> Option<BasePosition> {
        self.reverse.view().get(index).copied()
    }

    pub(crate) fn len(&self) -> usize {
        self.lookup.len()
    }
}

impl Index<BasePosition> for NodeImportance {
    type Output = ImportanceRank;

    fn index(&self, index: BasePosition) -> &Self::Output {
        &self.lookup.view()[index]
    }
}

impl Index<ImportanceRank> for NodeImportance {
    type Output = BasePosition;

    fn index(&self, index: ImportanceRank) -> &Self::Output {
        &self.reverse.view()[index]
    }
}

#[cfg(test)]
mod tests {
    use core::assert_matches;

    use hashql_core::id::Id as _;
    use uuid::Uuid;

    use super::{NodeImportance, NodePriority};
    use crate::{
        identity::ImportanceRank,
        postgres::id::ArchivedEntityId,
        serve2::{
            tests::fixture::{NODES, TamperFixture, secret, shorten_u32_column},
            world::{OpenOptions, error::WorldError},
        },
    };

    fn entity(web: u128, id: u128) -> ArchivedEntityId {
        ArchivedEntityId {
            web_id: Uuid::from_u128(web).into(),
            entity_uuid: Uuid::from_u128(id).into(),
        }
    }

    /// Every rank precedes every identity, including the domain extremes.
    #[test]
    fn priority_boundary() {
        let min_rank = NodePriority::Rank(ImportanceRank::MIN);
        let max_rank = NodePriority::Rank(ImportanceRank::MAX);
        let min_identity = NodePriority::Identity(entity(0, 0));
        let max_identity = NodePriority::Identity(entity(u128::MAX, u128::MAX));

        assert!(min_rank < max_rank, "should order ranks by their value");
        assert!(
            min_identity < max_identity,
            "should order identities by their value"
        );
        assert!(
            max_rank < min_identity,
            "should order every rank before every identity"
        );
    }

    /// Identity ordering compares the web before the entity UUID.
    #[test]
    fn priority_identity_order() {
        let same_web_low = NodePriority::Identity(entity(1, 1));
        let same_web_high = NodePriority::Identity(entity(1, 2));
        let other_web_low = NodePriority::Identity(entity(2, 0));

        assert!(
            same_web_low < same_web_high,
            "should break ties on the entity UUID"
        );
        assert!(
            same_web_high < other_web_low,
            "should compare the web before the entity UUID"
        );
    }

    /// Open refuses a rank-of-position column short of the position-of-rank column, under
    /// [`WorldError::NodeImportanceCountMismatch`].
    #[test]
    fn rank_column_short() {
        let fixture = TamperFixture::publish("node-importance-rank-column-short");
        let columns = usize::try_from(NODES).expect("fixture node counts fit usize");
        let files = &fixture.generation().repository().files;

        let tampered = fixture.tamper(&files.rank_of_position.name(), |path| {
            shorten_u32_column(path, NODES - 1);
        });
        let report = NodeImportance::open(OpenOptions {
            generation: &tampered,
            secret: &secret(),
        })
        .expect_err("open refuses a short rank-of-position column");

        assert_matches!(
            report.current_contexts().collect::<Vec<_>>().as_slice(),
            [WorldError::NodeImportanceCountMismatch { lookup, reverse }]
                if *lookup == columns - 1 && *reverse == columns,
        );
    }

    /// Open refuses a position-of-rank column short of the rank-of-position column, under
    /// [`WorldError::NodeImportanceCountMismatch`].
    #[test]
    fn rank_positions_short() {
        let fixture = TamperFixture::publish("node-importance-rank-positions-short");
        let columns = usize::try_from(NODES).expect("fixture node counts fit usize");
        let files = &fixture.generation().repository().files;

        let tampered = fixture.tamper(&files.position_of_rank.name(), |path| {
            shorten_u32_column(path, NODES - 1);
        });
        let report = NodeImportance::open(OpenOptions {
            generation: &tampered,
            secret: &secret(),
        })
        .expect_err("open refuses a short position-of-rank column");

        assert_matches!(
            report.current_contexts().collect::<Vec<_>>().as_slice(),
            [WorldError::NodeImportanceCountMismatch { lookup, reverse }]
                if *lookup == columns && *reverse == columns - 1,
        );
    }
}
