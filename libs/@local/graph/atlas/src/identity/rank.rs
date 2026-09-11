//! The importance rank domain.

#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]

hashql_core::id::newtype! {
    /// A reference to a point by its ordinal in one ranking's importance order.
    ///
    /// Rank 0 is the most important row of the ranking that assigned it. Ranks are dense and
    /// zero-based over that ranking's rows, so a rank is valid only against its own ranking: the
    /// generation's corpus ranking and a view's restricted ranking share no rank vocabulary, and
    /// converting between them goes through the rows they rank, never by reinterpreting the
    /// integer.
    ///
    /// The little-endian representation is the persisted form, so an artifact file stores a column of these ranks with no conversion on write or read.
    #[id(endian = little, unaligned, const)]
    pub struct ImportanceRank(u32)
}
