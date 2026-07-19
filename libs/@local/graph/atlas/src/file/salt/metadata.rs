//! The SALT generation metadata document.
//!
//! The schema is version 0 and **mutable**: change it freely to fit what
//! the pipeline needs and increment the repository version when you do;
//! no migration or compatibility machinery exists on purpose until it
//! stabilizes.

use core::num::NonZero;

use crate::{
    dataset::TemporalAxes,
    file::generation::GenerationId,
    salt::{
        CardEmbeddingStats, EmbedderFingerprint, FitConfig, FitConfigDef, NormSpotCheck,
        RecallSpotCheck,
    },
};

/// Metadata describing one published SALT generation: the input snapshot,
/// the declared inputs it ran under, and the evidence its files were
/// admitted under.
///
/// Each section's types live with the stage that produces its values;
/// this document assembles them.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct SaltMetadata {
    pub snapshot: Snapshot,
    pub reproducibility: Reproducibility,
    pub placement: Placement,
    pub evidence: Evidence,
}

/// How the generation's canonical coordinates were produced.
///
/// The identity keeps a baseline generation distinguishable from a
/// trained one wherever the coordinates are consumed.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum Placement {
    /// Every row takes its assigned landmark's layout coordinate: the
    /// 1-NN placement the landmark assignment already encodes.
    LandmarkBaseline,
}

/// The frozen view of the graph one fit ran over.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct Snapshot {
    /// The bitemporal point the dataset observed. Absent for sources
    /// without temporal axes, such as synthetic fixtures.
    pub axes: Option<TemporalAxes>,
    /// Nodes the dataset streamed: the row count of every node-aligned
    /// artifact.
    pub nodes: u64,
    /// Edges the dataset streamed.
    pub edges: u64,
    /// Ontology types the dataset streamed: the row count of the
    /// card-embedding artifacts.
    pub ontology_types: u64,
}

/// The declared inputs one fit ran under.
///
/// The record identifies the run; replaying it re-derives
/// deterministic stages bit-for-bit, and the pipeline as a whole best
/// effort.
#[derive(Debug, Copy, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct Reproducibility {
    /// Every setting the fit ran under, the seed included: a replay
    /// takes its configuration from this echo, not from the defaults
    /// compiled into the replaying binary. Validated fields
    /// deserialize through their validating constructors, so a
    /// tampered echo refuses to parse.
    #[serde(with = "FitConfigDef")]
    pub config: FitConfig,
    /// The embedding contract the card embeddings were produced under.
    pub embedder: EmbedderFingerprint,
    /// The generation whose artifacts seeded reuse - card embeddings
    /// and landmark retention - when one was offered.
    pub prior: Option<GenerationId>,
}

/// The admission evidence of one published generation.
///
/// Every check recorded here passed: a failing check aborts the fit, and
/// an aborted fit publishes nothing.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct Evidence {
    /// How the card-embedding rows were obtained: reused from the prior
    /// generation or freshly embedded.
    pub cards: CardEmbeddingStats,
    /// The representation-contract spot check over the written node
    /// matrix.
    pub norm: NormSpotCheck,
    /// The exact-recall spot check over the neighbour backend.
    pub recall: RecallSpotCheck,
    /// The landmark stage's scale record.
    pub landmarks: LandmarkEvidence,
}

/// Scale record of the landmark stage.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct LandmarkEvidence {
    /// Landmarks selected: the `M` of the published skeleton.
    pub selected: u32,
    /// Selected landmarks that were landmarks of the prior generation.
    pub retained: u32,
    /// Layout optimization epochs run over the quotient graph.
    pub layout_epochs: NonZero<u32>,
}
