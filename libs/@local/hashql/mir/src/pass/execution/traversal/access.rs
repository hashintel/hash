#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) enum AccessMode {
    Direct,
    Composite,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) enum Access {
    Postgres(AccessMode),
    Embedding(AccessMode),
}
