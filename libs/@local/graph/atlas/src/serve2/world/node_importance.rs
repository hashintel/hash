use crate::identity::{BasePosition, Column, ImportanceRank};

pub struct NodeImportance {
    lookup: Column<BasePosition, ImportanceRank>,
    reverse: Column<ImportanceRank, BasePosition>,
}
