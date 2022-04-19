use core::fmt;
use std::{cmp::Ordering, num::NonZeroUsize};

use serde::Serialize;

#[derive(Copy, Clone, Debug, Hash, PartialEq, Eq, Serialize)]
pub struct PackageId(NonZeroUsize);

impl PackageId {
    #[inline]
    pub fn as_usize(&self) -> NonZeroUsize {
        self.0
    }
}

impl fmt::Display for PackageId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl From<usize> for PackageId {
    fn from(id: usize) -> Self {
        Self(NonZeroUsize::new(id).expect("Package ids with id `0` are reserved"))
    }
}

/// Defines the source from which a Field was specified, useful for resolving clashes
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum FieldSource {
    Engine,
    Package(PackageId),
}

impl FieldSource {
    /// A unique static identifier of the field source, used in building [`RootFieldKey`]s for
    /// fields.
    ///
    /// [`RootFieldKey`]: crate::field::RootFieldKey
    pub fn unique_id(&self) -> usize {
        match self {
            FieldSource::Engine => 0,
            FieldSource::Package(package_id) => package_id.as_usize().get(),
        }
    }

    /// Returns if the `FieldSource` can guarantee nullability.
    ///
    /// This implies, that a [`FieldSpec`], which has `nullable` set to `false`, is guaranteed to
    /// have a non-null value.
    ///
    /// [`FieldSpec`]: crate::field::FieldSpec
    // TODO: We only need this because we may not set values on initialization, thus only a
    //   `FieldSpec` with `Engine` as source returns `true` here. We probably want to get around
    //   this.
    pub fn can_guarantee_null(&self) -> bool {
        *self == FieldSource::Engine
    }
}

impl PartialOrd for FieldSource {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        // TODO: We only do a partial ordering as we currently don't have a defined precedence of
        //   packages. When `PartialOrd` for `PackageName` is implemented, derive it instead.
        match (self, other) {
            (Self::Engine, Self::Engine) => Some(Ordering::Equal),
            (Self::Engine, Self::Package(_)) => Some(Ordering::Greater),
            (Self::Package(_), Self::Engine) => Some(Ordering::Less),
            (Self::Package(_), Self::Package(_)) => None,
        }
    }
}
