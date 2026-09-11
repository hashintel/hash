//! The policy stage classifies relation cards and resolves the policy table.

use alloc::collections::BTreeSet;
use core::{error::Error, fmt};
use std::io;

use super::{Context, Staged};
use crate::{
    dataset::CANONICAL_DIMENSIONS,
    file::{
        repository::Artifact as _,
        salt::{artifact, metadata::PolicyEvidence},
    },
    identity::OntologyRowId,
    salt::{
        file::{OpenVectorError, VectorFile},
        policy::{
            CertifiedPolicies, Classification, ResolveError,
            classifier::{Classifier, PredictError},
            resolve,
        },
    },
};

/// The policy stage failed and staged no table.
///
/// One variant per way the stage refuses, so a policy failure attributes to this stage by
/// construction.
#[derive(Debug)]
pub(crate) enum PolicyError {
    /// The staged card table failed to map in.
    OpenCards(OpenVectorError),
    /// A relation card's classification overflowed.
    Classify(PredictError),
    /// The policy resolution rejected its input.
    Resolve(ResolveError),
    /// The resolved table failed to stage.
    Io(io::Error),
}

impl From<PredictError> for PolicyError {
    fn from(error: PredictError) -> Self {
        Self::Classify(error)
    }
}

impl From<ResolveError> for PolicyError {
    fn from(error: ResolveError) -> Self {
        Self::Resolve(error)
    }
}

impl From<io::Error> for PolicyError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

impl fmt::Display for PolicyError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::OpenCards(error) => write!(
                fmt,
                "the staged card-embedding matrix failed to map in: {error}"
            ),
            Self::Classify(error) => write!(fmt, "a relation card failed to classify: {error}"),
            Self::Resolve(error) => write!(fmt, "the policy resolution failed: {error}"),
            Self::Io(error) => write!(fmt, "the resolved policy table failed to stage: {error}"),
        }
    }
}

impl Error for PolicyError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::OpenCards(error) => Some(error),
            Self::Classify(error) => Some(error),
            Self::Resolve(error) => Some(error),
            Self::Io(error) => Some(error),
        }
    }
}

/// The policy stage, bound to the classifier and the relation universe.
pub(super) struct PolicyResolution<'fit> {
    /// The stage's staging, scratch, configuration, and device.
    context: &'fit Context,
    /// The run's relation-policy classifier.
    model: &'fit Classifier,
    /// The distinct ontology rows the edge stream carried.
    relations: &'fit [OntologyRowId],
}

impl<'fit> PolicyResolution<'fit> {
    /// Binds the stage to the classifier and the relation universe it resolves.
    pub(super) const fn new(
        context: &'fit Context,
        model: &'fit Classifier,
        relations: &'fit [OntologyRowId],
    ) -> Self {
        Self {
            context,
            model,
            relations,
        }
    }

    /// Classifies every relation type's card and resolves the policy table.
    ///
    /// The relation universe is the distinct ontology rows the edge stream carried. Each indexes
    /// the staged card table, which is row-aligned with the type table. Every card exists, so
    /// every relation classifies. The resolved table returns owned and certified beside its
    /// staged binding, so the relation stage consumes the certified value rather than the staged
    /// bytes.
    ///
    /// # Errors
    ///
    /// Returns [`PolicyError::OpenCards`] when the staged card table does not map as aligned
    /// rows of the canonical width, [`PolicyError::Classify`] when a card's classification
    /// overflows, [`PolicyError::Resolve`] when the policy resolution rejects its input, and an
    /// I/O error when the staged table does not write.
    #[tracing::instrument(name = "policy-resolution", skip_all)]
    pub(super) fn run(
        self,
    ) -> Result<Staged<CertifiedPolicies, artifact::Policy, PolicyEvidence>, PolicyError> {
        // The staged card table is row-aligned with the type table, so its rows index by
        // ontology row: the handle's id domain makes that claim once.
        let cards: VectorFile<OntologyRowId, CANONICAL_DIMENSIONS> = VectorFile::open(
            self.context
                .staging
                .path_of(&artifact::CardEmbeddings::NAME),
        )
        .map_err(PolicyError::OpenCards)?;

        let classifications: Vec<_> = self
            .relations
            .iter()
            .map(|&relation| {
                self.model
                    .predict(&cards[relation])
                    .map(|prediction| (relation, Classification::Predicted(prediction)))
            })
            .try_collect()?;

        let policies = resolve(
            &classifications,
            &self.context.config.policy.overrides,
            self.context.config.policy.admission,
        )?;

        let binding = self.context.staging.stage(artifact::Policy, &policies)?;

        let overridden = self
            .context
            .config
            .policy
            .overrides
            .iter()
            .map(|record| record.relation)
            .collect::<BTreeSet<_>>()
            .len() as u64;

        let evidence = PolicyEvidence {
            relations: policies.len() as u64,
            overridden,
        };
        tracing::info!(
            relations = evidence.relations,
            overridden = evidence.overridden,
            "staged the resolved policy table"
        );

        Ok(Staged {
            value: policies,
            binding,
            evidence,
        })
    }
}
