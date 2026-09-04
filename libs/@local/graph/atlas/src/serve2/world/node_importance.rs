use core::ops::Index;

use error_stack::{Report, ReportSink, ResultExt as _, TryReportTupleExt as _};

use super::{OpenOptions, error::WorldError};
use crate::identity::{BasePosition, Column, ImportanceRank};

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
