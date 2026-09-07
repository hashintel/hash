//! The dump directory's manifest and stream naming.
//!
//! A dump directory holds one `manifest.json` and one stream file per [`StreamKind`]. Each
//! stream file is one rkyv archive: the stream's records behind a root value at the file's
//! tail, so a mapped file serves reads in place with no decode pass ahead of use. The archived
//! record types live in [`record`](super::record), and which root each stream file carries is
//! that module's contract.
//!
//! The manifest is the acceptance boundary of a dump. The reader admits a directory only when
//! the manifest parses at the version this module implements, every stream file's whole bytes
//! hash to the digest recorded here, and the writer's byte order matches the host's. The writer
//! seals the manifest last, so an abandoned dump never leaves a directory a reader accepts.
//!
//! # Byte order
//!
//! The archives' structural fields - lengths, offsets, counts, row ids - are little-endian on
//! every host, by rkyv's format and by the id types' own construction. Embedding components and
//! confidence values stay in the writer's native byte order under the manifest's
//! [`Architecture`] stamp, so a reader on the other byte order refuses the directory at open
//! instead of serving reinterpreted floats.

use core::{error::Error, fmt};

use super::super::TemporalAxes;
use crate::{
    file::region::machine::Architecture, integrity::Sha256Digest,
    salt::embedding::EmbedderFingerprint,
};

/// The stream a dump file carries.
///
/// Each kind names one file inside the dump directory, and the kind displays as that file's
/// name, so an error naming a kind points at one path.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum StreamKind {
    /// The node stream, one record per node row.
    Nodes,
    /// The edge stream, one record per edge row.
    Edges,
    /// The ontology stream, one record per type row.
    Ontology,
    /// The card stream, one finished card per type row.
    Cards,
    /// The node display legends, one per node row.
    NodeLegends,
    /// The edge display legends, one per edge row.
    EdgeLegends,
    /// The ontology display icons, one per type row.
    OntologyIcons,
    /// Full canonical embeddings for the covered nodes.
    CanonicalEmbeddings,
    /// Card-text embeddings keyed by text hash.
    CardEmbeddings,
}

impl StreamKind {
    /// Every stream a dump directory holds.
    pub(crate) const ALL: [Self; 9] = [
        Self::Nodes,
        Self::Edges,
        Self::Ontology,
        Self::Cards,
        Self::NodeLegends,
        Self::EdgeLegends,
        Self::OntologyIcons,
        Self::CanonicalEmbeddings,
        Self::CardEmbeddings,
    ];

    /// Returns the stream's file name inside the dump directory.
    pub(crate) const fn file_name(self) -> &'static str {
        match self {
            Self::Nodes => "nodes.bin",
            Self::Edges => "edges.bin",
            Self::Ontology => "ontology.bin",
            Self::Cards => "cards.bin",
            Self::NodeLegends => "node-legends.bin",
            Self::EdgeLegends => "edge-legends.bin",
            Self::OntologyIcons => "ontology-icons.bin",
            Self::CanonicalEmbeddings => "canonical-embeddings.bin",
            Self::CardEmbeddings => "card-embeddings.bin",
        }
    }
}

impl fmt::Display for StreamKind {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str(self.file_name())
    }
}

/// A manifest names a layout this module does not implement.
///
/// [`TryFrom`] returns this error for every integer other than the one [`Version`] implements,
/// so a dump written by a different layout refuses at the manifest parse, before any stream
/// file is read.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct UnknownVersion(pub u32);

impl fmt::Display for UnknownVersion {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            fmt,
            "the manifest names layout version {}, and this reader implements version {} alone: \
             take a new dump with a writer of this version",
            self.0,
            u32::from(Version::V1),
        )
    }
}

impl Error for UnknownVersion {}

/// A dump layout version this module implements.
///
/// The manifest stores the version as its integer, parsing admits exactly the implemented
/// value, and every other integer refuses through [`UnknownVersion`]. Increment the version on
/// any layout change.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(into = "u32", try_from = "u32")]
pub(crate) enum Version {
    V1 = 1,
}

impl From<Version> for u32 {
    fn from(version: Version) -> Self {
        version as Self
    }
}

impl TryFrom<u32> for Version {
    type Error = UnknownVersion;

    fn try_from(value: u32) -> Result<Self, Self::Error> {
        match value {
            1 => Ok(Self::V1),
            other => Err(UnknownVersion(other)),
        }
    }
}

/// Which nodes the dump's canonical-embedding stream covers.
///
/// The admission probe's canonical fetch is the only corpus-scale consumer of full canonical
/// embeddings, and its sample is a pure function of the seed, the anchor count, the comparison
/// count, and the row count. A dump therefore covers either exactly that sample or every node,
/// and the manifest records which, so an offline fit whose probe parameters differ from the
/// dump's fails with the mismatch named instead of a bare missing-row count.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(deny_unknown_fields, rename_all = "kebab-case")]
pub(crate) enum CanonicalCoverage {
    /// The probe sample derived from these parameters over the dump's node rows.
    Probe {
        /// The fit seed the sample derives from.
        seed: u64,
        /// The probe's anchor count.
        anchors: u64,
        /// The probe's comparison count.
        comparisons: u64,
    },
    /// Every node row.
    All,
}

/// One stream file's identity in the manifest.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct FileManifest {
    /// The file's whole length in bytes.
    pub bytes: u64,
    /// The SHA-256 of the file's whole bytes.
    pub sha256: Sha256Digest,
}

/// The per-stream file identities, one field per [`StreamKind`].
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(deny_unknown_fields, rename_all = "kebab-case")]
pub(crate) struct StreamManifests {
    pub nodes: FileManifest,
    pub edges: FileManifest,
    pub ontology: FileManifest,
    pub cards: FileManifest,
    pub node_legends: FileManifest,
    pub edge_legends: FileManifest,
    pub ontology_icons: FileManifest,
    pub canonical_embeddings: FileManifest,
    pub card_embeddings: FileManifest,
}

impl StreamManifests {
    /// Returns the named stream's file identity.
    pub(crate) const fn get(&self, kind: StreamKind) -> FileManifest {
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

/// The dump directory's manifest, sealed last.
///
/// The manifest binds the directory whole: the layout version, the writer's byte order, and
/// every stream file's length and content digest. A reader that accepts the manifest and its
/// digests holds files whose archived roots were written by this module's writer, so a torn or
/// tampered file refuses at open. A directory without a manifest is an abandoned write.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Manifest {
    /// The layout version the directory was written under.
    pub version: Version,
    /// The byte order of the machine that wrote the dump.
    ///
    /// Embedding components and confidence values store native floats, so the reader compares
    /// this stamp against its own byte order at open.
    pub machine: Architecture,
    /// The bitemporal point the dumped dataset observed, when its source had temporal axes.
    pub axes: Option<TemporalAxes>,
    /// The embedding contract that minted every embedding in the dump.
    pub embedder: EmbedderFingerprint,
    /// Which nodes the canonical-embedding stream covers.
    pub coverage: CanonicalCoverage,
    /// The per-stream file identities.
    pub streams: StreamManifests,
}

impl Manifest {
    /// The manifest's file name inside the dump directory.
    pub(crate) const FILE_NAME: &'static str = "manifest.json";
}
