//! The key order domain.

hashql_core::id::newtype! {
    /// A reference to a point by its ordinal in a generation's `(key, rank)` order.
    ///
    /// The key order sorts every point by Morton key and breaks ties by importance rank, so ordinal
    /// `o` names the `o`-th point of that total order. Ordinals are dense and zero-based over the
    /// generation's points.
    ///
    /// The key order and the base order are different permutations of the same points. A bucket-major cut reads the base order, while a prefix scan over spatial keys reads this one. Converting between them goes through the generation's key-order columns, never by reinterpreting the integer.
    ///
    /// [`BasePosition`]: crate::identity::BasePosition
    #[id(derive(Step), const)]
    pub struct KeyOrdinal(u32)
}
