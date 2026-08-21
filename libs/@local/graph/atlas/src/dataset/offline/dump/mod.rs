//! Writing a dump directory from a live [`Dataset`].
//!
//! [`dump()`] drains every stream of one dataset into the directory layout
//! [`OfflineDataset`](super::OfflineDataset) accepts and mints the embeddings an offline fit
//! will look up. Each stream file serializes as one rkyv archive straight to disk through a
//! digesting writer, and the manifest seals the directory last, so an interrupted dump leaves a
//! directory the reader refuses instead of a truncated dataset that parses. A stale manifest
//! from an earlier dump into the same directory is removed before the first stream write, so an
//! interrupted rewrite cannot leave the old manifest vouching for new files.
//!
//! The work splits into a read phase ([`read`]) that drains the dataset and an embed phase
//! ([`embed`]) that spends the provider budget and seals the manifest, so a caller may close
//! its source snapshot between the two. [`dump()`] runs both over one live dataset.
//!
//! # Canonical coverage
//!
//! Full canonical embeddings are the one stream a fit consumes only in part. The admission probe
//! fetches exactly the sample its seed, anchor count, and comparison count derive, so the dump
//! replays that derivation over the node rows it wrote and dumps the sampled nodes' embeddings
//! alone. Requesting every node instead ([`DumpOptions::all_canonicals`], or a sample no smaller
//! than the corpus) trades dump size for freedom in the offline fit's probe parameters, and the
//! manifest records which coverage the stream holds.
//!
//! # Card embeddings
//!
//! An offline fit renders its own cards and hands the texts to its embedder, so the dump embeds
//! the texts its render produces and stores each vector under its text hash, where
//! [`OfflineEmbedder`](super::embedder::OfflineEmbedder) finds it. A supplied annotation corpus
//! renders further texts inside its assembly, so the dump runs the same assembly the fit would
//! run and merges those vectors into the stream. An offline fit whose supplies match the dump's
//! then resolves every text without a provider.

use core::{error::Error, fmt, num::NonZero};
use std::{fs, io};

use camino::Utf8Path;
use futures::TryStreamExt as _;
use hashql_core::id::IdVec;
use zerocopy::IntoBytes as _;

use self::streams::{
    WrittenStream, write_canonicals, write_card_embeddings, write_cards, write_edges, write_nodes,
    write_ontology, write_payloads,
};
use super::{
    super::{Dataset, TemporalAxes, card::Card},
    format::{CanonicalCoverage, Manifest, StreamKind, StreamManifests, Version},
};
use crate::{
    file::region::machine::Architecture,
    identity::OntologyRowId,
    postgres::id::{ArchivedEntityId, ArchivedOntologyTypeUuid},
    progress::Progress,
    salt::{
        embedding::{CardEmbedder, CardEmbeddingError},
        policy::annotation::{
            AnnotationCorpus,
            assembly::{AssemblyConfig, AssemblyError},
        },
    },
};

mod archive;
mod streams;

/// One dump's coverage and supplies.
#[derive(Debug, Copy, Clone)]
pub(crate) struct DumpOptions<'corpus> {
    /// The fit seed the canonical sample derives from.
    ///
    /// An offline fit replays the admission probe's sample from its own seed, so under probe
    /// coverage the fit's seed must equal this one.
    pub seed: u64,
    /// The probe's anchor count.
    pub anchors: NonZero<usize>,
    /// The probe's comparison count.
    pub comparisons: NonZero<usize>,
    /// Dumps every node's canonical embedding instead of the probe sample.
    pub all_canonicals: bool,
    /// The annotation corpus the offline fit will run with, when it runs with one.
    ///
    /// Assembly renders and embeds its own card texts, so a fit supplied with a corpus the dump
    /// never assembled would request embeddings the dump does not hold.
    pub annotations: Option<&'corpus AnnotationCorpus>,
    /// The assembly settings for the annotation corpus's embedding pass.
    pub assembly: AssemblyConfig,
}

/// Writing a dump directory failed.
///
/// Every variant that names a stream carries the [`StreamKind`] whose file was being written,
/// and the kind displays as the file's name inside the directory, so the report points at one
/// path.
#[derive(Debug)]
pub(crate) enum DumpError<D, E> {
    /// Creating the dump directory failed.
    Directory(io::Error),
    /// Writing a stream file failed.
    Io {
        /// The stream whose file refused.
        kind: StreamKind,
        /// The failing write.
        source: io::Error,
    },
    /// Serializing a stream's archive failed.
    Archive {
        /// The stream whose file refused.
        kind: StreamKind,
        /// The failing serialization.
        source: rancor::Error,
    },
    /// The source dataset failed to deliver a stream.
    Dataset(D),
    /// The card stream failed to render or deliver.
    Cards(io::Error),
    /// The canonical stream delivered a different number of embeddings than requested.
    CanonicalCount {
        /// Distinct nodes requested.
        requested: u64,
        /// Records the stream delivered.
        delivered: u64,
    },
    /// Embedding the rendered card texts failed.
    Embedding(CardEmbeddingError<OntologyRowId, E>),
    /// Assembling the annotation corpus failed.
    Assembly(AssemblyError<E>),
    /// Writing the manifest failed.
    Manifest(io::Error),
}

impl<D: fmt::Display, E: fmt::Display> fmt::Display for DumpError<D, E> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Directory(error) => write!(fmt, "the dump directory failed to create: {error}"),
            Self::Io { kind, source } => write!(fmt, "{kind}: {source}"),
            Self::Archive { kind, source } => {
                write!(fmt, "{kind}: the archive failed to serialize: {source}")
            }
            Self::Dataset(error) => write!(fmt, "the dataset failed to deliver: {error}"),
            Self::Cards(error) => write!(fmt, "the card stream failed: {error}"),
            Self::CanonicalCount {
                requested,
                delivered,
            } => write!(
                fmt,
                "the canonical stream delivered {delivered} embeddings for {requested} requested \
                 nodes",
            ),
            Self::Embedding(error) => error.fmt(fmt),
            Self::Assembly(error) => error.fmt(fmt),
            Self::Manifest(error) => write!(fmt, "the manifest failed to write: {error}"),
        }
    }
}

impl<D, E> Error for DumpError<D, E>
where
    D: Error + 'static,
    E: Error + 'static,
{
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Directory(error) | Self::Cards(error) | Self::Manifest(error) => Some(error),
            Self::Io { source, .. } => Some(source),
            Self::Archive { source, .. } => Some(source),
            Self::Dataset(error) => Some(error),
            Self::Embedding(error) => Some(error),
            Self::Assembly(error) => Some(error),
            Self::CanonicalCount { .. } => None,
        }
    }
}

/// Per-stream record counts, measured as the streams were written.
///
/// The manifest identifies files by length and digest alone, so the counts a report renders
/// come from here, one field per [`StreamKind`].
#[derive(Debug, Copy, Clone)]
pub(crate) struct RecordCounts {
    pub nodes: u64,
    pub edges: u64,
    pub ontology: u64,
    pub cards: u64,
    pub node_legends: u64,
    pub edge_legends: u64,
    pub ontology_icons: u64,
    pub canonical_embeddings: u64,
    pub card_embeddings: u64,
}

impl RecordCounts {
    /// Returns the named stream's record count.
    pub(crate) const fn get(&self, kind: StreamKind) -> u64 {
        match kind {
            StreamKind::Nodes => self.nodes,
            StreamKind::Edges => self.edges,
            StreamKind::Ontology => self.ontology,
            StreamKind::Cards => self.cards,
            StreamKind::NodeLegends => self.node_legends,
            StreamKind::EdgeLegends => self.edge_legends,
            StreamKind::OntologyIcons => self.ontology_icons,
            StreamKind::CanonicalEmbeddings => self.canonical_embeddings,
            StreamKind::CardEmbeddings => self.card_embeddings,
        }
    }
}

/// The sealed manifest of a finished dump, beside the counts a report renders.
#[derive(Debug)]
pub(crate) struct Dump {
    /// The sealed manifest.
    pub manifest: Manifest,
    /// The per-stream record counts.
    pub records: RecordCounts,
}

/// The read phase's yield, carried into the embed phase.
///
/// Every dataset-derived stream is already on disk, and the value borrows nothing from the
/// dataset, so the caller may close the source snapshot before the embed phase spends provider
/// budget.
pub(crate) struct DumpReading {
    axes: Option<TemporalAxes>,
    coverage: CanonicalCoverage,
    rendered: IdVec<OntologyRowId, Card>,
    nodes: WrittenStream,
    edges: WrittenStream,
    ontology: WrittenStream,
    cards: WrittenStream,
    node_legends: WrittenStream,
    edge_legends: WrittenStream,
    ontology_icons: WrittenStream,
    canonical_embeddings: WrittenStream,
}

/// Drains every dataset stream into the directory: the dump's read phase.
///
/// The directory is created when absent, and a stale manifest from an earlier dump is removed
/// before the first stream write. The returned reading borrows nothing from the dataset, so the
/// caller may close the source snapshot before [`embed`] runs. Only [`embed`] writes the
/// manifest, so a directory holding this phase's files alone is one the reader refuses.
///
/// # Errors
///
/// Returns [`DumpError::Directory`] when the directory cannot be created or a stale manifest
/// cannot be removed, [`DumpError::Io`] when a stream file refuses a write,
/// [`DumpError::Archive`] when a stream's archive fails to serialize, [`DumpError::Dataset`]
/// when the source fails to deliver a stream, [`DumpError::Cards`] when the card stream fails,
/// and [`DumpError::CanonicalCount`] when the canonical stream's delivery count differs from
/// the request.
pub(crate) async fn read<D, E>(
    dataset: &D,
    directory: &Utf8Path,
    options: &DumpOptions<'_>,
) -> Result<DumpReading, DumpError<D::Error, E>>
where
    D: Dataset<
            NodeId = ArchivedEntityId,
            EdgeId = ArchivedEntityId,
            OntologyId = ArchivedOntologyTypeUuid,
        >,
{
    fs::create_dir_all(directory).map_err(DumpError::Directory)?;

    // Remove a stale manifest before the first stream write: the manifest is the acceptance
    // boundary, so an interrupted rewrite must leave a directory the reader refuses rather than
    // an old manifest beside new files.
    match fs::remove_file(directory.join(Manifest::FILE_NAME)) {
        Ok(()) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(error) => return Err(DumpError::Directory(error)),
    }

    let (nodes, node_ids) = write_nodes(dataset, directory).await?;
    let edges = write_edges(dataset, directory).await?;
    let ontology = write_ontology(dataset, directory).await?;
    let (cards, rendered) = write_cards(dataset, directory).await?;

    let node_legends = write_payloads(
        dataset
            .node_auxiliary_payload()
            .map_ok(|legend| legend.as_bytes().to_vec()),
        directory,
        StreamKind::NodeLegends,
    )
    .await?;
    let edge_legends = write_payloads(
        dataset
            .edge_auxiliary_payload()
            .map_ok(|legend| legend.as_bytes().to_vec()),
        directory,
        StreamKind::EdgeLegends,
    )
    .await?;
    let ontology_icons = write_payloads(
        dataset
            .ontology_auxiliary_payload()
            .map_ok(|icon| icon.as_bytes().to_vec()),
        directory,
        StreamKind::OntologyIcons,
    )
    .await?;

    let (coverage, canonical_embeddings) =
        write_canonicals(dataset, directory, options, node_ids).await?;

    Ok(DumpReading {
        axes: dataset.axes(),
        coverage,
        rendered,
        nodes,
        edges,
        ontology,
        cards,
        node_legends,
        edge_legends,
        ontology_icons,
        canonical_embeddings,
    })
}

/// Mints the card embeddings and seals the manifest: the dump's embed phase, its one paid step.
///
/// # Errors
///
/// Returns [`DumpError::Embedding`] when embedding the rendered card texts fails,
/// [`DumpError::Assembly`] when assembling the annotation corpus fails, [`DumpError::Io`] when
/// the card-embedding file refuses a write, [`DumpError::Archive`] when its archive fails to
/// serialize, and [`DumpError::Manifest`] when the manifest fails to write.
pub(crate) async fn embed<D, E, P>(
    embedder: &E,
    DumpReading {
        axes,
        coverage,
        rendered,
        nodes,
        edges,
        ontology,
        cards,
        node_legends,
        edge_legends,
        ontology_icons,
        canonical_embeddings,
    }: DumpReading,
    directory: &Utf8Path,
    options: &DumpOptions<'_>,
    progress: &P,
) -> Result<Dump, DumpError<D, E::Error>>
where
    E: CardEmbedder + Sync,
    P: Progress + Sync,
{
    let card_embeddings =
        write_card_embeddings(embedder, rendered, options, directory, progress).await?;

    let manifest = Manifest {
        version: Version::V1,
        machine: Architecture::HOST,
        axes,
        embedder: embedder.fingerprint(),
        coverage,
        streams: StreamManifests {
            nodes: nodes.file,
            edges: edges.file,
            ontology: ontology.file,
            cards: cards.file,
            node_legends: node_legends.file,
            edge_legends: edge_legends.file,
            ontology_icons: ontology_icons.file,
            canonical_embeddings: canonical_embeddings.file,
            card_embeddings: card_embeddings.file,
        },
    };

    let document = serde_json::to_vec_pretty(&manifest).expect("the manifest serializes");
    fs::write(directory.join(Manifest::FILE_NAME), document).map_err(DumpError::Manifest)?;

    Ok(Dump {
        manifest,
        records: RecordCounts {
            nodes: nodes.records,
            edges: edges.records,
            ontology: ontology.records,
            cards: cards.records,
            node_legends: node_legends.records,
            edge_legends: edge_legends.records,
            ontology_icons: ontology_icons.records,
            canonical_embeddings: canonical_embeddings.records,
            card_embeddings: card_embeddings.records,
        },
    })
}

/// Writes the dataset's view into a dump directory at `directory` and returns the sealed
/// manifest beside the written record counts.
///
/// Runs the read phase ([`read`]) and the embed phase ([`embed`]) over one live dataset. Every
/// stream file is written whole, embeddings mint through `embedder` (the dump's one paid step),
/// and the manifest seals the directory last, so a reader never accepts a partial dump. See the
/// [module documentation](self) for the coverage and card-embedding contracts.
///
/// # Errors
///
/// Returns [`DumpError::Directory`] when the directory cannot be created, [`DumpError::Io`] when
/// a stream file refuses a write, [`DumpError::Archive`] when a stream's archive fails to
/// serialize, [`DumpError::Dataset`] when the source fails to deliver a stream,
/// [`DumpError::Cards`] when the card stream fails, [`DumpError::CanonicalCount`] when the
/// canonical stream's delivery count differs from the request, [`DumpError::Embedding`] when
/// embedding the rendered card texts fails, [`DumpError::Assembly`] when assembling the
/// annotation corpus fails, and [`DumpError::Manifest`] when the manifest fails to write.
pub(crate) async fn dump<D, E, P>(
    dataset: &D,
    embedder: &E,
    directory: &Utf8Path,
    options: DumpOptions<'_>,
    progress: &P,
) -> Result<Dump, DumpError<D::Error, E::Error>>
where
    D: Dataset<
            NodeId = ArchivedEntityId,
            EdgeId = ArchivedEntityId,
            OntologyId = ArchivedOntologyTypeUuid,
        >,
    E: CardEmbedder + Sync,
    P: Progress + Sync,
{
    let reading = read(dataset, directory, &options).await?;
    embed(embedder, reading, directory, &options, progress).await
}
