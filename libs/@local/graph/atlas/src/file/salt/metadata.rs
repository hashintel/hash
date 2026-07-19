//! The SALT generation metadata document.
//!
//! The schema is version 0 and **mutable**: change it freely to fit what
//! the pipeline needs and increment the repository version when you do;
//! no migration or compatibility machinery exists on purpose until it
//! stabilizes.

use core::num::NonZero;

use crate::{
    dataset::postgres::TemporalAxes,
    salt::{EmbedderFingerprint, NormSpotCheck, RecallSpotCheck},
};

/// Metadata describing one published SALT generation: the input snapshot,
/// the declared inputs that reproduce it, and the evidence its files were
/// admitted under.
///
/// Each section's types live with the stage that produces its values;
/// this document assembles them.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct SaltMetadata {
    pub snapshot: Snapshot,
    pub reproducibility: Reproducibility,
    pub evidence: Evidence,
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

/// The declared inputs that reproduce a fit over its snapshot.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct Reproducibility {
    /// The master seed every stage generator derives from.
    pub master_seed: u64,
    /// The embedding contract the card embeddings were produced under.
    pub embedder: EmbedderFingerprint,
}

/// The admission evidence of one published generation.
///
/// Every check recorded here passed: a failing check aborts the fit, and
/// an aborted fit publishes nothing.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct Evidence {
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
