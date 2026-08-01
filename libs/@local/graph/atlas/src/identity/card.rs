//! The annotation card row domain.

hashql_core::id::newtype! {
    /// A row of the rendered annotation card table.
    ///
    /// Trained rows come first, then the holdouts. One corpus assembly's own row vocabulary: the embedding table, the training rows, the identities, and the classifier-fit evidence derived from them all index by it, and it is valid only against the assembly that laid the rows out.
    #[id(const)]
    pub struct CardRow(u32)
}
