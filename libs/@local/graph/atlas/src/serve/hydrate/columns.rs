//! Slot ID domains for one hydration read.
//!
//! [`NodeSlot`] and [`EdgeSlot`] index a response's delivered nodes and edges in delivered order,
//! so hydration, assembly and encoding all address the same point or link by the same number
//! without re-deriving it from an entity id.

hashql_core::id::newtype! {
    /// A reference to a delivered node by its slot in one response's delivered order.
    ///
    /// Slots are dense and zero-based over one response's delivered nodes. Every node detail
    /// column aligns to this domain. A slot is valid only against the response that delivered it,
    /// because two responses share no slot vocabulary.
    pub(crate) struct NodeSlot(u32)
}

hashql_core::id::newtype! {
    /// A reference to a delivered edge by its slot in one response's edge order.
    ///
    /// Slots are dense and zero-based over one response's delivered edges. Every link detail
    /// column aligns to this domain. A slot is valid only against the response that delivered it,
    /// because two responses share no slot vocabulary.
    pub(crate) struct EdgeSlot(u32)
}
