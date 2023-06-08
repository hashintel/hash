const HIDDEN_PREFIX: &str = "_HIDDEN_";
const PRIVATE_PREFIX: &str = "_PRIVATE_";

/// Defines scope of access to fields.
///
/// The order of the variants of `FieldScope` define an ordering of the scopes, where being defined
/// lower implies a wider scope where more things can access it, i.e. `Private` < `Hidden` <
/// `Agent`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum FieldScope {
    /// Only the source package/engine agents and other packages don't
    Private,
    /// Agents do not have access but packages and engine do
    Hidden,
    /// Agents, packages and engine have access
    Agent,
}

impl FieldScope {
    pub const fn prefix(self) -> &'static str {
        match self {
            Self::Private => PRIVATE_PREFIX,
            Self::Hidden => HIDDEN_PREFIX,
            Self::Agent => "",
        }
    }
}
