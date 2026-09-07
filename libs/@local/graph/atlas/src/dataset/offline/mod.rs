//! Reading a dump directory as a [`Dataset`].
//!
//! An offline fit runs where the graph's store does not: [`OfflineDataset`] opens the directory a
//! dump wrote and serves the frozen view inside it through the same [`Dataset`] window the live
//! store serves, so the pipeline cannot tell the difference. Each stream file is one rkyv
//! archive read in place out of the mapped file. A stream call borrows the archived records as it
//! yields each item, so an item's embedding is a borrow of the mapped bytes rather than a copy;
//! nothing decodes ahead of use. The [`dump`] module writes these directories from a live
//! dataset and its embedding provider.
//!
//! # Acceptance
//!
//! [`OfflineDataset::open`] accepts a directory whole or not at all. The manifest parses at the
//! layout version this module implements, the writer's byte order matches the host's, every
//! stream file's length and whole-file digest equal the manifest's record, every archived root
//! validates byte by byte, and the invariants that reach across archived fields hold: the node
//! root's two columns agree on the row count, and every edge embedding position lands inside
//! its column. Each refusal names its stream through [`OpenDumpError`].
//!
//! Validation at open covers every structural claim a stream call later relies on, so
//! materializing records cannot fail structurally. What remains fallible afterwards is named by
//! [`OfflineDatasetError`]: a display payload that does not parse as its type, and a request
//! for rows the dump does not cover.

pub(crate) mod dump;
pub(crate) mod embedder;
pub(crate) mod format;
pub(crate) mod portable;
mod record;
#[cfg(test)]
mod tests;

use alloc::borrow::Cow;
use core::{error::Error, fmt};
use std::{collections::HashSet, fs, io};

use camino::Utf8Path;
use futures::{Stream, stream};
use smallvec::SmallVec;
use zerocopy::TryFromBytes as _;

use self::{
    format::{CanonicalCoverage, Manifest, StreamKind},
    record::{
        ArchivedEdgesRoot, ArchivedNodesRoot, CanonicalRecord, CardEmbeddingRecord, CardRecord,
        OntologyRecord, PayloadsRoot,
    },
};
use super::{
    CANONICAL_DIMENSIONS, Dataset, DatasetOrigin, Edge, Node, Ontology, TemporalAxes,
    auxiliary::{Icon, Legend, OwnedIcon, OwnedLegend},
    card::Card,
};
use crate::{
    file::region::{PageMap, machine::Architecture},
    identity::OntologyRowId,
    integrity::{Sha256, Sha256Digest, Update as _},
    math::AlignedVecN,
    postgres::id::{ArchivedEntityId, ArchivedOntologyTypeUuid},
};

/// Opening a dump directory failed.
///
/// Every variant that names a stream carries the [`StreamKind`] whose file refused, and the kind
/// displays as the file's name inside the directory, so the report points at one path.
#[derive(Debug)]
pub(crate) enum OpenDumpError {
    /// Reading the manifest failed.
    Manifest(io::Error),
    /// The manifest does not parse as a manifest this module speaks.
    Document(serde_json::Error),
    /// The dump was written on the other byte order.
    Machine {
        /// The byte order the dump's writer stamped.
        found: Architecture,
    },
    /// Opening or mapping a stream file failed.
    Io {
        /// The stream whose file refused.
        kind: StreamKind,
        /// The failing open.
        source: io::Error,
    },
    /// A stream file's length disagrees with the manifest.
    Length {
        /// The stream whose file refused.
        kind: StreamKind,
        /// The length the manifest records.
        expected: u64,
        /// The file's length on disk.
        actual: u64,
    },
    /// A stream file's whole bytes do not hash to the manifest digest.
    Digest {
        /// The stream whose file refused.
        kind: StreamKind,
        /// What the file's bytes actually hash to.
        actual: Sha256Digest,
    },
    /// A stream file's archived root refused byte-level validation.
    Archive {
        /// The stream whose file refused.
        kind: StreamKind,
        /// What refused the bytes.
        source: rancor::Error,
    },
    /// The node root's record and embedding columns disagree on the row count.
    Columns {
        /// The stream whose file refused.
        kind: StreamKind,
        /// Entries in the record column.
        records: u64,
        /// Entries in the embedding column.
        embeddings: u64,
    },
    /// An edge names an embedding position outside the packed column.
    EmbeddingPosition {
        /// The stream whose file refused.
        kind: StreamKind,
        /// The zero-based record naming the position.
        record: u64,
        /// The named position.
        position: u64,
        /// Entries in the embedding column.
        embeddings: u64,
    },
}

impl fmt::Display for OpenDumpError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Manifest(error) => write!(fmt, "the manifest failed to read: {error}"),
            Self::Document(error) => write!(fmt, "the manifest failed to deserialize: {error}"),
            Self::Machine { found } => write!(
                fmt,
                "the dump stores native floats and was written {found}, so open it on a {found} \
                 host or take a new dump here",
            ),
            Self::Io { kind, source } => write!(fmt, "{kind}: {source}"),
            Self::Length {
                kind,
                expected,
                actual,
            } => write!(
                fmt,
                "{kind}: the file holds {actual} bytes and the manifest records {expected}",
            ),
            Self::Digest { kind, actual } => write!(
                fmt,
                "{kind}: the file's bytes hash to {actual} instead of the manifest digest",
            ),
            Self::Archive { kind, source } => {
                write!(fmt, "{kind}: the archive refused validation: {source}")
            }
            Self::Columns {
                kind,
                records,
                embeddings,
            } => write!(
                fmt,
                "{kind}: {records} records beside {embeddings} embeddings, and the two columns \
                 must pair row by row",
            ),
            Self::EmbeddingPosition {
                kind,
                record,
                position,
                embeddings,
            } => write!(
                fmt,
                "{kind}: record {record} names embedding position {position} in a column of \
                 {embeddings}",
            ),
        }
    }
}

impl Error for OpenDumpError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Manifest(error) => Some(error),
            Self::Document(error) => Some(error),
            Self::Io { source, .. } => Some(source),
            Self::Archive { source, .. } => Some(source),
            Self::Machine { .. }
            | Self::Length { .. }
            | Self::Digest { .. }
            | Self::Columns { .. }
            | Self::EmbeddingPosition { .. } => None,
        }
    }
}

/// A dump stream failed after open.
#[derive(Debug)]
pub(crate) enum OfflineDatasetError {
    /// A stream file's archived root refused byte-level validation.
    ///
    /// The open validated the same bytes, so reaching this error means the file changed beneath
    /// the mapping after acceptance.
    Archive {
        /// The stream that refused.
        kind: StreamKind,
        /// What refused the bytes.
        source: rancor::Error,
    },
    /// A display payload does not parse as its payload type.
    ///
    /// The manifest digest already vouched for the bytes at open, so this error means the dump
    /// was written by a defective writer rather than damaged in transit.
    Payload {
        /// The stream that refused.
        kind: StreamKind,
        /// The zero-based record whose payload refused.
        record: u64,
    },
    /// Requested canonical embeddings lie outside the dump's coverage.
    ///
    /// A dump covers either the probe sample its recorded parameters derive or every node, and
    /// equal parameters replay the same sample. This error therefore means the fit's seed, anchor
    /// count, or comparison count differs from the dump's, or the fit requests nodes the dump
    /// never held, and the message names the dump's parameters so the caller can align.
    MissingCanonicals {
        /// The coverage the dump declared.
        coverage: CanonicalCoverage,
        /// Requested nodes the stream did not hold.
        missing: usize,
    },
    /// Requested type lists name nodes outside the dump's node stream.
    MissingNodeTypes {
        /// Requested nodes the stream did not hold.
        missing: usize,
    },
}

impl fmt::Display for OfflineDatasetError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Archive { kind, source } => {
                write!(fmt, "{kind}: the archive refused validation: {source}")
            }
            Self::Payload { kind, record } => write!(
                fmt,
                "{kind}: record {record}: the payload does not parse as its type",
            ),
            Self::MissingCanonicals { coverage, missing } => match coverage {
                CanonicalCoverage::Probe {
                    seed,
                    anchors,
                    comparisons,
                } => write!(
                    fmt,
                    "{missing} requested canonical embeddings lie outside the dump's probe \
                     coverage (seed {seed}, {anchors} anchors, {comparisons} comparisons): the \
                     fit's probe parameters must equal the ones the dump was taken with",
                ),
                CanonicalCoverage::All => write!(
                    fmt,
                    "{missing} requested canonical embeddings name nodes the dump does not hold",
                ),
            },
            Self::MissingNodeTypes { missing } => write!(
                fmt,
                "{missing} requested type lists name nodes outside the dump's node stream",
            ),
        }
    }
}

impl Error for OfflineDatasetError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Archive { source, .. } => Some(source),
            Self::Payload { .. }
            | Self::MissingCanonicals { .. }
            | Self::MissingNodeTypes { .. } => None,
        }
    }
}

/// Validates and borrows one stream file's archived root.
fn root<T>(map: &PageMap) -> Result<&T, rancor::Error>
where
    T: rkyv::Portable
        + for<'bytes> bytecheck::CheckBytes<rkyv::api::high::HighValidator<'bytes, rancor::Error>>,
{
    rkyv::access::<T, rancor::Error>(map.bytes())
}

/// Chains a fallible root access into one record iterator.
///
/// A successful access yields its records, and a failed one yields the failure as the only
/// item, so a stream opened over a refused root reports the refusal at its first poll.
fn results<I: Iterator, E>(access: Result<I, E>) -> impl Iterator<Item = Result<I::Item, E>> {
    let (records, error) = match access {
        Ok(records) => (Some(records), None),
        Err(error) => (None, Some(error)),
    };

    records
        .into_iter()
        .flatten()
        .map(Ok)
        .chain(error.into_iter().map(Err))
}

/// A [`Dataset`] over a dump directory.
///
/// [`open`](Self::open) validates the directory whole (see the [module documentation](self)),
/// after which every stream call serves records in place out of the mapped files. The dataset
/// holds a shared lock on each stream file for its lifetime.
///
/// Source identifiers come back exactly as dumped: [`ArchivedEntityId`] for nodes and edges,
/// [`ArchivedOntologyTypeUuid`] for ontology types. The live store's dataset serves the same
/// archived forms, so identity artifacts written from an offline fit translate rows the same way.
#[derive(Debug)]
pub(crate) struct OfflineDataset {
    manifest: Manifest,
    /// The digest of the manifest document this dump was opened from.
    manifest_digest: Sha256Digest,
    nodes: PageMap,
    edges: PageMap,
    ontology: PageMap,
    cards: PageMap,
    node_legends: PageMap,
    edge_legends: PageMap,
    ontology_icons: PageMap,
    canonical_embeddings: PageMap,
    card_embeddings: PageMap,
}

impl OfflineDataset {
    /// Opens and validates the dump directory at `directory`.
    ///
    /// # Errors
    ///
    /// Returns [`OpenDumpError::Manifest`] when reading the manifest fails,
    /// [`OpenDumpError::Document`] when the manifest does not parse at the implemented layout
    /// version, [`OpenDumpError::Machine`] when the dump was written on the other byte order,
    /// and for each stream file in turn: [`OpenDumpError::Io`] when opening or mapping it fails,
    /// [`OpenDumpError::Length`] when its length disagrees with the manifest,
    /// [`OpenDumpError::Digest`] when its bytes do not hash to the manifest digest, and
    /// [`OpenDumpError::Archive`] when its archived root refuses validation. The node root then
    /// refuses through [`OpenDumpError::Columns`] when its two columns disagree on the row
    /// count, and the edge root through [`OpenDumpError::EmbeddingPosition`] when a record names
    /// an embedding position outside the packed column.
    pub(crate) fn open(directory: &Utf8Path) -> Result<Self, OpenDumpError> {
        let document =
            fs::read(directory.join(Manifest::FILE_NAME)).map_err(OpenDumpError::Manifest)?;
        let manifest: Manifest =
            serde_json::from_slice(&document).map_err(OpenDumpError::Document)?;

        let mut hasher = Sha256::new();
        hasher.update(&document);
        let manifest_digest = hasher.finalize();

        if manifest.machine != Architecture::HOST {
            return Err(OpenDumpError::Machine {
                found: manifest.machine,
            });
        }

        let stream = |kind| open_stream(directory, &manifest, kind);

        let this = Self {
            nodes: stream(StreamKind::Nodes)?,
            edges: stream(StreamKind::Edges)?,
            ontology: stream(StreamKind::Ontology)?,
            cards: stream(StreamKind::Cards)?,
            node_legends: stream(StreamKind::NodeLegends)?,
            edge_legends: stream(StreamKind::EdgeLegends)?,
            ontology_icons: stream(StreamKind::OntologyIcons)?,
            canonical_embeddings: stream(StreamKind::CanonicalEmbeddings)?,
            card_embeddings: stream(StreamKind::CardEmbeddings)?,
            manifest,
            manifest_digest,
        };

        this.validate_roots()?;

        Ok(this)
    }

    /// Validates every archived root and the invariants that reach across archived fields.
    fn validate_roots(&self) -> Result<(), OpenDumpError> {
        let archive = |kind| move |source| OpenDumpError::Archive { kind, source };

        let nodes = root::<ArchivedNodesRoot>(&self.nodes).map_err(archive(StreamKind::Nodes))?;
        if nodes.records.len() != nodes.embeddings.len() {
            return Err(OpenDumpError::Columns {
                kind: StreamKind::Nodes,
                records: nodes.records.len() as u64,
                embeddings: nodes.embeddings.len() as u64,
            });
        }

        let edges = root::<ArchivedEdgesRoot>(&self.edges).map_err(archive(StreamKind::Edges))?;
        let embeddings = edges.embeddings.len() as u64;
        for (record, entry) in edges.records.iter().enumerate() {
            if let Some(position) = entry.embedding.as_ref()
                && position.to_native() >= embeddings
            {
                return Err(OpenDumpError::EmbeddingPosition {
                    kind: StreamKind::Edges,
                    record: record as u64,
                    position: position.to_native(),
                    embeddings,
                });
            }
        }

        root::<rkyv::Archived<Vec<OntologyRecord>>>(&self.ontology)
            .map_err(archive(StreamKind::Ontology))?;
        root::<rkyv::Archived<Vec<CardRecord>>>(&self.cards).map_err(archive(StreamKind::Cards))?;
        root::<rkyv::Archived<PayloadsRoot>>(&self.node_legends)
            .map_err(archive(StreamKind::NodeLegends))?;
        root::<rkyv::Archived<PayloadsRoot>>(&self.edge_legends)
            .map_err(archive(StreamKind::EdgeLegends))?;
        root::<rkyv::Archived<PayloadsRoot>>(&self.ontology_icons)
            .map_err(archive(StreamKind::OntologyIcons))?;
        root::<rkyv::Archived<Vec<CanonicalRecord>>>(&self.canonical_embeddings)
            .map_err(archive(StreamKind::CanonicalEmbeddings))?;
        root::<rkyv::Archived<Vec<CardEmbeddingRecord>>>(&self.card_embeddings)
            .map_err(archive(StreamKind::CardEmbeddings))?;

        Ok(())
    }

    /// Borrows the node root out of the mapped file.
    fn nodes_root(&self) -> Result<&ArchivedNodesRoot, OfflineDatasetError> {
        root(&self.nodes).map_err(|source| OfflineDatasetError::Archive {
            kind: StreamKind::Nodes,
            source,
        })
    }
}

/// Opens one payload stream, parsing each record as the payload type `P`.
fn payloads<'map, P>(
    map: &'map PageMap,
    kind: StreamKind,
    parse: fn(&[u8]) -> Option<&P>,
) -> impl Iterator<Item = Result<P::Owned, OfflineDatasetError>> + 'map
where
    P: ToOwned + ?Sized + 'map,
{
    let access = root::<rkyv::Archived<PayloadsRoot>>(map)
        .map_err(|source| OfflineDatasetError::Archive { kind, source });

    results(access.map(|entries| entries.iter().enumerate())).map(move |item| {
        let (record, payload) = item?;
        parse(payload.as_slice())
            .map(P::to_owned)
            .ok_or(OfflineDatasetError::Payload {
                kind,
                record: record as u64,
            })
    })
}

/// Opens one stream file and checks its length and digest against the manifest.
fn open_stream(
    directory: &Utf8Path,
    manifest: &Manifest,
    kind: StreamKind,
) -> Result<PageMap, OpenDumpError> {
    let map = PageMap::open(directory.join(kind.file_name()).as_std_path())
        .map_err(|source| OpenDumpError::Io { kind, source })?;

    let identity = manifest.streams.get(kind);
    if map.len() != identity.bytes {
        return Err(OpenDumpError::Length {
            kind,
            expected: identity.bytes,
            actual: map.len(),
        });
    }

    let mut hasher = Sha256::new();
    hasher.update(map.bytes());
    let actual = hasher.finalize();
    if actual != identity.sha256 {
        return Err(OpenDumpError::Digest { kind, actual });
    }

    Ok(map)
}

impl Dataset for OfflineDataset {
    type EdgeId = ArchivedEntityId;
    type Error = OfflineDatasetError;
    type NodeId = ArchivedEntityId;
    type OntologyId = ArchivedOntologyTypeUuid;

    type CanonicalNodeEmbeddingsStream<'this, I: Iterator<Item = Self::NodeId>> = impl Stream<
            Item = Result<
                (
                    ArchivedEntityId,
                    Cow<'this, AlignedVecN<CANONICAL_DIMENSIONS>>,
                ),
                OfflineDatasetError,
            >,
        > + use<'this, I>;
    type CardStream<'this> =
        impl Stream<Item = io::Result<(ArchivedOntologyTypeUuid, Card)>> + 'this;
    type EdgeAuxiliaryPayloadStream<'this> =
        impl Stream<Item = Result<OwnedLegend, OfflineDatasetError>> + 'this;
    type EdgeStream<'this> =
        impl Stream<Item = Result<Edge<'this, ArchivedEntityId>, OfflineDatasetError>> + 'this;
    type NodeAuxiliaryPayloadStream<'this> =
        impl Stream<Item = Result<OwnedLegend, OfflineDatasetError>> + 'this;
    type NodeStream<'this> =
        impl Stream<Item = Result<Node<'this, ArchivedEntityId>, OfflineDatasetError>> + 'this;
    type NodeTypesStream<'this, I: Iterator<Item = Self::NodeId>> = impl Stream<Item = Result<(ArchivedEntityId, SmallVec<OntologyRowId, 2>), OfflineDatasetError>>
        + use<'this, I>;
    type OntologyAuxiliaryPayloadStream<'this> =
        impl Stream<Item = Result<OwnedIcon, OfflineDatasetError>> + 'this;
    type OntologyStream<'this> =
        impl Stream<Item = Result<Ontology<ArchivedOntologyTypeUuid>, OfflineDatasetError>> + 'this;

    fn axes(&self) -> Option<TemporalAxes> {
        self.manifest.axes
    }

    fn origin(&self) -> DatasetOrigin {
        DatasetOrigin::Dump {
            manifest: self.manifest_digest,
        }
    }

    fn nodes(&self) -> Self::NodeStream<'_> {
        stream::iter(results(self.nodes_root().map(|nodes| {
            nodes
                .records
                .iter()
                .zip(nodes.embeddings.iter())
                .map(|(entry, embedding)| record::node(entry, embedding))
        })))
    }

    fn edges(&self) -> Self::EdgeStream<'_> {
        let access = root::<ArchivedEdgesRoot>(&self.edges)
            .map_err(|source| OfflineDatasetError::Archive {
                kind: StreamKind::Edges,
                source,
            })
            .map(|edges| {
                edges
                    .records
                    .iter()
                    .map(|entry| record::edge(entry, &edges.embeddings))
            });

        stream::iter(results(access))
    }

    fn ontology(&self) -> Self::OntologyStream<'_> {
        let access = root::<rkyv::Archived<Vec<OntologyRecord>>>(&self.ontology)
            .map_err(|source| OfflineDatasetError::Archive {
                kind: StreamKind::Ontology,
                source,
            })
            .map(|entries| entries.iter().map(record::ontology));

        stream::iter(results(access))
    }

    /// Opens a stream of canonical embeddings for the given nodes.
    ///
    /// The requests are treated as a set: yields follow the dump's stream order rather than
    /// request order, and a node requested twice yields once. When the scan ends with requests
    /// unserved, the stream closes with one [`OfflineDatasetError::MissingCanonicals`] carrying
    /// the dump's coverage parameters.
    fn canonical_node_embeddings<I: Iterator<Item = ArchivedEntityId>>(
        &self,
        nodes: I,
    ) -> Self::CanonicalNodeEmbeddingsStream<'_, I> {
        let mut requested: HashSet<ArchivedEntityId> = nodes.collect();
        let access = root::<rkyv::Archived<Vec<CanonicalRecord>>>(&self.canonical_embeddings)
            .map_err(|source| OfflineDatasetError::Archive {
                kind: StreamKind::CanonicalEmbeddings,
                source,
            })
            .map(|entries| entries.iter());
        let mut records = results(access);
        let coverage = self.manifest.coverage;

        stream::iter(core::iter::from_fn(move || {
            loop {
                match records.next() {
                    Some(Ok(entry)) => {
                        if requested.remove(&entry.id) {
                            return Some(Ok((entry.id, Cow::Borrowed(entry.embedding.aligned()))));
                        }
                    }
                    Some(Err(error)) => return Some(Err(error)),
                    None => {
                        if requested.is_empty() {
                            return None;
                        }

                        let missing = core::mem::take(&mut requested).len();
                        return Some(Err(OfflineDatasetError::MissingCanonicals {
                            coverage,
                            missing,
                        }));
                    }
                }
            }
        }))
    }

    /// Opens a stream of direct-type lists for the given nodes.
    ///
    /// Request handling matches [`canonical_node_embeddings`](Self::canonical_node_embeddings):
    /// the requests form a set, and yields follow the dump's stream order, so a node requested
    /// twice yields once. When the scan ends with requests the node stream never held, the
    /// stream closes with one [`OfflineDatasetError::MissingNodeTypes`]. The scan walks the
    /// record column alone and never touches the embedding column.
    fn node_types<I: Iterator<Item = ArchivedEntityId>>(
        &self,
        nodes: I,
    ) -> Self::NodeTypesStream<'_, I> {
        let mut requested: HashSet<ArchivedEntityId> = nodes.collect();
        let mut records = results(self.nodes_root().map(|nodes| nodes.records.iter()));

        stream::iter(core::iter::from_fn(move || {
            loop {
                match records.next() {
                    Some(Ok(entry)) => {
                        if requested.remove(&entry.id) {
                            return Some(Ok((
                                entry.id,
                                SmallVec::from_slice_copy(entry.ontology.as_slice()),
                            )));
                        }
                    }
                    Some(Err(error)) => return Some(Err(error)),
                    None => {
                        if requested.is_empty() {
                            return None;
                        }

                        let missing = core::mem::take(&mut requested).len();
                        return Some(Err(OfflineDatasetError::MissingNodeTypes { missing }));
                    }
                }
            }
        }))
    }

    /// Opens the stream of dumped cards, in ontology row order.
    ///
    /// The cards were finished at dump time, so this materializes rather than renders, and
    /// failures surface as [`io::Error`] values of kind `Other` per the trait's card-stream
    /// contract.
    fn render_cards(&self) -> Self::CardStream<'_> {
        let access = root::<rkyv::Archived<Vec<CardRecord>>>(&self.cards)
            .map_err(|source| OfflineDatasetError::Archive {
                kind: StreamKind::Cards,
                source,
            })
            .map(|entries| entries.iter().map(record::card));

        stream::iter(results(access).map(|item| item.map_err(io::Error::other)))
    }

    fn node_auxiliary_payload(&self) -> Self::NodeAuxiliaryPayloadStream<'_> {
        stream::iter(payloads(
            &self.node_legends,
            StreamKind::NodeLegends,
            |bytes| Legend::try_ref_from_bytes(bytes).ok(),
        ))
    }

    fn edge_auxiliary_payload(&self) -> Self::EdgeAuxiliaryPayloadStream<'_> {
        stream::iter(payloads(
            &self.edge_legends,
            StreamKind::EdgeLegends,
            |bytes| Legend::try_ref_from_bytes(bytes).ok(),
        ))
    }

    fn ontology_auxiliary_payload(&self) -> Self::OntologyAuxiliaryPayloadStream<'_> {
        stream::iter(payloads(
            &self.ontology_icons,
            StreamKind::OntologyIcons,
            |bytes| Icon::try_ref_from_bytes(bytes).ok(),
        ))
    }
}
