use alloc::borrow::Cow;
use core::num::NonZero;
use std::{collections::HashMap, fs, io};

use camino::{Utf8Path, Utf8PathBuf};
use futures::{Stream, StreamExt as _, TryStreamExt as _, stream};
use rkyv::{api::high::to_bytes_in, util::AlignedVec};
use smallvec::{SmallVec, smallvec};
use zerocopy::FromBytes as _;

use super::{
    super::{
        CANONICAL_DIMENSIONS, Dataset, Edge, Node, Ontology, PROJECTOR_DIMENSIONS, TemporalAxes,
        auxiliary::{Label, OwnedIcon, OwnedLegend},
        card::Card,
    },
    OfflineDataset, OpenDumpError,
    dump::{DumpOptions, dump},
    format::{Manifest, StreamKind},
    record::{ArchivedNodesRoot, EdgeRecord, EdgesRoot, Embedding, NodeRecord, NodesRoot},
};
use crate::{
    identity::{NodeRowId, OntologyRowId},
    integrity::{Sha256, Sha256Digest, Update as _},
    math::{AlignedVecN, BoxedVecN, unit_fraction},
    postgres::id::{ArchivedEntityId, ArchivedOntologyTypeUuid},
    progress::NoProgress,
    salt::{
        embedding::{CardEmbedder, EmbedderFingerprint},
        policy::annotation::assembly::AssemblyConfig,
    },
};

/// A fresh per-test dump directory under the system temp directory.
fn scratch(name: &str) -> Utf8PathBuf {
    let directory = Utf8PathBuf::from_path_buf(std::env::temp_dir())
        .expect("the system temp path is UTF-8")
        .join(format!(
            "hash-graph-atlas-offline-dump-{}",
            std::process::id(),
        ))
        .join(name);
    let _: Result<(), io::Error> = fs::remove_dir_all(&directory);
    directory
}

/// An archived entity id whose 32 bytes all carry `tag`.
fn entity(tag: u8) -> ArchivedEntityId {
    ArchivedEntityId::read_from_bytes(&[tag; 32]).expect("any 32 bytes form an archived entity id")
}

/// An archived ontology-type uuid whose 16 bytes all carry `tag`.
fn ontology_type(tag: u8) -> ArchivedOntologyTypeUuid {
    ArchivedOntologyTypeUuid::read_from_bytes(&[tag; 16])
        .expect("any 16 bytes form an archived type uuid")
}

/// A finite embedding whose components cycle the byte values from `seed` upward.
fn vector<const N: usize>(seed: u8) -> BoxedVecN<N> {
    let mut vector = BoxedVecN::zero();
    for (component, byte) in vector
        .as_array_mut()
        .iter_mut()
        .zip((0..=u8::MAX).cycle().skip(usize::from(seed)))
    {
        *component = f32::from(byte);
    }
    vector
}

/// Asserts that a served embedding borrows its bytes from inside one stream file's mapping.
#[expect(
    clippy::ptr_arg,
    reason = "the assertion discriminates the Cow's arms, so the Cow itself is the subject"
)]
fn assert_borrowed_from<const N: usize>(map: &[u8], embedding: &Cow<'_, AlignedVecN<N>>) {
    let Cow::Borrowed(vector) = embedding else {
        panic!("the served embedding is owned rather than borrowed from the mapping");
    };

    let map_start = map.as_ptr().addr();
    let map_end = map_start + map.len();
    let vector_start = core::ptr::from_ref(*vector).addr();
    let vector_end = vector_start + size_of::<AlignedVecN<N>>();
    assert!(
        vector_start >= map_start && vector_end <= map_end,
        "the served embedding does not point into the mapped stream file",
    );
}

/// The fixture embedder's vector for one text: components cycling the text hash's bytes.
fn embedding_of(text: &str) -> BoxedVecN<CANONICAL_DIMENSIONS> {
    let bytes = Sha256Digest::of(text).to_bytes();
    let mut vector = BoxedVecN::zero();
    for (component, byte) in vector
        .as_array_mut()
        .iter_mut()
        .zip(bytes.into_iter().cycle())
    {
        *component = f32::from(byte);
    }
    vector
}

/// A deterministic [`CardEmbedder`] whose vectors derive from the text hash alone.
struct FixtureEmbedder;

impl CardEmbedder for FixtureEmbedder {
    type Error = !;

    fn fingerprint(&self) -> EmbedderFingerprint {
        EmbedderFingerprint::new(Sha256Digest::of("fixture embedding contract"))
    }

    fn embed<'text>(
        &self,
        texts: impl IntoIterator<Item = &'text str, IntoIter: Send> + Send,
    ) -> impl Future<Output = Result<Vec<BoxedVecN<CANONICAL_DIMENSIONS>>, !>> + Send {
        core::future::ready(Ok(texts.into_iter().map(embedding_of).collect()))
    }
}

/// A [`Dataset`] fixture over archived ids, the id domain the dump command requires.
///
/// The rows are supplied verbatim and the streams are infallible, so
/// [`Dataset::Error`] is `!`. Canonical requests outside the covered map panic.
struct Fixture {
    nodes: Vec<Node<'static, ArchivedEntityId>>,
    edges: Vec<Edge<'static, ArchivedEntityId>>,
    ontology: Vec<Ontology<ArchivedOntologyTypeUuid>>,
    canonical: HashMap<ArchivedEntityId, BoxedVecN<CANONICAL_DIMENSIONS>>,
    /// Finished cards by ontology row, one per type.
    cards: Vec<Card>,
    node_legends: Vec<OwnedLegend>,
    edge_legends: Vec<OwnedLegend>,
    ontology_icons: Vec<OwnedIcon>,
}

impl Dataset for Fixture {
    type EdgeId = ArchivedEntityId;
    type Error = !;
    type NodeId = ArchivedEntityId;
    type OntologyId = ArchivedOntologyTypeUuid;

    type CanonicalNodeEmbeddingsStream<'this, I: Iterator<Item = Self::NodeId>> = impl Stream<
            Item = Result<
                (
                    ArchivedEntityId,
                    Cow<'this, AlignedVecN<CANONICAL_DIMENSIONS>>,
                ),
                !,
            >,
        > + use<'this, I>;
    type CardStream<'this> =
        impl Stream<Item = io::Result<(ArchivedOntologyTypeUuid, Card)>> + 'this;
    type EdgeAuxiliaryPayloadStream<'this> = impl Stream<Item = Result<OwnedLegend, !>> + 'this;
    type EdgeStream<'this> = impl Stream<Item = Result<Edge<'this, ArchivedEntityId>, !>> + 'this;
    type NodeAuxiliaryPayloadStream<'this> = impl Stream<Item = Result<OwnedLegend, !>> + 'this;
    type NodeStream<'this> = impl Stream<Item = Result<Node<'this, ArchivedEntityId>, !>> + 'this;
    type NodeTypesStream<'this, I: Iterator<Item = Self::NodeId>> = impl Stream<Item = Result<(ArchivedEntityId, SmallVec<OntologyRowId, 2>), !>>
        + use<'this, I>;
    type OntologyAuxiliaryPayloadStream<'this> = impl Stream<Item = Result<OwnedIcon, !>> + 'this;
    type OntologyStream<'this> =
        impl Stream<Item = Result<Ontology<ArchivedOntologyTypeUuid>, !>> + 'this;

    fn axes(&self) -> Option<TemporalAxes> {
        None
    }

    fn nodes(&self) -> Self::NodeStream<'_> {
        stream::iter(self.nodes.iter().cloned().map(Ok::<_, !>))
    }

    fn edges(&self) -> Self::EdgeStream<'_> {
        stream::iter(self.edges.iter().cloned().map(Ok::<_, !>))
    }

    fn ontology(&self) -> Self::OntologyStream<'_> {
        stream::iter(self.ontology.iter().cloned().map(Ok::<_, !>))
    }

    /// Opens a stream of canonical embeddings for the given nodes.
    ///
    /// # Panics
    ///
    /// The stream panics when a requested node has no canonical embedding in the fixture.
    fn canonical_node_embeddings<I: Iterator<Item = ArchivedEntityId>>(
        &self,
        nodes: I,
    ) -> Self::CanonicalNodeEmbeddingsStream<'_, I> {
        stream::iter(nodes).map(|id| {
            let embedding = self
                .canonical
                .get(&id)
                .expect("the fixture covers every requested canonical embedding");

            Ok::<_, !>((id, Cow::Borrowed(&**embedding)))
        })
    }

    /// Opens a stream of direct-type lists for the given nodes.
    ///
    /// # Panics
    ///
    /// The stream panics when a requested node is not in the fixture.
    fn node_types<I: Iterator<Item = ArchivedEntityId>>(
        &self,
        nodes: I,
    ) -> Self::NodeTypesStream<'_, I> {
        stream::iter(nodes).map(|id| {
            let node = self
                .nodes
                .iter()
                .find(|node| node.id == id)
                .expect("the requested node is in the fixture");

            Ok::<_, !>((id, node.ontology.clone()))
        })
    }

    fn render_cards(&self) -> Self::CardStream<'_> {
        stream::iter(
            self.ontology
                .iter()
                .zip(&self.cards)
                .map(|(entry, card)| Ok((entry.id, card.clone()))),
        )
    }

    fn node_auxiliary_payload(&self) -> Self::NodeAuxiliaryPayloadStream<'_> {
        stream::iter(self.node_legends.iter().cloned().map(Ok::<_, !>))
    }

    fn edge_auxiliary_payload(&self) -> Self::EdgeAuxiliaryPayloadStream<'_> {
        stream::iter(self.edge_legends.iter().cloned().map(Ok::<_, !>))
    }

    fn ontology_auxiliary_payload(&self) -> Self::OntologyAuxiliaryPayloadStream<'_> {
        stream::iter(self.ontology_icons.iter().cloned().map(Ok::<_, !>))
    }
}

/// A four-node fixture exercising every record shape.
///
/// Node confidences and type lists cover present and absent, one edge carries an embedding and
/// full confidences while the other carries neither, one icon is empty, and the third card
/// repeats the first card's text so the card-embedding stream's dedupe has work to do. The
/// canonical map covers every node, so any probe sample is servable.
fn fixture() -> Fixture {
    let nodes = vec![
        Node {
            id: entity(1),
            ontology: smallvec![OntologyRowId::new(0), OntologyRowId::new(1)],
            embedding: Cow::Owned(vector(1)),
            confidence: Some(unit_fraction!(0.75)),
        },
        Node {
            id: entity(2),
            ontology: smallvec![OntologyRowId::new(2)],
            embedding: Cow::Owned(vector(2)),
            confidence: None,
        },
        Node {
            id: entity(3),
            ontology: smallvec![],
            embedding: Cow::Owned(vector(3)),
            confidence: Some(unit_fraction!(1.0)),
        },
        Node {
            id: entity(4),
            ontology: smallvec![OntologyRowId::new(0)],
            embedding: Cow::Owned(vector(4)),
            confidence: None,
        },
    ];

    let canonical = nodes
        .iter()
        .zip([10_u8, 11, 12, 13])
        .map(|(node, seed)| (node.id, vector(seed)))
        .collect();

    Fixture {
        nodes,
        edges: vec![
            Edge {
                id: entity(21),
                source: NodeRowId::new(0),
                target: NodeRowId::new(1),
                ontology: smallvec![OntologyRowId::new(1)],
                embedding: Some(Cow::Owned(vector(21))),
                confidence: Some(unit_fraction!(0.5)),
                source_confidence: Some(unit_fraction!(0.25)),
                target_confidence: Some(unit_fraction!(1.0)),
            },
            Edge {
                id: entity(22),
                source: NodeRowId::new(2),
                target: NodeRowId::new(0),
                ontology: smallvec![],
                embedding: None,
                confidence: None,
                source_confidence: None,
                target_confidence: None,
            },
        ],
        ontology: vec![
            Ontology {
                id: ontology_type(31),
                parents: smallvec![],
            },
            Ontology {
                id: ontology_type(32),
                parents: smallvec![OntologyRowId::new(0)],
            },
            Ontology {
                id: ontology_type(33),
                parents: smallvec![OntologyRowId::new(0), OntologyRowId::new(1)],
            },
        ],
        canonical,
        cards: vec![
            Card::verbatim("Root type card".to_owned()),
            Card::from_parts(
                "Truncated type card".to_owned(),
                7,
                vec![Cow::Borrowed("examples"), Cow::Borrowed("constraints")],
                true,
            ),
            Card::verbatim("Root type card".to_owned()),
        ],
        node_legends: vec![
            OwnedLegend::new(OntologyRowId::new(0), Label::new("person")),
            OwnedLegend::new(OntologyRowId::new(2), Label::new("company")),
            OwnedLegend::new(OntologyRowId::new(0), Label::EMPTY),
            OwnedLegend::new(OntologyRowId::new(0), Label::new("a longer display label")),
        ],
        edge_legends: vec![
            OwnedLegend::new(OntologyRowId::new(1), Label::new("employed by")),
            OwnedLegend::new(OntologyRowId::new(0), Label::EMPTY),
        ],
        ontology_icons: vec![
            OwnedIcon::from("A"),
            OwnedIcon::default(),
            OwnedIcon::from("BC"),
        ],
    }
}

/// Dump options under probe coverage: a two-row sample over the fixture's four nodes.
fn options() -> DumpOptions<'static> {
    DumpOptions {
        seed: 7,
        anchors: NonZero::new(1).expect("one is nonzero"),
        comparisons: NonZero::new(1).expect("one is nonzero"),
        all_canonicals: false,
        annotations: None,
        assembly: AssemblyConfig::default(),
    }
}

/// Rewrites one stream file's bytes and reseals the manifest over them.
///
/// The digest check would otherwise mask every deeper refusal, so a test aiming past it patches
/// the manifest's length and digest to vouch for the tampered bytes.
fn reseal(directory: &Utf8Path, kind: StreamKind, bytes: &[u8]) {
    fs::write(directory.join(kind.file_name()), bytes).expect("the tampered stream writes back");

    let manifest = fs::read(directory.join(Manifest::FILE_NAME)).expect("the manifest reads");
    let mut manifest: serde_json::Value =
        serde_json::from_slice(&manifest).expect("the manifest parses");

    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let entry = manifest
        .get_mut("streams")
        .and_then(|streams| streams.get_mut(kind.file_name().trim_end_matches(".bin")))
        .expect("the manifest names the stream");
    entry["bytes"] = serde_json::json!(bytes.len() as u64);
    entry["sha256"] = serde_json::json!(hasher.finalize().to_string());

    fs::write(
        directory.join(Manifest::FILE_NAME),
        serde_json::to_vec_pretty(&manifest).expect("the manifest serializes"),
    )
    .expect("the resealed manifest writes back");
}

#[tokio::test]
#[cfg_attr(
    miri,
    ignore = "tokio's I/O driver calls foreign functions Miri cannot emulate"
)]
async fn dump_roundtrips_byte_identically() {
    let first = scratch("roundtrip-first");
    let second = scratch("roundtrip-second");

    let written = dump(&fixture(), &FixtureEmbedder, &first, options(), &NoProgress)
        .await
        .expect("the fixture dumps cleanly");

    // The second dump reads everything from the first, with the dump's own embedder serving the
    // card embeddings, so byte identity proves the writer and the reader agree on every stream.
    let opened = OfflineDataset::open(&first).expect("the first dump opens whole");
    let embedder = opened
        .embedder()
        .expect("the embedder builds over the dump");
    let reread = dump(&opened, &embedder, &second, options(), &NoProgress)
        .await
        .expect("the reopened dump dumps cleanly");

    for kind in StreamKind::ALL {
        let original =
            fs::read(first.join(kind.file_name())).expect("the first dump holds every stream file");
        let roundtripped = fs::read(second.join(kind.file_name()))
            .expect("the second dump holds every stream file");
        assert!(
            original == roundtripped,
            "{kind} differs between the two dumps",
        );
    }

    let original =
        fs::read(first.join(Manifest::FILE_NAME)).expect("the first dump holds a manifest");
    let roundtripped =
        fs::read(second.join(Manifest::FILE_NAME)).expect("the second dump holds a manifest");
    assert!(
        original == roundtripped,
        "the manifests differ between the two dumps",
    );

    // Probe coverage dumps exactly the sampled anchor and comparison rows, and the three cards
    // hold two distinct texts. The reread counts come from the reader's own serving, so they pin
    // both sides.
    assert_eq!(written.records.canonical_embeddings, 2);
    assert_eq!(written.records.card_embeddings, 2);
    assert_eq!(reread.records.canonical_embeddings, 2);
    assert_eq!(reread.records.card_embeddings, 2);
}

#[tokio::test]
#[cfg_attr(
    miri,
    ignore = "tokio's I/O driver calls foreign functions Miri cannot emulate"
)]
#[expect(
    clippy::float_cmp,
    reason = "a served embedding must round-trip bit-identically"
)]
async fn offline_dataset_serves_the_row_streams_verbatim() {
    let directory = scratch("row-oracle");
    let source = fixture();
    dump(
        &source,
        &FixtureEmbedder,
        &directory,
        options(),
        &NoProgress,
    )
    .await
    .expect("the fixture dumps cleanly");

    let opened = OfflineDataset::open(&directory).expect("the dump opens whole");

    let nodes: Vec<_> = opened.nodes().try_collect().await.expect("nodes serve");
    assert_eq!(nodes.len(), source.nodes.len());
    for (served, expected) in nodes.iter().zip(&source.nodes) {
        assert_eq!(served.id, expected.id);
        assert_eq!(served.ontology, expected.ontology);
        assert_eq!(served.confidence, expected.confidence);
        assert_eq!(served.embedding.as_array(), expected.embedding.as_array());
    }

    let edges: Vec<_> = opened.edges().try_collect().await.expect("edges serve");
    assert_eq!(edges.len(), source.edges.len());
    for (served, expected) in edges.iter().zip(&source.edges) {
        assert_eq!(served.id, expected.id);
        assert_eq!(served.source, expected.source);
        assert_eq!(served.target, expected.target);
        assert_eq!(served.ontology, expected.ontology);
        assert_eq!(served.confidence, expected.confidence);
        assert_eq!(served.source_confidence, expected.source_confidence);
        assert_eq!(served.target_confidence, expected.target_confidence);
        match (&served.embedding, &expected.embedding) {
            (Some(served), Some(expected)) => assert_eq!(served.as_array(), expected.as_array()),
            (None, None) => {}
            (served, expected) => panic!(
                "edge embedding presence differs: served {served:?} against fixture {expected:?}",
            ),
        }
    }

    let ontology: Vec<_> = opened
        .ontology()
        .try_collect()
        .await
        .expect("ontology serves");
    assert_eq!(ontology.len(), source.ontology.len());
    for (served, expected) in ontology.iter().zip(&source.ontology) {
        assert_eq!(served.id, expected.id);
        assert_eq!(served.parents, expected.parents);
    }

    let cards: Vec<_> = opened
        .render_cards()
        .try_collect()
        .await
        .expect("cards serve");
    assert_eq!(cards.len(), source.cards.len());
    for ((id, served), (entry, expected)) in
        cards.iter().zip(source.ontology.iter().zip(&source.cards))
    {
        assert_eq!(id, &entry.id);
        assert_eq!(served, expected);
    }

    let node_legends: Vec<_> = opened
        .node_auxiliary_payload()
        .try_collect()
        .await
        .expect("node legends serve");
    assert_eq!(node_legends, source.node_legends);
    let edge_legends: Vec<_> = opened
        .edge_auxiliary_payload()
        .try_collect()
        .await
        .expect("edge legends serve");
    assert_eq!(edge_legends, source.edge_legends);
    let ontology_icons: Vec<_> = opened
        .ontology_auxiliary_payload()
        .try_collect()
        .await
        .expect("ontology icons serve");
    assert_eq!(ontology_icons, source.ontology_icons);
}

#[tokio::test]
#[cfg_attr(
    miri,
    ignore = "tokio's I/O driver calls foreign functions Miri cannot emulate"
)]
#[expect(
    clippy::float_cmp,
    reason = "a served embedding must round-trip bit-identically"
)]
async fn offline_dataset_serves_the_request_streams_verbatim() {
    let directory = scratch("request-oracle");
    let source = fixture();
    dump(
        &source,
        &FixtureEmbedder,
        &directory,
        DumpOptions {
            all_canonicals: true,
            ..options()
        },
        &NoProgress,
    )
    .await
    .expect("the fixture dumps cleanly");

    let opened = OfflineDataset::open(&directory).expect("the dump opens whole");

    let requested: Vec<_> = source.nodes.iter().map(|node| node.id).collect();
    let canonical: Vec<_> = opened
        .canonical_node_embeddings(requested.iter().copied())
        .try_collect()
        .await
        .expect("canonical embeddings serve");
    assert_eq!(canonical.len(), requested.len());
    for (id, served) in &canonical {
        assert_eq!(
            served.as_array(),
            source.canonical[id].as_array(),
            "the canonical embedding of a node differs",
        );
    }

    let types: Vec<_> = opened
        .node_types(requested.iter().copied())
        .try_collect()
        .await
        .expect("type lists serve");
    assert_eq!(types.len(), source.nodes.len());
    for (id, served) in &types {
        let expected = source
            .nodes
            .iter()
            .find(|node| &node.id == id)
            .expect("the served node is in the fixture");
        assert_eq!(served, &expected.ontology);
    }
}

#[tokio::test]
#[cfg_attr(
    miri,
    ignore = "tokio's I/O driver calls foreign functions Miri cannot emulate"
)]
async fn served_embeddings_borrow_the_mapped_stream_files() {
    let directory = scratch("borrow-proof");
    let source = fixture();
    dump(
        &source,
        &FixtureEmbedder,
        &directory,
        DumpOptions {
            all_canonicals: true,
            ..options()
        },
        &NoProgress,
    )
    .await
    .expect("the fixture dumps cleanly");

    let opened = OfflineDataset::open(&directory).expect("the dump opens whole");

    let nodes: Vec<_> = opened.nodes().try_collect().await.expect("nodes serve");
    assert_eq!(nodes.len(), source.nodes.len());
    for node in &nodes {
        assert_borrowed_from(opened.nodes.bytes(), &node.embedding);
    }

    let edges: Vec<_> = opened.edges().try_collect().await.expect("edges serve");
    let present: Vec<_> = edges
        .iter()
        .filter_map(|edge| edge.embedding.as_ref())
        .collect();
    assert!(
        !present.is_empty(),
        "the fixture holds at least one edge embedding",
    );
    for embedding in present {
        assert_borrowed_from(opened.edges.bytes(), embedding);
    }

    let requested: Vec<_> = source.nodes.iter().map(|node| node.id).collect();
    let canonical: Vec<_> = opened
        .canonical_node_embeddings(requested.iter().copied())
        .try_collect()
        .await
        .expect("canonical embeddings serve");
    assert_eq!(canonical.len(), requested.len());
    for (_, embedding) in &canonical {
        assert_borrowed_from(opened.canonical_embeddings.bytes(), embedding);
    }
}

#[tokio::test]
#[cfg_attr(
    miri,
    ignore = "tokio's I/O driver calls foreign functions Miri cannot emulate"
)]
#[expect(
    clippy::float_cmp,
    reason = "a served embedding must round-trip bit-identically"
)]
async fn offline_embedder_serves_hits_and_refuses_misses() {
    let directory = scratch("embedder-hit-miss");
    dump(
        &fixture(),
        &FixtureEmbedder,
        &directory,
        options(),
        &NoProgress,
    )
    .await
    .expect("the fixture dumps cleanly");

    let opened = OfflineDataset::open(&directory).expect("the dump opens whole");
    let embedder = opened
        .embedder()
        .expect("the embedder builds over the dump");
    assert_eq!(embedder.fingerprint(), FixtureEmbedder.fingerprint());

    let served = embedder
        .embed(["Root type card"])
        .await
        .expect("the dump embedded the rendered text");
    assert_eq!(served.len(), 1);
    assert_eq!(
        served[0].as_array(),
        embedding_of("Root type card").as_array(),
    );

    let text = "a text the dump never embedded";
    let Err(error) = embedder.embed([text]).await else {
        panic!("an unknown text must refuse");
    };
    assert_eq!(error.hash, Sha256Digest::of(text));
}

#[tokio::test]
#[cfg_attr(
    miri,
    ignore = "tokio's I/O driver calls foreign functions Miri cannot emulate"
)]
async fn open_refuses_a_tampered_stream() {
    let directory = scratch("digest-tamper");
    dump(
        &fixture(),
        &FixtureEmbedder,
        &directory,
        options(),
        &NoProgress,
    )
    .await
    .expect("the fixture dumps cleanly");

    let path = directory.join(StreamKind::Nodes.file_name());
    let mut bytes = fs::read(&path).expect("the dump holds the node stream");
    *bytes.last_mut().expect("the stream is not empty") ^= 0x01;
    fs::write(&path, &bytes).expect("the tampered stream writes back");

    let error =
        OfflineDataset::open(&directory).expect_err("a tampered stream must refuse to open");
    assert!(
        matches!(
            error,
            OpenDumpError::Digest {
                kind: StreamKind::Nodes,
                ..
            },
        ),
        "the refusal names the tampered stream: {error}",
    );
}

#[tokio::test]
#[cfg_attr(
    miri,
    ignore = "tokio's I/O driver calls foreign functions Miri cannot emulate"
)]
#[expect(
    clippy::little_endian_bytes,
    reason = "the archive's structural fields are little-endian by rkyv's format, and the test \
              rewrites one of them byte for byte"
)]
async fn open_refuses_a_defective_archive() {
    let directory = scratch("archive-defect");
    dump(
        &fixture(),
        &FixtureEmbedder,
        &directory,
        options(),
        &NoProgress,
    )
    .await
    .expect("the fixture dumps cleanly");

    // The node root sits at the file's tail, and its trailing eight bytes are the embedding
    // column's length. An absurd length makes the column escape the file, which is exactly the
    // class of defect the digest cannot see and byte-level validation must.
    let path = directory.join(StreamKind::Nodes.file_name());
    let mut bytes = fs::read(&path).expect("the dump holds the node stream");
    let tail = bytes.len() - 8;
    bytes[tail..].copy_from_slice(&u64::MAX.to_le_bytes());
    reseal(&directory, StreamKind::Nodes, &bytes);

    let error =
        OfflineDataset::open(&directory).expect_err("a defective archive must refuse to open");
    assert!(
        matches!(
            error,
            OpenDumpError::Archive {
                kind: StreamKind::Nodes,
                ..
            },
        ),
        "the refusal names the defective stream: {error}",
    );
}

#[tokio::test]
#[cfg_attr(
    miri,
    ignore = "tokio's I/O driver calls foreign functions Miri cannot emulate"
)]
async fn open_refuses_an_embedding_position_outside_the_column() {
    let directory = scratch("edge-position");
    dump(
        &fixture(),
        &FixtureEmbedder,
        &directory,
        options(),
        &NoProgress,
    )
    .await
    .expect("the fixture dumps cleanly");

    // A defective writer's edge record naming a position its column does not hold is invisible
    // to byte-level validation, because each field is valid alone. The open's cross-field check
    // is what refuses it.
    let defective = EdgesRoot {
        records: vec![EdgeRecord {
            id: entity(21),
            source: NodeRowId::new(0),
            target: NodeRowId::new(1),
            ontology: vec![OntologyRowId::new(1)],
            embedding: Some(3),
            confidence: None,
            source_confidence: None,
            target_confidence: None,
        }],
        embeddings: vec![Embedding::new(
            vector::<PROJECTOR_DIMENSIONS>(21).as_array(),
        )],
    };
    let bytes = rkyv::to_bytes::<rancor::Error>(&defective).expect("the defective root serializes");
    reseal(&directory, StreamKind::Edges, &bytes);

    let error = OfflineDataset::open(&directory)
        .expect_err("an out-of-column embedding position must refuse to open");
    assert!(
        matches!(
            error,
            OpenDumpError::EmbeddingPosition {
                kind: StreamKind::Edges,
                record: 0,
                position: 3,
                embeddings: 1,
            },
        ),
        "the refusal names the defective record: {error}",
    );
}

#[test]
#[expect(
    clippy::little_endian_bytes,
    reason = "a stored confidence is the writer's native f64, little-endian on every host that \
              runs this suite, and the test rewrites its bytes"
)]
fn archived_confidence_outside_the_interval_refuses() {
    let root = NodesRoot {
        records: vec![NodeRecord {
            id: entity(1),
            confidence: Some(unit_fraction!(0.75)),
            ontology: vec![],
        }],
        embeddings: vec![Embedding::new(vector::<PROJECTOR_DIMENSIONS>(1).as_array())],
    };

    let mut bytes = AlignedVec::<32>::new();
    to_bytes_in::<_, rancor::Error>(&root, &mut bytes).expect("the root serializes");

    rkyv::access::<ArchivedNodesRoot, rancor::Error>(&bytes)
        .expect("the untampered archive validates");

    // 0.75 stores as the eight little-endian bytes of its `f64` form. Rewriting the exponent
    // byte turns the stored confidence into 1.5, a bit pattern outside the unit interval that
    // only the domain check can refuse.
    let stored = 0.75_f64.to_le_bytes();
    let tampered = 1.5_f64.to_le_bytes();
    let position = bytes
        .windows(stored.len())
        .position(|window| window == stored)
        .expect("the archive holds the stored confidence");
    assert_eq!(
        bytes[position..]
            .windows(stored.len())
            .filter(|window| *window == stored)
            .count(),
        1,
        "the stored confidence's byte pattern is unique in the archive",
    );
    bytes[position..position + tampered.len()].copy_from_slice(&tampered);

    rkyv::access::<ArchivedNodesRoot, rancor::Error>(&bytes)
        .expect_err("a confidence outside the unit interval must refuse validation");
}
