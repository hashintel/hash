//! The policy stage: classification and precedence resolution.

use alloc::collections::BTreeSet;

use super::{
    super::{
        error::StageError,
        role::{Role, write_staged},
    },
    Context,
};
use crate::{
    dataset::{CANONICAL_DIMENSIONS, OntologyRowId},
    file::{array::ArrayFile, repository::RepositoryFile, salt::metadata::PolicyEvidence},
    math::AlignedVecN,
    salt::policy::{Classification, artifact::write_policies, classifier::Classifier, resolve},
};

impl Context<'_> {
    /// Classifies every relation type's card, resolves the policy
    /// table, and stages the classifier beside it.
    ///
    /// The relation universe is the distinct ontology rows the edge
    /// stream carried; each indexes the staged card table, which is
    /// row-aligned with the type table. Every card exists, so every
    /// relation classifies; the Overlay fallback for unclassifiable
    /// relations stays reserved for datasets that cannot render a
    /// card.
    pub(super) fn stage_policy(
        &self,
        classifier: &Classifier,
        relations: &[OntologyRowId],
    ) -> Result<(RepositoryFile, RepositoryFile, PolicyEvidence), StageError> {
        let _span = tracing::info_span!("policy").entered();

        let classifier_file = write_staged(self.staging, Role::Classifier, |writer| {
            classifier.write_into(writer)
        })?;

        let cards = ArrayFile::open(self.staging.path_of(&Role::CardEmbeddings.file_name()))
            .map_err(StageError::MapCards)?;
        let embeddings: &[AlignedVecN<CANONICAL_DIMENSIONS>] = cards
            .vectors()
            .expect("the card matrix was sealed as f32 rows of the canonical width");

        let classifications = relations
            .iter()
            .map(|&relation| {
                classifier
                    .predict(&embeddings[relation.usize()])
                    .map(|prediction| (relation, Classification::Predicted(prediction)))
            })
            .collect::<Result<Vec<_>, _>>()?;

        let policies = resolve(
            &classifications,
            &self.config.policy.overrides,
            self.config.policy.admission,
        )?;

        let policy_file = write_staged(self.staging, Role::Policy, |writer| {
            write_policies(&policies, writer)
        })?;

        let overridden = self
            .config
            .policy
            .overrides
            .iter()
            .map(|record| record.relation.get())
            .collect::<BTreeSet<_>>()
            .len() as u64;

        Ok((
            classifier_file,
            policy_file,
            PolicyEvidence {
                relations: policies.len() as u64,
                overridden,
            },
        ))
    }
}
