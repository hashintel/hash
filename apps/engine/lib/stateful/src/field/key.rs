use core::fmt;

use crate::{
    field::{FieldScope, FieldSource},
    Error, Result,
};

/// A unique identifier for a [`RootFieldSpec`], encoding its name, [`FieldScope`], and
/// [`FieldSource`].
///
/// [`RootFieldSpec`]: crate::field::RootFieldSpec
#[derive(Debug, Clone, Eq, PartialEq, Hash)]
pub struct RootFieldKey(String);

impl RootFieldKey {
    /// Creates a new `RootFieldKey` from a [`String`].
    pub fn new(key: String) -> Self {
        Self(key)
    }

    fn verify_name(name: &str) -> Result<()> {
        const PRIVATE_PREFIX: &str = FieldScope::Private.prefix();
        const HIDDEN_PREFIX: &str = FieldScope::Hidden.prefix();
        // TODO: do we want these checks to only be present on debug builds
        if name.starts_with(PRIVATE_PREFIX) || name.starts_with(HIDDEN_PREFIX) {
            Err(Error::from(format!(
                "Field names cannot start with the protected prefixes: [{PRIVATE_PREFIX:?}, \
                 {HIDDEN_PREFIX:?}], received field name: {name:?}"
            )))
        } else {
            Ok(())
        }
    }

    /// Create a new agent scoped `FieldKey`
    ///
    /// Builds a `FieldKey` from a given name.
    ///
    /// # Errors
    ///
    /// - Returns [`Error`] if `name` starts with a prefix pre-defined by [`FieldScope`].
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
    /// - Returns [`Error`] if `name` starts with a prefix pre-defined by [`FieldScope`], and
    /// - Returns [`Error`] if `scope` is [`FieldScope::Agent`].
    #[inline]
    pub fn new_private_or_hidden_scoped(
        name: &str,
        source: FieldSource,
        scope: FieldScope,
    ) -> Result<Self> {
        Self::verify_name(name)?;

        // TODO: Use metadata on `FieldSpec` instead?
        let scope_prefix = match scope {
            FieldScope::Private | FieldScope::Hidden => scope.prefix(),
            FieldScope::Agent => {
                return Err(Error::from(
                    "Use new_agent_scoped to create a key with FieldScope::Agent",
                ));
            }
        };
        Ok(Self(format!(
            "{}{}_{}",
            scope_prefix,
            source.unique_id(),
            name
        )))
    }

    /// Returns the underlying key as string.
    pub fn value(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for RootFieldKey {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(self.value(), fmt)
    }
}
