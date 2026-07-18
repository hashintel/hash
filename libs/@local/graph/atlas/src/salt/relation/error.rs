//! Relation-index construction errors.

use core::{error::Error, fmt};

use crate::dataset::{EdgeRowId, NodeRowId, OntologyRowId};

/// An option, policy, or instance violated a relation-index contract.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum RelationIndexError {
    /// The shared Coincident coefficient lies outside `0.0..`.
    CoincidentCoefficient { value: f32 },
    /// The force-pruning threshold lies outside `0.0..`.
    PruningThreshold { value: f32 },
    /// A protection floor lies outside `0.0..=1.0`, or the ordinary floor
    /// exceeds the hard floor.
    ProtectionFloors { hard: f32, ordinary: f32 },
    /// An admission threshold lies outside `0.0..`, or the hard threshold
    /// exceeds the ordinary threshold.
    AdmissionThresholds { hard: f32, ordinary: f32 },
    /// The policies are not strictly ascending by relation row.
    PolicyOrder {
        position: usize,
        relation: OntologyRowId,
    },
    /// A policy stores a probability, applicability, or strength outside
    /// its domain.
    PolicyDomain { relation: OntologyRowId },
    /// An instance references a relation without a policy.
    MissingPolicy {
        edge: EdgeRowId,
        relation: OntologyRowId,
    },
    /// An instance endpoint lies outside the node-row domain.
    EndpointOutOfBounds {
        edge: EdgeRowId,
        endpoint: NodeRowId,
        rows: usize,
    },
    /// An instance confidence score lies outside `0.0..=1.0`.
    ConfidenceDomain { edge: EdgeRowId, value: f32 },
    /// One `(edge, relation)` instance occurs twice.
    DuplicateInstance {
        edge: EdgeRowId,
        relation: OntologyRowId,
    },
}

impl fmt::Display for RelationIndexError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::CoincidentCoefficient { value } => write!(
                fmt,
                "the Coincident coefficient {value} is not finite and non-negative",
            ),
            Self::PruningThreshold { value } => write!(
                fmt,
                "the force-pruning threshold {value} is not finite and non-negative",
            ),
            Self::ProtectionFloors { hard, ordinary } => write!(
                fmt,
                "protection floors require 0 <= ordinary <= hard <= 1; the hard floor is {hard} \
                 and the ordinary floor {ordinary}",
            ),
            Self::AdmissionThresholds { hard, ordinary } => write!(
                fmt,
                "admission thresholds require 0 <= hard <= ordinary; the hard threshold is {hard} \
                 and the ordinary threshold {ordinary}",
            ),
            Self::PolicyOrder { position, relation } => write!(
                fmt,
                "policy position {position} stores relation row {relation}, breaking the strictly \
                 ascending order",
                relation = relation.get(),
            ),
            Self::PolicyDomain { relation } => write!(
                fmt,
                "the policy of relation row {relation} stores a value outside its domain",
                relation = relation.get(),
            ),
            Self::MissingPolicy { edge, relation } => write!(
                fmt,
                "edge row {edge} references relation row {relation}, which has no policy",
                edge = edge.get(),
                relation = relation.get(),
            ),
            Self::EndpointOutOfBounds {
                edge,
                endpoint,
                rows,
            } => write!(
                fmt,
                "edge row {edge} references node row {endpoint} outside the {rows}-row domain",
                edge = edge.get(),
                endpoint = endpoint.get(),
            ),
            Self::ConfidenceDomain { edge, value } => write!(
                fmt,
                "edge row {edge} stores the confidence score {value} outside 0..=1",
                edge = edge.get(),
            ),
            Self::DuplicateInstance { edge, relation } => write!(
                fmt,
                "edge row {edge} occurs twice under relation row {relation}",
                edge = edge.get(),
                relation = relation.get(),
            ),
        }
    }
}

impl Error for RelationIndexError {}
