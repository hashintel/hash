use alloc::collections::BTreeMap;

use type_system::ontology::VersionedUrl;

use crate::name::UnitCode;

/// Maps the units in a column to the data types of the quantities they measure.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UnitMap {
    pub units: BTreeMap<UnitCode, VersionedUrl>,
    /// The data type for a unit that `units` does not list.
    pub fallback: Option<VersionedUrl>,
}
