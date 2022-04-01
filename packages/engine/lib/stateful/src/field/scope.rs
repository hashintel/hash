/// Defines scope of access to Fields, where the order of the variants of this enum define an
/// ordering of the scopes, where being defined lower implies a wider scope where more things can
/// access it.
/// i.e. Engine < Private < Hidden < Agent,
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum FieldScope {
    /// Only the source package/engine agents and other packages don't
    Private,
    /// Agents do not have access but packages and engine do
    Hidden,
    /// Agents, packages and engine have access
    Agent,
}
