//! Draining dataset streams into their dump files.
//!
//! One function per stream file pairs a dataset drain with the archive writer it feeds. The
//! embedding-bearing streams (nodes, edges, canonical embeddings, card embeddings) push their heavy
//! columns through [`StreamArchive`] one record at a time. A dump's memory follows its record
//! columns rather than its embedding columns. The record-only streams collect and serialize whole
//! through [`write_archive`], because their records carry out-of-line data a streamed column cannot
//! hold.

use core::pin::pin;
use std::collections::HashSet;

use camino::Utf8Path;
use futures::{Stream, TryStreamExt as _};
use hashql_core::id::IdVec;
use rkyv::{munge::munge, ser::allocator::Arena, vec::ArchivedVec};

use super::{
    super::{
        format::{CanonicalCoverage, FileManifest, StreamKind},
        record::{
            ArchivedEdgesRoot, ArchivedNodesRoot, CanonicalRecord, CardEmbeddingRecord, CardRecord,
            EdgeRecord, Embedding, NodeRecord, OntologyRecord, PayloadsRoot,
        },
    },
    DumpError, DumpOptions,
    archive::{StreamArchive, write_archive},
};
use crate::{
    dataset::{Dataset, PROJECTOR_DIMENSIONS, card::Card},
    identity::{NodeRowId, OntologyRowId},
    postgres::id::{ArchivedEntityId, ArchivedOntologyTypeUuid},
    progress::Progress,
    salt::{
        embedding::{CardEmbedder, CardEmbeddingTable, embed_cards},
        policy::annotation::assembly::assemble,
        quality::probe::probe_sample,
        runner::probe_rng,
    },
};

/// The manifest row and record count of one written stream file.
pub(super) struct WrittenStream {
    pub file: FileManifest,
    pub records: u64,
}

/// Drains one stream to completion inside its own scope, passing each item to `collect`.
///
/// The pinned stream dies with this call. A source whose streams share one connection is free to
/// open the next stream after it returns.
///
/// # Errors
///
/// Returns `map_err`'s reading of the stream's own failure, or whatever `collect` returns for an
/// item. Either stops the drain where it happened, with the items before it already collected.
pub(super) async fn drain<T, F, S, D, E>(
    stream: S,
    map_err: fn(F) -> DumpError<D, E>,
    mut collect: impl FnMut(T) -> Result<(), DumpError<D, E>>,
) -> Result<(), DumpError<D, E>>
where
    S: Stream<Item = Result<T, F>>,
{
    let mut stream = pin!(stream);
    while let Some(item) = stream.try_next().await.map_err(map_err)? {
        collect(item)?;
    }

    Ok(())
}

/// Derives the canonical stream's coverage and its requested nodes.
///
/// Probe coverage requests [`probe_sample`]'s draw from the seed-derived generator
/// ([`probe_rng`]), the same draw the admission probe makes. A probe over the same rows with the
/// same seed and counts asks for the same nodes. All-nodes coverage requests every row.
///
/// Budgets covering the corpus request every canonical embedding, including when their sum exceeds
/// usize.
fn canonical_request(
    options: &DumpOptions<'_>,
    node_ids: IdVec<NodeRowId, ArchivedEntityId>,
) -> (CanonicalCoverage, Vec<ArchivedEntityId>) {
    let rows = node_ids.len();
    let sample = options
        .anchors
        .get()
        .saturating_add(options.comparisons.get());

    if options.all_canonicals || sample >= rows {
        return (CanonicalCoverage::All, node_ids.into_raw());
    }

    let picked = probe_sample(
        probe_rng(options.seed),
        &node_ids,
        options.anchors.get(),
        options.comparisons.get(),
    )
    .into_iter()
    .map(|row| node_ids[row])
    .collect();

    (
        CanonicalCoverage::Probe {
            seed: options.seed,
            anchors: options.anchors.get() as u64,
            comparisons: options.comparisons.get() as u64,
        },
        picked,
    )
}

/// Drains the node stream into its file, collecting the node ids for the canonical request.
///
/// The embedding column streams to disk as rows arrive, and no embedding table accumulates in
/// memory. The drain still holds the node ids it returns and the record column it serializes at
/// the end.
///
/// # Errors
///
/// Returns [`Io`] when creating the file fails and [`Archive`] when the embedding column cannot
/// open. Inside the drain the source and the embedding write can each stop it, [`Dataset`] for
/// the stream and [`Archive`] for the write, in whichever order a row reaches them. Sealing the
/// file returns [`Archive`] when a record or the root does not serialize, then [`Io`] when the
/// flush fails.
///
/// [`Io`]: DumpError::Io
/// [`Archive`]: DumpError::Archive
/// [`Dataset`]: DumpError::Dataset
pub(super) async fn write_nodes<D, E>(
    dataset: &D,
    directory: &Utf8Path,
) -> Result<(WrittenStream, IdVec<NodeRowId, ArchivedEntityId>), DumpError<D::Error, E>>
where
    D: Dataset<NodeId = ArchivedEntityId>,
{
    let mut arena = Arena::new();
    let mut archive = StreamArchive::create(directory, StreamKind::Nodes, arena.acquire())?;
    let mut embeddings = archive.column::<Embedding<PROJECTOR_DIMENSIONS>, _, _>()?;

    let mut node_ids = IdVec::new();
    let mut records = Vec::new();
    drain(dataset.nodes(), DumpError::Dataset, |node| {
        node_ids.push(node.id);
        records.push(NodeRecord {
            id: node.id,
            confidence: node.confidence,
            ontology: node.ontology.into_vec(),
        });
        embeddings.push(
            &mut archive,
            &Embedding::new(node.embedding.as_ref().as_array()),
        )
    })
    .await?;

    let (embeddings, embedding_count) = embeddings.into_parts();
    let (record_resolver, record_count) = archive.slice_column(&records)?;
    let file = archive.finish(|out| {
        munge!(let ArchivedNodesRoot { records: record_place, embeddings: embedding_place } = out);
        ArchivedVec::resolve_from_len(record_count, record_resolver, record_place);
        ArchivedVec::resolve_from_len(embedding_count, embeddings, embedding_place);
    })?;

    Ok((
        WrittenStream {
            file,
            records: record_count as u64,
        },
        node_ids,
    ))
}

/// Drains the edge stream into its file, packing the present embeddings apart.
///
/// The packed embedding column streams to disk as rows arrive, and no embedding table
/// accumulates in memory. The record column lives until the file closes.
///
/// # Errors
///
/// The node stream's surface, for the edge stream: [`DumpError::Io`] on the file, then
/// [`DumpError::Archive`] on the column, then [`DumpError::Dataset`] or [`DumpError::Archive`]
/// from the drain, then [`DumpError::Archive`] and [`DumpError::Io`] as the file closes.
pub(super) async fn write_edges<D, E>(
    dataset: &D,
    directory: &Utf8Path,
) -> Result<WrittenStream, DumpError<D::Error, E>>
where
    D: Dataset<EdgeId = ArchivedEntityId>,
{
    let mut arena = Arena::new();
    let mut archive = StreamArchive::create(directory, StreamKind::Edges, arena.acquire())?;
    let mut embeddings = archive.column::<Embedding<PROJECTOR_DIMENSIONS>, _, _>()?;

    let mut records = Vec::new();
    drain(dataset.edges(), DumpError::Dataset, |edge| {
        let embedding = match edge.embedding {
            Some(embedding) => {
                let position = embeddings.count() as u64;
                embeddings.push(&mut archive, &Embedding::new(embedding.as_ref().as_array()))?;
                Some(position)
            }
            None => None,
        };
        records.push(EdgeRecord {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            ontology: edge.ontology.into_vec(),
            embedding,
            confidence: edge.confidence,
            source_confidence: edge.source_confidence,
            target_confidence: edge.target_confidence,
        });

        Ok(())
    })
    .await?;

    let (embeddings, embedding_count) = embeddings.into_parts();
    let (record_resolver, record_count) = archive.slice_column(&records)?;
    let file = archive.finish(|out| {
        munge!(let ArchivedEdgesRoot { records: record_place, embeddings: embedding_place } = out);
        ArchivedVec::resolve_from_len(record_count, record_resolver, record_place);
        ArchivedVec::resolve_from_len(embedding_count, embeddings, embedding_place);
    })?;

    Ok(WrittenStream {
        file,
        records: record_count as u64,
    })
}

/// Drains the ontology stream into its file.
///
/// # Errors
///
/// Returns [`DumpError::Dataset`] when the ontology stream fails, then [`DumpError::Io`] or
/// [`DumpError::Archive`] from the whole-file write. The write collects every record first. A
/// stream failure therefore leaves this call's own file uncreated, and touches neither the
/// streams written before it nor any file an earlier dump left at this path.
pub(super) async fn write_ontology<D, E>(
    dataset: &D,
    directory: &Utf8Path,
) -> Result<WrittenStream, DumpError<D::Error, E>>
where
    D: Dataset<OntologyId = ArchivedOntologyTypeUuid>,
{
    let mut records = Vec::new();
    drain(dataset.ontology(), DumpError::Dataset, |entry| {
        records.push(OntologyRecord {
            id: entry.id,
            parents: entry.parents.into_vec(),
        });

        Ok(())
    })
    .await?;

    let count = records.len() as u64;
    let file = write_archive(directory, StreamKind::Ontology, &records)?;
    Ok(WrittenStream {
        file,
        records: count,
    })
}

/// Drains the card stream into its file, keeping the finished cards for embedding.
///
/// # Errors
///
/// Returns [`DumpError::Cards`] when a card fails to render or arrive, then [`DumpError::Io`] or
/// [`DumpError::Archive`] from the whole-file write.
pub(super) async fn write_cards<D, E>(
    dataset: &D,
    directory: &Utf8Path,
) -> Result<(WrittenStream, IdVec<OntologyRowId, Card>), DumpError<D::Error, E>>
where
    D: Dataset<OntologyId = ArchivedOntologyTypeUuid>,
{
    let mut records = Vec::new();
    let mut rendered: IdVec<OntologyRowId, Card> = IdVec::new();

    drain(dataset.render_cards(), DumpError::Cards, |(id, card)| {
        records.push(CardRecord {
            id,
            text: card.card_text().to_owned(),
            token_count: card.token_count() as u64,
            truncations: card
                .truncations()
                .iter()
                .map(|label| label.clone().into_owned())
                .collect(),
            severely_truncated: card.severely_truncated(),
        });
        rendered.push(card);

        Ok(())
    })
    .await?;

    let count = records.len() as u64;
    let file = write_archive(directory, StreamKind::Cards, &records)?;
    Ok((
        WrittenStream {
            file,
            records: count,
        },
        rendered,
    ))
}

/// Drains one payload stream's raw bytes into its file.
///
/// # Errors
///
/// Returns [`DumpError::Dataset`] when the payload stream fails, then [`DumpError::Io`] or
/// [`DumpError::Archive`] from the whole-file write.
pub(super) async fn write_payloads<S, D, E>(
    stream: S,
    directory: &Utf8Path,
    kind: StreamKind,
) -> Result<WrittenStream, DumpError<D, E>>
where
    S: Stream<Item = Result<Vec<u8>, D>>,
{
    let mut payloads: PayloadsRoot = Vec::new();
    drain(stream, DumpError::Dataset, |bytes| {
        payloads.push(bytes);
        Ok(())
    })
    .await?;

    let records = payloads.len() as u64;
    let file = write_archive(directory, kind, &payloads)?;
    Ok(WrittenStream { file, records })
}

/// Drains the requested canonical embeddings into their file.
///
/// Every record streams to disk as it arrives, and no embedding table accumulates in memory.
/// The drain holds the requested ids throughout, because the count check compares against them.
///
/// # Errors
///
/// Returns [`DumpError::Io`] when creating the file fails, [`DumpError::Archive`] when the
/// column cannot open or a record does not serialize, and [`DumpError::Dataset`] when the
/// embedding stream fails. After the drain, [`DumpError::CanonicalCount`] reports a delivery
/// differing from the request, once rather than per record, and sealing the file can still
/// return [`DumpError::Archive`] or [`DumpError::Io`].
///
/// # Panics
///
/// Deriving the request sums the anchor and comparison counts, which panics on a total past
/// `usize` where overflow checks are on.
pub(super) async fn write_canonicals<D, E>(
    dataset: &D,
    directory: &Utf8Path,
    options: &DumpOptions<'_>,
    node_ids: IdVec<NodeRowId, ArchivedEntityId>,
) -> Result<(CanonicalCoverage, WrittenStream), DumpError<D::Error, E>>
where
    D: Dataset<NodeId = ArchivedEntityId>,
{
    let (coverage, requested) = canonical_request(options, node_ids);

    let mut arena = Arena::new();
    let mut archive =
        StreamArchive::create(directory, StreamKind::CanonicalEmbeddings, arena.acquire())?;
    let mut column = archive.column::<rkyv::Archived<CanonicalRecord>, _, _>()?;

    drain(
        dataset.canonical_node_embeddings(requested.iter().copied()),
        DumpError::Dataset,
        |(id, embedding)| {
            column.push(
                &mut archive,
                &CanonicalRecord {
                    id,
                    embedding: Embedding::new(embedding.as_ref().as_array()),
                },
            )
        },
    )
    .await?;

    if column.count() != requested.len() {
        return Err(DumpError::CanonicalCount {
            requested: requested.len() as u64,
            delivered: column.count() as u64,
        });
    }

    let (resolver, count) = column.into_parts();
    let file = archive.finish::<rkyv::Archived<Vec<CanonicalRecord>>, _, _>(|out| {
        ArchivedVec::resolve_from_len(count, resolver, out);
    })?;

    Ok((
        coverage,
        WrittenStream {
            file,
            records: count as u64,
        },
    ))
}

/// Creates the card embeddings and writes them into their file.
///
/// The file holds one record per distinct text hash.
///
/// Tables merge in order, and equal texts across tables write once. The annotation table adds
/// exactly the texts the dataset's cards do not already carry. Both tables stand complete before
/// the column opens, and each record streams to disk as it enters. Merging therefore costs the
/// written-hash set rather than a second embedding table.
///
/// # Errors
///
/// Returns [`DumpError::Embedding`] when embedding the card texts fails and
/// [`DumpError::Assembly`] when the annotation corpus fails to assemble, both before this call
/// creates its file, then [`DumpError::Io`] and [`DumpError::Archive`] from writing it.
pub(super) async fn write_card_embeddings<D, E, P>(
    embedder: &E,
    rendered: IdVec<OntologyRowId, Card>,
    options: &DumpOptions<'_>,
    directory: &Utf8Path,
    progress: &P,
) -> Result<WrittenStream, DumpError<D, E::Error>>
where
    E: CardEmbedder + Sync,
    P: Progress + Sync,
{
    let (table, _stats) = embed_cards(embedder, &rendered, None, progress)
        .await
        .map_err(DumpError::Embedding)?;
    drop(rendered);

    let assembled = if let Some(corpus) = options.annotations {
        Some(
            assemble(corpus, embedder, options.assembly, progress)
                .await
                .map_err(DumpError::Assembly)?,
        )
    } else {
        None
    };

    let mut tables: Vec<&CardEmbeddingTable> = vec![&table];
    if let Some(corpus) = &assembled {
        tables.push(corpus.table());
    }

    let mut arena = Arena::new();
    let mut archive =
        StreamArchive::create(directory, StreamKind::CardEmbeddings, arena.acquire())?;
    let mut column = archive.column::<rkyv::Archived<CardEmbeddingRecord>, _, _>()?;

    let mut written = HashSet::new();
    for table in tables {
        for (&hash, embedding) in table.view().hashes().iter().zip(table.rows()) {
            if !written.insert(hash) {
                continue;
            }

            column.push(
                &mut archive,
                &CardEmbeddingRecord {
                    hash,
                    embedding: Embedding::new(embedding.as_array()),
                },
            )?;
        }
    }

    let (resolver, count) = column.into_parts();
    let file = archive.finish::<rkyv::Archived<Vec<CardEmbeddingRecord>>, _, _>(|out| {
        ArchivedVec::resolve_from_len(count, resolver, out);
    })?;

    Ok(WrittenStream {
        file,
        records: count as u64,
    })
}
