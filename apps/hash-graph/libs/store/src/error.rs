#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("could not insert into store")]
#[must_use]
pub struct InsertionError;

#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("could not query from store")]
#[must_use]
pub struct QueryError;

#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("could not update store")]
#[must_use]
pub struct UpdateError;

#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("could not delete from the store")]
#[must_use]
pub struct DeletionError;
