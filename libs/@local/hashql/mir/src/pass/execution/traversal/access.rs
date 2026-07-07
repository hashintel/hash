/// How a path maps to its backend storage.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) enum AccessMode {
    /// The path corresponds to a single column or embedding slot.
    Direct,
    /// The path is a composite whose children are the actual storage locations.
    Composite,
}

/// Backend and access mode for a resolved entity field path.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) enum Access {
    /// Served by the Postgres graph store.
    Postgres(AccessMode),
    /// Served by the embedding backend.
    Embedding(AccessMode),
}
