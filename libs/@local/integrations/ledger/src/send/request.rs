//! Request bodies in the Graph entity API's wire format.

use serde_json::value::RawValue;
use type_system::knowledge::entity::provenance::ProvidedEntityEditionProvenance;

use crate::{graph::RequestKind, sync_table::Change};

/// Encodes `change` as the body of one write and says which endpoint takes it.
///
/// A create carries the properties of the change. An update carries one `add` operation per
/// property of the change. An archive carries no properties.
///
/// # Errors
///
/// Returns the [`serde_json::Error`] of the body that cannot be serialized.
pub(super) fn encode(
    change: &Change,
    provenance: &ProvidedEntityEditionProvenance,
) -> Result<(RequestKind, Box<RawValue>), serde_json::Error> {
    unimplemented!()
}
