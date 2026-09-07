use core::ops::Index;

use error_stack::{Report, ReportSink, ResultExt as _, TryReportTupleExt as _};

use super::{OpenOptions, error::WorldError};
use crate::identity::{BasePosition, Column, ImportanceRank};

#[derive(Debug)]
pub(crate) struct NodeImportance {
    lookup: Column<BasePosition, ImportanceRank>,
    reverse: Column<ImportanceRank, BasePosition>,
}

impl NodeImportance {
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

    pub(crate) fn lookup(&self, index: BasePosition) -> Option<ImportanceRank> {
        self.lookup.view().get(index).copied()
    }

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

    use super::NodeImportance;
    use crate::serve2::{
        tests::fixture::{NODES, TamperFixture, secret, shorten_u32_column},
        world::{OpenOptions, error::WorldError},
    };

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
