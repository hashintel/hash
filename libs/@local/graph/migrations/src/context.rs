/// Provides the context for a migration.
///
/// Because different migrations may require different contexts, this trait is used to provide the
/// context for a migration. This allows the migration to be agnostic to the context it is run in.
pub trait ContextProvider<C> {
    /// Provides the context for a migration.
    fn provide(&mut self) -> &mut C;
}

impl<T> ContextProvider<Self> for T {
    fn provide(&mut self) -> &mut Self {
        self
    }
}
