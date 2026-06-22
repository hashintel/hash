use hashql_core::id::Id;

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Id)]
#[repr(u8)]
pub enum IntrinsicId {
    EntityPropertyAccess,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Intrinsic {
    pub id: IntrinsicId,
    // Hint to any optimization passes that this intrinsic should not be optimized in any way.
    pub optimize: bool,
}
