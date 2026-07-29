//! The base position domain.

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
    /// [`NodeRowId`]: crate::identity::NodeRowId
    #[id(derive(Step), const)]
    pub struct BasePosition(u32)
}
