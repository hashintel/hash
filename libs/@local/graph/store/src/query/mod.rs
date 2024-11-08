pub use self::{
    ordering::{NullOrdering, Ordering, Sorting, VersionedUrlSorting},
    pagination::CursorField,
};

mod ordering;
mod pagination;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub enum ConflictBehavior {
    /// If a conflict is detected, the operation will fail.
    Fail,
    /// If a conflict is detected, the operation will be skipped.
    Skip,
}
