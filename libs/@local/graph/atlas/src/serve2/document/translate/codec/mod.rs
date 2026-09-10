use alloc::{borrow::Cow, collections::BTreeMap};

use serde::{Serialize, Serializer, ser::SerializeStruct as _};

use super::{TranslateDocument, TranslatedEdge, TranslatedNode};
use crate::{identity::NodeRowId, postgres::id::ArchivedEntityId, serve2::codec::EncodedRowId};

#[cfg(test)]
mod tests;

/// One translate response in writable form.
#[derive(serde::Serialize, schemars::JsonSchema)]
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

impl schemars::JsonSchema for TranslatedNode {
    fn schema_name() -> Cow<'static, str> {
        "TranslatedNode".into()
    }

    fn json_schema(generator: &mut schemars::SchemaGenerator) -> schemars::Schema {
        schemars::json_schema!({
            "type": "object",
            "properties": {
                "id": generator.subschema_for::<EncodedRowId<NodeRowId>>(),
                "x": generator.subschema_for::<f32>(),
                "y": generator.subschema_for::<f32>(),
            },
            "required": ["id", "x", "y"],
        })
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
