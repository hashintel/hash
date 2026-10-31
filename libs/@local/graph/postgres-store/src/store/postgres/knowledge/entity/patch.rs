use alloc::borrow::Cow;
use std::collections::{HashMap, HashSet};

use error_stack::{Report, ResultExt as _, ensure};
use futures::{StreamExt as _, TryStreamExt as _, stream};
use hash_graph_authorization::policies::{
    Authorized, MergePolicies, PolicyComponents, PolicySet, Request, RequestContext, ResourceId,
    action::ActionName,
};
use hash_graph_store::{
    entity::{
        EntityQueryPath, EntityValidationReport, PatchEntityParams, ValidateEntityComponents,
    },
    error::UpdateError,
    filter::{Filter, FilterExpression, Parameter},
    query::Read,
    subgraph::temporal_axes::{PinnedTemporalAxis, QueryTemporalAxes, VariableTemporalAxis},
};
use hash_graph_temporal_versioning::{
    ClosedTemporalBound, DecisionTime, LimitedTemporalBound, TemporalBound, Timestamp,
    TransactionTime,
};
use hash_graph_types::{
    knowledge::property::visitor::EntityVisitor as _, ontology::OntologyTypeProvider,
};
use hash_graph_validation::{EntityPreprocessor, Validate as _};
use hash_status::StatusCode;
use tokio_postgres::GenericClient as _;
use tracing::Instrument as _;
use type_system::{
    Valid, Validator as _,
    knowledge::{
        Entity, Property,
        entity::{
            EntityProvenance,
            id::{DraftId, EntityEditionId, EntityId, EntityRecordId},
            metadata::EntityTemporalMetadata,
            provenance::EntityEditionProvenance,
        },
        property::{
            PropertyObject, PropertyPatchOperation, PropertyPath, PropertyWithMetadata,
            metadata::{PropertyMetadata, PropertyObjectMetadata},
        },
    },
    ontology::{
        entity_type::{ClosedEntityType, ClosedMultiEntityType},
        id::VersionedUrl,
    },
    principal::actor::{ActorEntityUuid, ActorId},
    provenance::validation::{ProvenanceValidator, ProvenanceViolation},
};
use uuid::Uuid;

use super::{
    EntityEditionInsert, LockedEntityEdition, provenance::SqlEntityEditionProvenance,
    provenance_violations,
};
use crate::store::{
    AsClient, InTransaction, PostgresStore, error::EntityDoesNotExist, validation::StoreProvider,
};

enum DraftTransition {
    Update,
    Create,
    Publish,
}

pub(super) enum EntityPatchPreparation {
    Unchanged(Box<Entity>),
    Changed(Box<PreparedEntityPatch>),
}

pub(super) struct PreparedEntityPatch {
    pub changes: EntityPatchChanges,
    pub validation: EntityPatchValidation,
}

pub(super) struct EntityPatchChanges {
    entity: Entity,
    draft_transition: DraftTransition,
}

impl EntityPatchChanges {
    /// The changes, with the provenance of the new edition and of all its properties checked.
    ///
    /// The properties include those the patch carries over unchanged, so stored provenance that
    /// breaks a rule fails the patch.
    ///
    /// # Errors
    ///
    /// Returns every rule that the provenance breaks.
    pub(super) fn validate_provenance(
        self,
    ) -> Result<ValidEntityPatchChanges, Vec<ProvenanceViolation>> {
        let Self {
            entity,
            draft_transition,
        } = self;
        match (
            SqlEntityEditionProvenance::try_from(entity.metadata.provenance.edition.clone()),
            ProvenanceValidator.validate(entity.metadata.properties.clone()),
        ) {
            (Ok(provenance), Ok(property_metadata)) => Ok(ValidEntityPatchChanges {
                entity,
                provenance,
                property_metadata,
                draft_transition,
            }),
            (provenance, property_metadata) => Err(provenance_violations([
                provenance.err(),
                property_metadata.err(),
            ])),
        }
    }
}

/// [`EntityPatchChanges`] whose new edition can be written.
pub(super) struct ValidEntityPatchChanges {
    entity: Entity,
    provenance: SqlEntityEditionProvenance,
    property_metadata: Valid<PropertyObjectMetadata>,
    draft_transition: DraftTransition,
}

pub(super) struct EntityPatchValidation {
    entity_type: ClosedMultiEntityType,
    components: ValidateEntityComponents,
    report: EntityValidationReport,
}

impl EntityPatchValidation {
    /// Checks the persisted entity and combines validation results under its original input index.
    pub(super) async fn validate<C: AsClient>(
        mut self,
        provider: &StoreProvider<'_, PostgresStore<C, InTransaction>>,
        entity: &Entity,
        index: usize,
    ) -> Result<(), Report<UpdateError>> {
        let report = entity
            .validate(&self.entity_type, self.components, provider)
            .await;
        self.report.link = report.link;
        self.report.metadata.properties = report.property_metadata;
        ensure!(
            self.report.is_valid(),
            Report::new(UpdateError).attach_opaque(HashMap::from([(index, self.report)]))
        );
        Ok(())
    }

    /// The error for a patch whose provenance breaks the rules in `provenance`, with the property
    /// errors found so far under its original input index.
    pub(super) fn reject_provenance(
        mut self,
        provenance: Vec<ProvenanceViolation>,
        index: usize,
    ) -> Report<UpdateError> {
        self.report.metadata.provenance = provenance;
        Report::new(UpdateError).attach_opaque(HashMap::from([(index, self.report)]))
    }
}

/// Checks update and archival permissions before applying property or type changes.
fn authorize_entity_patch(
    params: &PatchEntityParams,
    previous_entity: &Entity,
    policy_components: &PolicyComponents,
) -> Result<PolicySet, Report<UpdateError>> {
    let policy_set = policy_components
        .build_policy_set([
            ActionName::Instantiate,
            ActionName::UpdateEntity,
            ActionName::ArchiveEntity,
        ])
        .change_context(UpdateError)?;

    if params.is_update() {
        let request = Request {
            actor: policy_components.actor_id(),
            action: ActionName::UpdateEntity,
            resource: &ResourceId::Entity(params.entity_id.entity_uuid),
            context: RequestContext::default(),
        };
        let authorized = policy_set
            .evaluate(&request, policy_components.context())
            .change_context(UpdateError)?;
        ensure!(
            matches!(authorized, Authorized::Always),
            Report::new(UpdateError)
                .attach_opaque(StatusCode::PermissionDenied)
                .attach("The actor does not have permission to update the entity")
                .attach(
                    previous_entity
                        .metadata
                        .entity_type_ids
                        .iter()
                        .map(VersionedUrl::to_string)
                        .collect::<Vec<_>>()
                        .join(", "),
                )
        );
    }

    if let Some(archive) = params.archived {
        let request = Request {
            actor: policy_components.actor_id(),
            action: ActionName::ArchiveEntity,
            resource: &ResourceId::Entity(params.entity_id.entity_uuid),
            context: RequestContext::default(),
        };
        let authorized = policy_set
            .evaluate(&request, policy_components.context())
            .change_context(UpdateError)?;
        ensure!(
            matches!(authorized, Authorized::Always),
            Report::new(UpdateError)
                .attach_opaque(StatusCode::PermissionDenied)
                .attach(format!(
                    "The actor does not have permission to {} the entity",
                    if archive { "archive" } else { "publish" },
                ))
        );
    }

    Ok(policy_set)
}

/// Checks permissions for changed types and their ancestors, returning whether the types change.
async fn authorize_entity_type_changes<C: AsClient>(
    previous: &HashSet<VersionedUrl>,
    requested: &HashSet<VersionedUrl>,
    policy_set: &PolicySet,
    policy_components: &PolicyComponents,
    provider: &StoreProvider<'_, PostgresStore<C, InTransaction>>,
) -> Result<bool, Report<UpdateError>> {
    if requested.is_empty() {
        return Ok(false);
    }
    let mut affected_types = HashSet::new();
    for entity_type_id in previous.symmetric_difference(requested) {
        let entity_type =
            OntologyTypeProvider::<ClosedEntityType>::provide_type(provider, entity_type_id)
                .await
                .change_context(UpdateError)?;
        if affected_types.insert(entity_type.id.clone()) {
            affected_types.extend(entity_type.all_of.iter().map(|parent| parent.id.clone()));
        }
    }
    let mut forbidden = Vec::new();
    for entity_type_id in &affected_types {
        let request = Request {
            actor: policy_components.actor_id(),
            action: ActionName::Instantiate,
            resource: &ResourceId::EntityType(Cow::Borrowed(entity_type_id.into())),
            context: RequestContext::default(),
        };
        let authorized = policy_set
            .evaluate(&request, policy_components.context())
            .change_context(UpdateError)?;
        if matches!(authorized, Authorized::Never) {
            forbidden.push(entity_type_id);
        }
    }
    ensure!(
        forbidden.is_empty(),
        Report::new(UpdateError)
            .attach_opaque(StatusCode::PermissionDenied)
            .attach("The actor does not have permission to instantiate one or more entity types")
            .attach(
                forbidden
                    .into_iter()
                    .map(ToString::to_string)
                    .collect::<Vec<_>>()
                    .join(", ")
            )
    );
    Ok(!affected_types.is_empty())
}

struct PreparedPatchProperties {
    properties: PropertyObject,
    metadata: PropertyObjectMetadata,
    validation: EntityPatchValidation,
}

impl<C: AsClient> PostgresStore<C, InTransaction> {
    /// Locks the temporal row to patch and loads the edition it references.
    #[tracing::instrument(level = "info", skip_all)]
    pub(super) async fn load_entity_for_patch(
        &self,
        entity_id: EntityId,
        transaction_time: Timestamp<TransactionTime>,
        decision_time: Timestamp<DecisionTime>,
    ) -> Result<(LockedEntityEdition, Entity), Report<UpdateError>> {
        let locked_row = self
            .lock_entity_edition(entity_id, transaction_time, decision_time)
            .await?
            .ok_or_else(|| {
                Report::new(EntityDoesNotExist)
                    .attach_opaque(StatusCode::NotFound)
                    .attach(entity_id)
                    .change_context(UpdateError)
            })?;
        let ClosedTemporalBound::Inclusive(locked_transaction_time) =
            *locked_row.transaction_time.start();
        let ClosedTemporalBound::Inclusive(locked_decision_time) =
            *locked_row.decision_time.start();
        let previous_entity = Read::<Entity>::read_one(
            self,
            &[Filter::Equal(
                FilterExpression::Path {
                    path: EntityQueryPath::EditionId,
                },
                FilterExpression::Parameter {
                    parameter: Parameter::Uuid(locked_row.entity_edition_id.into_uuid()),
                    convert: None,
                },
            )],
            Some(&QueryTemporalAxes::DecisionTime {
                pinned: PinnedTemporalAxis::new(locked_transaction_time),
                variable: VariableTemporalAxis::new(
                    TemporalBound::Inclusive(locked_decision_time),
                    LimitedTemporalBound::Inclusive(locked_decision_time),
                ),
            }),
            true,
        )
        .await
        .change_context(EntityDoesNotExist)
        .attach_opaque(entity_id)
        .change_context(UpdateError)?;

        Ok((locked_row, previous_entity))
    }

    /// Resolves write and validation policies for the previous edition and requested types.
    pub(super) async fn build_entity_patch_policy_components(
        &self,
        actor_id: ActorId,
        params: &PatchEntityParams,
        previous_entity: &Entity,
    ) -> Result<PolicyComponents, Report<UpdateError>> {
        PolicyComponents::builder(self, Some(actor_id))
            .with_entity_edition_id(previous_entity.metadata.record_id.edition_id)
            .with_entity_type_ids(&params.entity_type_ids)
            .with_actions(
                [
                    ActionName::Instantiate,
                    ActionName::UpdateEntity,
                    ActionName::ArchiveEntity,
                ],
                MergePolicies::No,
            )
            .with_actions(
                [
                    ActionName::ViewEntity,
                    ActionName::ViewEntityType,
                    ActionName::ViewPropertyType,
                    ActionName::ViewDataType,
                ],
                MergePolicies::Yes,
            )
            .await
            .change_context(UpdateError)
    }

    /// Applies and preprocesses a patch, distinguishing unchanged entities from changes to persist.
    #[tracing::instrument(level = "info", skip_all)]
    pub(super) async fn prepare_entity_patch(
        &self,
        actor_id: ActorId,
        params: PatchEntityParams,
        previous_entity: Entity,
        policy_components: &PolicyComponents,
        validator_provider: &StoreProvider<'_, Self>,
    ) -> Result<EntityPatchPreparation, Report<UpdateError>> {
        let policy_set = authorize_entity_patch(&params, &previous_entity, policy_components)?;
        let PatchEntityParams {
            entity_id,
            decision_time: _,
            entity_type_ids,
            properties,
            draft,
            archived,
            confidence,
            provenance,
        } = params;
        let types_changed = authorize_entity_type_changes(
            &previous_entity.metadata.entity_type_ids,
            &entity_type_ids,
            &policy_set,
            policy_components,
            validator_provider,
        )
        .await?;
        let was_draft = previous_entity
            .metadata
            .record_id
            .entity_id
            .draft_id
            .is_some();
        let draft = draft.unwrap_or(was_draft);
        let archived = archived.unwrap_or(previous_entity.metadata.archived);
        let properties = self
            .prepare_entity_patch_properties(
                previous_entity.properties.clone(),
                previous_entity.metadata.properties.clone(),
                properties,
                if entity_type_ids.is_empty() {
                    &previous_entity.metadata.entity_type_ids
                } else {
                    &entity_type_ids
                },
                draft,
                validator_provider,
            )
            .await?;
        if previous_entity
            .properties
            .diff(&properties.properties, &mut PropertyPath::default())
            .next()
            .is_none()
            && draft == was_draft
            && archived == previous_entity.metadata.archived
            && !types_changed
            && properties.metadata == previous_entity.metadata.properties
            && confidence == previous_entity.metadata.confidence
        {
            return Ok(EntityPatchPreparation::Unchanged(Box::new(previous_entity)));
        }
        let mut entity = previous_entity;
        entity.metadata.record_id.entity_id = entity_id;
        if !entity_type_ids.is_empty() {
            entity.metadata.entity_type_ids = entity_type_ids;
        }
        entity.properties = properties.properties;
        entity.metadata.properties = properties.metadata;
        entity.metadata.archived = archived;
        entity.metadata.confidence = confidence;
        entity.metadata.provenance.edition = EntityEditionProvenance {
            created_by_id: ActorEntityUuid::from(actor_id),
            archived_by_id: None,
            provided: provenance,
        };
        Ok(EntityPatchPreparation::Changed(Box::new(
            PreparedEntityPatch {
                changes: EntityPatchChanges {
                    entity,
                    draft_transition: match (was_draft, draft) {
                        (true, true) | (false, false) => DraftTransition::Update,
                        (false, true) => DraftTransition::Create,
                        (true, false) => DraftTransition::Publish,
                    },
                },
                validation: properties.validation,
            },
        )))
    }

    /// Applies property operations and preprocesses values against the resulting entity types.
    async fn prepare_entity_patch_properties(
        &self,
        properties: PropertyObject,
        metadata: PropertyObjectMetadata,
        patches: Vec<PropertyPatchOperation>,
        entity_type_ids: &HashSet<VersionedUrl>,
        draft: bool,
        provider: &StoreProvider<'_, Self>,
    ) -> Result<PreparedPatchProperties, Report<UpdateError>> {
        let mut properties = PropertyWithMetadata::from_parts(
            Property::Object(properties),
            Some(PropertyMetadata::Object(metadata)),
        )
        .change_context(UpdateError)?;
        properties.patch(patches).change_context(UpdateError)?;
        let entity_type = ClosedMultiEntityType::from_multi_type_closed_schema(
            stream::iter(entity_type_ids)
                .then(|entity_type_id| async {
                    OntologyTypeProvider::<ClosedEntityType>::provide_type(provider, entity_type_id)
                        .await
                        .map(|entity_type| (*entity_type).clone())
                })
                .try_collect::<Vec<ClosedEntityType>>()
                .await
                .change_context(UpdateError)?,
        )
        .change_context(UpdateError)?;
        let mut components = if draft {
            ValidateEntityComponents::draft()
        } else {
            ValidateEntityComponents::full()
        };
        components.link_validation = self.settings.validate_links;
        let PropertyWithMetadata::Object(mut object) = properties else {
            unreachable!("patching should not change the property type");
        };
        let mut report = EntityValidationReport::default();
        let mut preprocessor = EntityPreprocessor {
            components,
            convert_values: true,
        };
        if let Err(property_validation) = preprocessor
            .visit_object(&entity_type, &mut object, provider)
            .await
        {
            report.properties = property_validation.properties;
        }
        let (properties, metadata) = object.into_parts();
        Ok(PreparedPatchProperties {
            properties,
            metadata,
            validation: EntityPatchValidation {
                entity_type,
                components,
                report,
            },
        })
    }

    /// Writes a prepared edition and applies its draft or live history transition.
    #[tracing::instrument(level = "info", skip_all)]
    pub(super) async fn persist_entity_patch(
        &self,
        actor_id: ActorId,
        changes: ValidEntityPatchChanges,
        locked_row: LockedEntityEdition,
        transaction_time: Timestamp<TransactionTime>,
        decision_time: Timestamp<DecisionTime>,
    ) -> Result<Entity, Report<UpdateError>> {
        let ValidEntityPatchChanges {
            mut entity,
            provenance,
            property_metadata,
            draft_transition,
        } = changes;
        let entity_id = entity.metadata.record_id.entity_id;
        let edition_id = EntityEditionId::new(Uuid::now_v7());
        self.insert_entity_edition(EntityEditionInsert {
            edition_id,
            archived: entity.metadata.archived,
            entity_type_ids: &entity.metadata.entity_type_ids,
            properties: &entity.properties,
            property_metadata: &property_metadata,
            confidence: entity.metadata.confidence,
            provenance: &provenance,
        })
        .await
        .change_context(UpdateError)?;
        let (entity_id, temporal_versioning) = match draft_transition {
            DraftTransition::Update => (
                entity_id,
                self.update_temporal_metadata(
                    locked_row,
                    transaction_time,
                    decision_time,
                    edition_id,
                    false,
                )
                .await?,
            ),
            DraftTransition::Create => {
                self.create_entity_patch_draft(
                    entity_id,
                    edition_id,
                    transaction_time,
                    decision_time,
                )
                .await?
            }
            DraftTransition::Publish => {
                self.publish_entity_patch(
                    actor_id,
                    locked_row,
                    edition_id,
                    transaction_time,
                    decision_time,
                    &mut entity.metadata.provenance,
                )
                .await?
            }
        };
        entity.metadata.record_id = EntityRecordId {
            entity_id,
            edition_id,
        };
        entity.metadata.temporal_versioning = temporal_versioning;
        Ok(entity)
    }

    /// Starts a new draft history for an existing live entity.
    async fn create_entity_patch_draft(
        &self,
        mut entity_id: EntityId,
        edition_id: EntityEditionId,
        transaction_time: Timestamp<TransactionTime>,
        decision_time: Timestamp<DecisionTime>,
    ) -> Result<(EntityId, EntityTemporalMetadata), Report<UpdateError>> {
        let draft_id = DraftId::new(Uuid::now_v7());
        self.as_client()
            .query(
                "INSERT INTO entity_drafts (web_id, entity_uuid, draft_id) VALUES ($1, $2, $3);",
                &[&entity_id.web_id, &entity_id.entity_uuid, &draft_id],
            )
            .instrument(tracing::info_span!(
                "INSERT",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres"
            ))
            .await
            .change_context(UpdateError)?;
        entity_id.draft_id = Some(draft_id);
        let temporal_versioning = self
            .insert_temporal_metadata(entity_id, edition_id, transaction_time, decision_time)
            .await
            .change_context(UpdateError)?;
        Ok((entity_id, temporal_versioning))
    }

    /// Publishes the patched draft and archives any live edition it replaces.
    async fn publish_entity_patch(
        &self,
        actor_id: ActorId,
        locked_row: LockedEntityEdition,
        edition_id: EntityEditionId,
        transaction_time: Timestamp<TransactionTime>,
        decision_time: Timestamp<DecisionTime>,
        provenance: &mut EntityProvenance,
    ) -> Result<(EntityId, EntityTemporalMetadata), Report<UpdateError>> {
        let entity_id = EntityId {
            draft_id: None,
            ..locked_row.entity_id
        };
        if provenance
            .first_non_draft_created_at_decision_time
            .is_none()
        {
            self.record_entity_first_publication(
                entity_id,
                transaction_time,
                decision_time,
                provenance,
            )
            .await?;
        }
        if let Some(previous_live_entity) = self
            .lock_entity_edition(entity_id, transaction_time, decision_time)
            .await?
        {
            self.archive_entity(
                actor_id,
                previous_live_entity,
                transaction_time,
                decision_time,
            )
            .await?;
        }
        let temporal_versioning = self
            .update_temporal_metadata(
                locked_row,
                transaction_time,
                decision_time,
                edition_id,
                true,
            )
            .await?;
        Ok((entity_id, temporal_versioning))
    }

    /// Records when the entity first becomes live on both temporal axes.
    async fn record_entity_first_publication(
        &self,
        entity_id: EntityId,
        transaction_time: Timestamp<TransactionTime>,
        decision_time: Timestamp<DecisionTime>,
        provenance: &mut EntityProvenance,
    ) -> Result<(), Report<UpdateError>> {
        self.as_client()
            .query(
                "
                UPDATE entity_ids
                SET
                    provenance = provenance || jsonb_build_object(
                        'firstNonDraftCreatedAtTransactionTime', $1::TIMESTAMPTZ,
                        'firstNonDraftCreatedAtDecisionTime', $2::TIMESTAMPTZ
                    )
                WHERE web_id = $3 AND entity_uuid = $4;
                ",
                &[
                    &transaction_time,
                    &decision_time,
                    &entity_id.web_id,
                    &entity_id.entity_uuid,
                ],
            )
            .instrument(tracing::info_span!(
                "UPDATE",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres"
            ))
            .await
            .change_context(UpdateError)?;
        provenance.first_non_draft_created_at_transaction_time = Some(transaction_time);
        provenance.first_non_draft_created_at_decision_time = Some(decision_time);
        Ok(())
    }
}
