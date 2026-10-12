use alloc::collections::BTreeMap;

use type_system::ontology::VersionedUrl;

use crate::name::UnitCode;

/// Reports that a unit map has no units and no fallback.
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
#[display("unit map has no units and no fallback")]
pub struct EmptyUnitMap;

/// Maps the units in a column to the data types of the quantities they measure.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UnitMap {
    units: BTreeMap<UnitCode, VersionedUrl>,
    fallback: Option<VersionedUrl>,
}

impl UnitMap {
    /// Builds a unit map from the data type of each unit and a `fallback` data type for units
    /// that `units` does not list.
    ///
    /// # Errors
    ///
    /// Returns [`EmptyUnitMap`] if there are no units and no fallback.
    pub fn new(
        units: BTreeMap<UnitCode, VersionedUrl>,
        fallback: Option<VersionedUrl>,
    ) -> Result<Self, EmptyUnitMap> {
        if units.is_empty() && fallback.is_none() {
            return Err(EmptyUnitMap);
        }
        Ok(Self { units, fallback })
    }

    #[must_use]
    pub const fn units(&self) -> &BTreeMap<UnitCode, VersionedUrl> {
        &self.units
    }

    /// Returns the data type for a unit that [`units`](Self::units) does not list.
    #[must_use]
    pub const fn fallback(&self) -> Option<&VersionedUrl> {
        self.fallback.as_ref()
    }
}

#[cfg(test)]
mod tests {
    use alloc::collections::BTreeMap;

    use super::{EmptyUnitMap, UnitMap};

    #[test]
    fn unit_map_empty() {
        assert_eq!(
            UnitMap::new(BTreeMap::new(), None),
            Err(EmptyUnitMap),
            "a unit map without units or a fallback should be rejected"
        );
    }
}
