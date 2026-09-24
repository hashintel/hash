use alloc::{alloc::Global, collections::BTreeMap};

use serde_json::json;
use uuid::Uuid;

use crate::{
    math::Vec2,
    postgres::id::ArchivedEntityId,
    serve::{
        codec::EncodedRowId,
        document::{
            Document as _,
            translate::{TranslateDocument, TranslatedEdge, TranslatedNode},
        },
    },
};

/// Encoding an empty [`TranslateDocument`] replaces the buffer's bytes.
///
/// What remains is the empty `{"nodes":{},"edges":{}}` object alone, not an appended copy of it.
#[test]
fn json_empty() {
    let document = TranslateDocument {
        nodes: BTreeMap::new(),
        edges: BTreeMap::new(),
    };
    let mut bytes = Vec::new_in(&Global);
    bytes.extend_from_slice(b"previous document");
    let _completed = document
        .encode(&mut bytes)
        .expect("should complete the empty response");
    assert_eq!(bytes, br#"{"nodes":{},"edges":{}}"#);
}

/// One node and one edge serialize as display-string keys over numeric fields.
///
/// The encoder writes each archived `web_id~entity_uuid` key as its display string, and each
/// translated position or edge as its numeric fields. A later encode of an empty document into the
/// same buffer replaces its contents rather than appending to the earlier bytes.
#[test]
fn json_nodes_edges() {
    let node = ArchivedEntityId {
        web_id: Uuid::from_u128(1).into(),
        entity_uuid: Uuid::from_u128(2).into(),
    };
    let edge = ArchivedEntityId {
        web_id: Uuid::from_u128(3).into(),
        entity_uuid: Uuid::from_u128(2).into(),
    };
    let document = TranslateDocument {
        nodes: BTreeMap::from([(
            node,
            TranslatedNode {
                id: EncodedRowId::new_unchecked(17),
                position: Vec2::new(1.25, -2.5),
            },
        )]),
        edges: BTreeMap::from([(
            edge,
            TranslatedEdge {
                source: EncodedRowId::new_unchecked(17),
                target: EncodedRowId::new_unchecked(u32::MAX),
            },
        )]),
    };
    let mut bytes = Vec::new_in(&Global);
    let _completed = document
        .encode(&mut bytes)
        .expect("should complete the geometry response");
    let actual: serde_json::Value =
        serde_json::from_slice(&bytes).expect("should decode a complete translate response");
    assert_eq!(
        actual,
        json!({
            "nodes": {
                "00000000-0000-0000-0000-000000000001~00000000-0000-0000-0000-000000000002": {
                    "id": 17,
                    "x": 1.25,
                    "y": -2.5,
                },
            },
            "edges": {
                "00000000-0000-0000-0000-000000000003~00000000-0000-0000-0000-000000000002": {
                    "source": 17,
                    "target": u32::MAX,
                },
            },
        })
    );

    let empty = TranslateDocument {
        nodes: BTreeMap::new(),
        edges: BTreeMap::new(),
    };
    let _completed = empty
        .encode(&mut bytes)
        .expect("should complete the replacement response");
    assert_eq!(
        bytes, br#"{"nodes":{},"edges":{}}"#,
        "should replace the longer response"
    );
}
