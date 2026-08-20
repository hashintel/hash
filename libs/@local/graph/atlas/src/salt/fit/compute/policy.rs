//! The policy stage classifies relation cards and resolves the policy table.

use alloc::collections::BTreeSet;

use super::{Context, Staged, error::ComputeError};
use crate::{
    dataset::CANONICAL_DIMENSIONS,
    file::{
        repository::Artifact as _,
        salt::{artifact, metadata::PolicyEvidence},
    },
    identity::OntologyRowId,
    salt::{
        file::VectorFile,
        policy::{Classification, artifact::write_policies, classifier::Classifier, resolve},
        relation::RelationPolicy,
    },
};

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
    /// every relation classifies. The resolved table returns owned beside its staged binding, so
    /// the relation stage certifies the value this call resolved rather than the staged bytes.
    ///
    /// # Errors
    ///
    /// Returns [`ComputeError::OpenCards`] when the staged card table does not map as aligned
    /// rows of the canonical width, [`ComputeError::Classify`] when a card's classification
    /// overflows,
    /// [`ComputeError::Policy`] when the policy resolution rejects its input, and an I/O error
    /// when the staged table does not write.
    #[tracing::instrument(skip_all)]
    pub(super) fn run(
        self,
    ) -> Result<Staged<Vec<RelationPolicy>, artifact::Policy, PolicyEvidence>, ComputeError> {
        // The staged card table is row-aligned with the type table, so its rows index by
        // ontology row: the handle's id domain makes that claim once.
        let cards: VectorFile<OntologyRowId, CANONICAL_DIMENSIONS> = VectorFile::open(
            self.context
                .staging
                .path_of(&artifact::CardEmbeddings::NAME),
        )
        .map_err(ComputeError::OpenCards)?;

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

        let binding = self
            .context
            .staging
            .stage_with(artifact::Policy, |writer| write_policies(&policies, writer))?;

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
