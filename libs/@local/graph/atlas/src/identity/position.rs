//! The base position domain.

#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]

hashql_core::id::newtype! {
    /// A reference to a point by its slot in a generation's base order.
    ///
    /// The level-of-detail cascade assigns the base order as a bucket-major permutation. Slot `p` names the point that the cascade placed `p`-th. Buckets ascend across slots and each bucket keeps the order the cascade delivers. Positions are dense and zero-based over the generation's points.
    ///
    /// A position is not a row. The position column maps each slot to the [`NodeRowId`] whose point occupies it, and that map is a permutation rather than an identity. Coordinates, keys, and ranks use a position as their index. Identity tables and visibility masks use a row.
    ///
    /// The little-endian representation is the persisted form, so an artifact file stores a column of these positions with no conversion on write or read.
    ///
    /// [`NodeRowId`]: crate::identity::NodeRowId
    #[id(derive(Step), endian = little, unaligned, const)]
    pub struct BasePosition(u32)
}
