#[derive(Debug, derive_more::Display, derive_more::Error)]
#[must_use]
pub enum SnapshotDumpError {
    #[display("could not read a snapshot record")]
    Read,
    #[display("could not query snapshot records from the store")]
    Query,
    #[display("could not write a snapshot record into the sink")]
    Write,
}

#[derive(Debug, derive_more::Display, derive_more::Error)]
#[must_use]
pub enum SnapshotRestoreError {
    #[display("The snapshot contains unsupported entries")]
    Unsupported,
    #[display("The snapshot does not contain metadata")]
    MissingMetadata,
    #[display("could not read a snapshot entry")]
    Read,
    #[display("could not buffer a snapshot entry")]
    Buffer,
    #[display("could not write a snapshot entry into the store")]
    Write,
    #[display("could not validate a snapshot entry")]
    Validation,
}
