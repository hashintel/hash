use hashql_core::id::Id;

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Id)]
#[repr(u8)]
pub enum IntrinsicId {
    EntityPropertyAccess,
}
