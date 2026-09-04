use error_stack::{Report, ResultExt as _, TryReportTupleExt as _};

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

        Ok(Self { lookup, reverse })
    }
}
