use alloc::borrow::Cow;
use std::collections::{HashMap, HashSet};

use error_stack::{Report, ResultExt as _, ensure};
use futures::{StreamExt as _, TryStreamExt as _, stream};
use hash_graph_authorization::policies::{
    Authorized, Context, MergePolicies, PolicyComponents, PolicySet, Request, RequestContext,
    ResourceId, action::ActionName,
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
use type_system::{
    knowledge::{
        Entity, Property,
        entity::{id::EntityId, provenance::EntityEditionProvenance},
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
};

use super::{LockedEntityEdition, batch::EntityPatchSet};
use crate::store::{
    AsClient, InTransaction, PostgresStore, error::EntityDoesNotExist,
    postgres::query::rows::EntityTemporalMetadataRow, validation::StoreProvider,
};

#[derive(Clone, Copy)]
pub(super) enum DraftTransition {
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
}

/// Checks permissions against the edition being replaced. An explicit archived flag requires
/// [`ActionName::ArchiveEntity`] permission even when it matches the existing value.
pub(super) fn authorize_entity_patch(
    actor_id: ActorId,
    params: &PatchEntityParams,
    previous_entity: &Entity,
    policy_set: &PolicySet,
    context: &Context,
) -> Result<(), Report<UpdateError>> {
    if params.is_update() {
        let request = Request {
            actor: Some(actor_id),
            action: ActionName::UpdateEntity,
            resource: &ResourceId::Entity(params.entity_id.entity_uuid),
            context: RequestContext::default(),
        };
        let authorized = policy_set
            .evaluate(&request, context)
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
            actor: Some(actor_id),
            action: ActionName::ArchiveEntity,
            resource: &ResourceId::Entity(params.entity_id.entity_uuid),
            context: RequestContext::default(),
        };
        let authorized = policy_set
            .evaluate(&request, context)
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

    Ok(())
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
        policy_set: &PolicySet,
        validator_provider: &StoreProvider<'_, Self>,
    ) -> Result<EntityPatchPreparation, Report<UpdateError>> {
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
            policy_set,
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

    /// Calculates the edition, draft, and temporal rows before writing the prepared patch.
    #[tracing::instrument(level = "info", skip_all)]
    pub(super) async fn persist_entity_patch(
        &self,
        actor_id: ActorId,
        changes: EntityPatchChanges,
        locked_row: LockedEntityEdition,
        transaction_time: Timestamp<TransactionTime>,
        decision_time: Timestamp<DecisionTime>,
    ) -> Result<Entity, Report<UpdateError>> {
        let EntityPatchChanges {
            mut entity,
            draft_transition,
        } = changes;
        let mut rows = vec![EntityTemporalMetadataRow::from(locked_row)];
        if matches!(draft_transition, DraftTransition::Publish) {
            let entity_id = EntityId {
                draft_id: None,
                ..entity.metadata.record_id.entity_id
            };
            if let Some(live) = self
                .lock_entity_edition(entity_id, transaction_time, decision_time)
                .await?
            {
                rows.push(EntityTemporalMetadataRow::from(live));
            }
        }
        let mut patches = EntityPatchSet::new(rows);
        patches.apply(
            actor_id,
            &mut entity,
            draft_transition,
            transaction_time,
            decision_time,
        );
        self.write_entity_patch_set(actor_id, &patches).await?;
        Ok(entity)
    }
}
