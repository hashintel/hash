use hashql_core::id;

id::newtype!(
    ///
    pub struct Local(usize is 0..=usize::MAX)
);
