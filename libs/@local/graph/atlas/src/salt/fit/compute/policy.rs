//! The policy stage classifies relation cards and resolves the policy table.

use alloc::collections::BTreeSet;

use hashql_core::id::{Id as _, IdSlice};

use super::{Context, Staged, error::ComputeError};
use crate::{
    dataset::CANONICAL_DIMENSIONS,
    file::{
        array::ArrayFile,
        repository::Artifact as _,
        salt::{artifact, metadata::PolicyEvidence},
    },
    identity::OntologyRowId,
    math::AlignedVecN,
    salt::{
        policy::{Classification, artifact::write_policies, classifier::Classifier, resolve},
        relation::RelationPolicy,
    },
};

/// Classifies every relation type's card and resolves the policy table.
///
/// The relation universe is the distinct ontology rows the edge stream carried. Each indexes
/// the staged card table, which is row-aligned with the type table. Every card exists, so
/// every relation classifies. The resolved table returns owned beside its staged binding, so
/// the relation stage certifies the value this call resolved rather than the staged bytes.
///
/// # Errors
///
/// Returns [`ComputeError::OpenCards`] when the staged card table does not map,
/// [`ComputeError::Classify`] when a card's classification overflows,
/// [`ComputeError::Policy`] when the policy resolution rejects its input, and an I/O error when
/// the staged table does not write.
#[tracing::instrument(name = "policy", skip_all)]
pub(super) fn resolve_table(
    context: &Context,
    model: &Classifier,
    relations: &[OntologyRowId],
) -> Result<Staged<Vec<RelationPolicy>, artifact::Policy, PolicyEvidence>, ComputeError> {
    let cards = ArrayFile::open(context.staging.path_of(&artifact::CardEmbeddings::NAME))
        .map_err(ComputeError::OpenCards)?;
    // The staged card table is row-aligned with the type table, so
    // its rows index by ontology row. The pin makes that claim once.
    let embeddings: &IdSlice<OntologyRowId, AlignedVecN<CANONICAL_DIMENSIONS>> = IdSlice::from_raw(
        cards
            .vectors()
            .expect("the card matrix was sealed as f32 rows of the canonical width"),
    );

    let classifications = relations
        .iter()
        .map(|&relation| {
            model
                .predict(&embeddings[relation])
                .map(|prediction| (relation, Classification::Predicted(prediction)))
        })
        .collect::<Result<Vec<_>, _>>()?;

    let policies = resolve(
        &classifications,
        &context.config.policy.overrides,
        context.config.policy.admission,
    )?;

    let binding = context
        .staging
        .stage_with(artifact::Policy, |writer| write_policies(&policies, writer))?;

    let overridden = context
        .config
        .policy
        .overrides
        .iter()
        .map(|record| record.relation.as_u64())
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
