use std::collections::HashMap;

use futures::TryStreamExt as _;
use hashql_core::id::Id as _;
use smallvec::smallvec;
use type_system::{
    knowledge::entity::id::EntityUuid,
    ontology::id::{OntologyTypeUuid, VersionedUrl},
    principal::actor_group::WebId,
};
use uuid::Uuid;
use zerocopy::{FromBytes as _, IntoBytes as _, LE, U64};

use super::{
    CANONICAL_DIMENSIONS, Dataset as _, Edge, Node, Ontology, PROJECTOR_DIMENSIONS,
    auxiliary::{OwnedIcon, OwnedLabel},
    card::Card,
    memory::{MemoryDataset, MemoryNodeId, MemoryOntologyId},
    postgres::id::{ArchivedEntityUuid, ArchivedOntologyTypeUuid, ArchivedWebId},
};
use crate::{
    identity::{NodeRowId, OntologyRowId},
    math::{BoxedVecN, VecN, unit_fraction},
};

const UUID_BYTES: [u8; 16] = [
    0x01, 0x23, 0x45, 0x67, 0x89, 0xAB, 0xCD, 0xEF, 0x10, 0x32, 0x54, 0x76, 0x98, 0xBA, 0xDC, 0xFE,
];

#[test]
fn archived_entity_uuid_derefs_to_the_same_identity() {
    let archived = ArchivedEntityUuid::read_from_bytes(&UUID_BYTES)
        .expect("should read an archived uuid from any 16 bytes");

    assert_eq!(*archived, EntityUuid::new(Uuid::from_bytes(UUID_BYTES)));
}

#[test]
fn archived_web_id_derefs_to_the_same_identity() {
    let archived = ArchivedWebId::read_from_bytes(&UUID_BYTES)
        .expect("should read an archived uuid from any 16 bytes");

    assert_eq!(*archived, WebId::new(Uuid::from_bytes(UUID_BYTES)));
}

#[test]
fn archived_ontology_type_uuid_derefs_to_the_same_identity() {
    let id = OntologyTypeUuid::from_url(
        &"https://example.com/types/entity-type/person/v/1"
            .parse::<VersionedUrl>()
            .expect("should parse a well-formed versioned url"),
    );

    let archived = ArchivedOntologyTypeUuid::read_from_bytes(id.as_uuid().as_bytes())
        .expect("should read an archived uuid from any 16 bytes");

    assert_eq!(*archived, id);
}

#[test]
fn archived_uuid_bytes_round_trip() {
    let archived = ArchivedEntityUuid::read_from_bytes(&UUID_BYTES)
        .expect("should read an archived uuid from any 16 bytes");

    assert_eq!(archived.as_bytes(), UUID_BYTES);
}

#[test]
fn row_ids_persist_little_endian() {
    let id = NodeRowId::new(0x0102_0304_0506_0708);

    // The little-endian byte image is the persisted form; artifact files
    // depend on it being identical on every host.
    assert_eq!(
        id.as_bytes(),
        [0x08, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01]
    );

    let restored = NodeRowId::read_from_bytes(id.as_bytes())
        .expect("should read a row id back from its own bytes");
    assert_eq!(restored, id);
}

/// A two-node, one-edge fixture over a two-type ontology (type 1 inherits from type 0).
fn fixture() -> MemoryDataset {
    let unit = |component: usize| {
        let mut components = [0.0_f32; PROJECTOR_DIMENSIONS];
        components[component] = 1.0;
        BoxedVecN::new(&VecN::new(components))
    };

    let mut canonical_components = [0.0_f32; CANONICAL_DIMENSIONS];
    canonical_components[0] = 1.0;

    MemoryDataset::new(
        vec![
            Node {
                id: U64::<LE>::new(10),
                ontology: smallvec![OntologyRowId::new(0)],
                embedding: unit(0),
                confidence: Some(unit_fraction!(0.75)),
            },
            Node {
                id: U64::<LE>::new(11),
                ontology: smallvec![OntologyRowId::new(0), OntologyRowId::new(1)],
                embedding: unit(1),
                confidence: None,
            },
        ],
        vec![Edge {
            id: U64::<LE>::new(20),
            source: NodeRowId::new(0),
            target: NodeRowId::new(1),
            ontology: smallvec![OntologyRowId::new(1)],
            embedding: None,
            confidence: Some(unit_fraction!(0.5)),
            source_confidence: None,
            target_confidence: Some(unit_fraction!(1.0)),
        }],
        vec![
            Ontology {
                id: U64::<LE>::new(30),
                parents: smallvec![],
            },
            Ontology {
                id: U64::<LE>::new(31),
                parents: smallvec![OntologyRowId::new(0)],
            },
        ],
        HashMap::from([(10, BoxedVecN::new(&VecN::new(canonical_components)))]),
        HashMap::from([
            (30, Card::verbatim("Root type card".to_owned())),
            (31, Card::verbatim("Link type card".to_owned())),
        ]),
    )
}

#[tokio::test]
#[cfg_attr(
    miri,
    ignore = "tokio's I/O driver calls foreign functions Miri cannot emulate"
)]
async fn memory_dataset_streams_rows_in_construction_order() {
    let dataset = fixture();

    let nodes: Vec<_> = dataset
        .nodes()
        .try_collect()
        .await
        .unwrap_or_else(|never| never);
    assert_eq!(nodes.len(), 2);
    assert_eq!(nodes[0].id.get(), 10);
    assert_eq!(nodes[0].confidence, Some(unit_fraction!(0.75)));
    assert_eq!(nodes[1].ontology.len(), 2);

    let edges: Vec<_> = dataset
        .edges()
        .try_collect()
        .await
        .unwrap_or_else(|never| never);
    assert_eq!(edges.len(), 1);
    assert_eq!(edges[0].source.as_u64(), 0);
    assert_eq!(edges[0].target.as_u64(), 1);
    assert_eq!(edges[0].target_confidence, Some(unit_fraction!(1.0)));

    let ontology: Vec<_> = dataset
        .ontology()
        .try_collect()
        .await
        .unwrap_or_else(|never| never);
    assert_eq!(ontology.len(), 2);
    assert_eq!(ontology[1].parents.as_slice(), [OntologyRowId::new(0)]);
}

#[tokio::test]
#[cfg_attr(
    miri,
    ignore = "tokio's I/O driver calls foreign functions Miri cannot emulate"
)]
#[expect(
    clippy::float_cmp,
    reason = "the fixture's exactly representable 1.0 must round-trip bit-identically"
)]
async fn memory_dataset_serves_canonical_embeddings() {
    let dataset = fixture();

    let embeddings: Vec<_> = dataset
        .canonical_node_embeddings(core::iter::once(MemoryNodeId::new(10)))
        .try_collect()
        .await
        .unwrap_or_else(|never| never);

    assert_eq!(embeddings.len(), 1);
    assert_eq!(embeddings[0].0.get(), 10);
    assert_eq!(embeddings[0].1.as_array()[0], 1.0);
}

#[tokio::test]
#[cfg_attr(
    miri,
    ignore = "tokio's I/O driver calls foreign functions Miri cannot emulate"
)]
async fn memory_dataset_renders_cards() {
    let dataset = fixture();

    let cards: Vec<_> = dataset
        .render_cards()
        .try_collect()
        .await
        .expect("the fixture holds a card for every ontology row");

    assert_eq!(
        cards,
        [
            (
                MemoryOntologyId::new(30),
                Card::verbatim("Root type card".to_owned())
            ),
            (
                MemoryOntologyId::new(31),
                Card::verbatim("Link type card".to_owned())
            ),
        ]
    );
}

#[tokio::test]
#[cfg_attr(
    miri,
    ignore = "tokio's I/O driver calls foreign functions Miri cannot emulate"
)]
async fn memory_dataset_streams_display_columns() {
    let mut dataset = fixture();

    // A fresh fixture streams one empty display value per row.
    let labels: Vec<_> = dataset
        .node_auxiliary_payload()
        .try_collect()
        .await
        .unwrap_or_else(|never| never);
    assert_eq!(labels, vec![OwnedLabel::default(); 2]);

    dataset.node_labels = vec![OwnedLabel::from("alpha"), OwnedLabel::from("beta")];
    dataset.edge_labels = vec![OwnedLabel::from("alpha employs beta")];
    dataset.ontology_icons = vec![OwnedIcon::from("person"), OwnedIcon::from("\u{3bb}")];

    let labels: Vec<_> = dataset
        .node_auxiliary_payload()
        .try_collect()
        .await
        .unwrap_or_else(|never| never);
    assert_eq!(
        labels,
        [OwnedLabel::from("alpha"), OwnedLabel::from("beta")]
    );

    let labels: Vec<_> = dataset
        .edge_auxiliary_payload()
        .try_collect()
        .await
        .unwrap_or_else(|never| never);
    assert_eq!(labels, [OwnedLabel::from("alpha employs beta")]);

    let icons: Vec<_> = dataset
        .ontology_auxiliary_payload()
        .try_collect()
        .await
        .unwrap_or_else(|never| never);
    assert_eq!(
        icons,
        [OwnedIcon::from("person"), OwnedIcon::from("\u{3bb}")]
    );
}

#[test]
#[should_panic(expected = "one label per node row")]
fn memory_dataset_rejects_a_short_label_column() {
    let mut dataset = fixture();
    dataset.node_labels.pop();

    let _stream = dataset.node_auxiliary_payload();
}

#[test]
#[should_panic(expected = "references a node row outside the node stream")]
fn memory_dataset_rejects_dangling_edge_endpoints() {
    MemoryDataset::new(
        Vec::new(),
        vec![Edge {
            id: U64::<LE>::new(0),
            source: NodeRowId::new(0),
            target: NodeRowId::new(0),
            ontology: smallvec![],
            embedding: None,
            confidence: None,
            source_confidence: None,
            target_confidence: None,
        }],
        Vec::new(),
        HashMap::new(),
        HashMap::new(),
    );
}
