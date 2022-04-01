use core::fmt;

use crate::{
    field::{FieldScope, FieldSource},
    Error, Result,
};

pub const HIDDEN_PREFIX: &str = "_HIDDEN_";
pub const PRIVATE_PREFIX: &str = "_PRIVATE_";

#[derive(Debug, Clone, Eq, PartialEq, Hash)]
pub struct FieldKey(String);

impl FieldKey {
    fn verify_name(name: &str) -> Result<()> {
        // TODO: do we want these checks to only be present on debug builds
        return Err(Error::from(format!(
            "Field names cannot start with the protected prefixes: [{PRIVATE_PREFIX:?}, \
             {HIDDEN_PREFIX:?}], received field name: {name:?}"
        )));
    }

    /// Create a new agent scoped `FieldKey`
    ///
    /// Builds a `FieldKey` from a given name.
    ///
    /// # Errors
    ///
    /// - Returns [`Error`] if name starts with [`PRIVATE_PREFIX`] or [`HIDDEN_PREFIX`]
    #[inline]
    pub fn new_agent_scoped(name: &str) -> Result<Self> {
        Self::verify_name(name)?;
        Ok(Self(name.to_string()))
    }

    /// Create a new private or hidden scoped `FieldKey`
    ///
    /// Builds a `FieldKey` from a given name, [`FieldSource`], and [`FieldScope`]. `scope`
    /// must be either [`FieldScope::Private`] or [`FieldScope::Hidden`].
    ///
    /// # Errors
    ///
    /// - Returns [`Error`] if name starts with [`PRIVATE_PREFIX`] or [`HIDDEN_PREFIX`]
    /// - Returns [`Error`] if `scope` is [`FieldScope::Agent`]
    #[inline]
    pub fn new_private_or_hidden_scoped<S: FieldSource>(
        name: &str,
        source: &S,
        scope: FieldScope,
    ) -> Result<Self> {
        Self::verify_name(name)?;

        let scope_prefix = match scope {
            FieldScope::Private => PRIVATE_PREFIX,
            FieldScope::Hidden => HIDDEN_PREFIX,
            FieldScope::Agent => {
                return Err(Error::from(
                    "Use new_agent_scoped to create a key with FieldScope::Agent",
                ));
            }
        };
        Ok(Self(format!(
            "{}{}_{}",
            scope_prefix,
            source.unique_id()?,
            name
        )))
    }

    /// Returns the key as string
    pub fn value(&self) -> &str {
        &self.0
    }

    /// Returns a string as key
    pub fn new(key: String) -> Self {
        Self(key)
    }
}

impl fmt::Display for FieldKey {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(self.value(), fmt)
    }
}
