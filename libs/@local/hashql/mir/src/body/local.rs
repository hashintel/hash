use hashql_core::id;

id::newtype!(
    /// Represents a local variable
    pub struct Local(usize is 0..=usize::MAX)
);
