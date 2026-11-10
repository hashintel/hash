use hashql_core::id::Id;

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Id)]
#[repr(u8)]
pub enum IntrinsicId {
    EntityPropertyAccess,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Intrinsic {
    pub id: IntrinsicId,
    // Hint to any optimization passes whether the intrinsic should participate in optimization, or
    // should be skipped.
    pub optimize: bool,
}

impl Intrinsic {
    #[must_use]
    pub const fn new(id: IntrinsicId) -> Self {
        Self { id, optimize: true }
    }
}
