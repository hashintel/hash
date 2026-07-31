//! The base position domain.

#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]

hashql_core::id::newtype! {
    /// A reference to a point by its slot in a generation's base order.
    ///
    /// The base order is the bucket-major permutation the level-of-detail cascade assigns: slot `p`
    /// holds the point that the cascade placed `p`-th, so slots ascend by bucket and, within a
    /// bucket, by the order the cascade delivers. Positions are dense and zero-based over the
    /// generation's points.
    ///
    /// A position is not a row: the position column maps each slot to the [`NodeRowId`] whose point
    /// occupies it, and that map is a permutation rather than an identity. Coordinates, keys, and
    /// ranks are indexed by position; identity tables and visibility masks are indexed by row.
    ///
    /// The little-endian representation is the persisted form, so a column of these positions is
    /// written to and read from artifact files without conversion.
    ///
    /// [`NodeRowId`]: crate::identity::NodeRowId
    #[id(derive(Step), endian = little, unaligned, const)]
    pub struct BasePosition(u32)
}
