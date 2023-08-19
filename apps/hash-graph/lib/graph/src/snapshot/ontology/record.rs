use serde::{Deserialize, Serialize};

use crate::ontology::OntologyType;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    rename_all = "camelCase",
    bound(
        serialize = "T::Representation: Serialize, T::Metadata: Serialize",
        deserialize = "T::Representation: Deserialize<'de>, T::Metadata: Deserialize<'de>"
    )
)]
pub struct OntologyTypeSnapshotRecord<T: OntologyType> {
    pub schema: T::Representation,
    pub metadata: T::Metadata,
}
