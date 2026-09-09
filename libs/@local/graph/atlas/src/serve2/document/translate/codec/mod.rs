use alloc::collections::BTreeMap;

use serde::{Serialize, Serializer, ser::SerializeStruct as _};

use super::{TranslateDocument, TranslatedEdge, TranslatedNode};
use crate::postgres::id::ArchivedEntityId;

#[cfg(test)]
mod tests;

/// One translate response in writable form.
#[derive(Serialize)]
pub(super) struct TranslateResponse<'doc> {
    nodes: &'doc BTreeMap<ArchivedEntityId, TranslatedNode>,
    edges: &'doc BTreeMap<ArchivedEntityId, TranslatedEdge>,
}

impl<'doc> TranslateResponse<'doc> {
    pub(super) const fn new(document: &'doc TranslateDocument) -> Self {
        Self {
            nodes: &document.nodes,
            edges: &document.edges,
        }
    }
}

impl Serialize for TranslatedNode {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut object = serializer.serialize_struct("TranslatedNode", 3)?;
        object.serialize_field("id", &self.id)?;
        object.serialize_field("x", &self.position.x())?;
        object.serialize_field("y", &self.position.y())?;
        object.end()
    }
}
