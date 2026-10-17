use alloc::borrow::Cow;
use core::mem;
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
};
use hash_graph_temporal_versioning::{
    ClosedTemporalBound, DecisionTime, TemporalTagged as _, Timestamp, TransactionTime,
};
use hash_graph_types::{
    knowledge::property::visitor::EntityVisitor as _, ontology::OntologyTypeProvider,
};
use hash_graph_validation::{EntityPreprocessor, Validate as _};
use hash_status::StatusCode;
use tokio_postgres::{GenericClient as _, Row, error::SqlState};
use tracing::Instrument as _;
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

use super::LockedEntityEdition;
use crate::store::{
    AsClient, InTransaction, PostgresStore,
    error::{EntityDoesNotExist, RaceConditionOnUpdate},
    postgres::{
        crud::QueryRecordDecode as _,
        query::{Expression, PostgresRecord as _, SelectCompiler},
    },
    validation::StoreProvider,
};

/// Chooses the patch's decision time at database precision, defaulting to the transaction time.
pub(super) fn patch_decision_time(
    params: &PatchEntityParams,
    transaction_time: Timestamp<TransactionTime>,
) -> Timestamp<DecisionTime> {
    params
        .decision_time
        .map_or_else(|| transaction_time.cast(), Timestamp::remove_nanosecond)
}

/// Groups consecutive patches for distinct underlying entities, preserving input order.
pub(super) fn group_entity_patch_batches(
    params: Vec<PatchEntityParams>,
) -> Vec<Vec<PatchEntityParams>> {
    let mut batches = Vec::new();
    let mut batch = Vec::new();
    let mut entity_ids = HashSet::new();
    for params in params {
        let entity_id = (params.entity_id.web_id, params.entity_id.entity_uuid);
        if !entity_ids.insert(entity_id) {
            batches.push(mem::take(&mut batch));
            entity_ids.clear();
            entity_ids.insert(entity_id);
        }
        batch.push(params);
    }
    if !batch.is_empty() {
        batches.push(batch);
    }
    batches
}

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

pub(super) struct EntityPatchWrite {
    pub index: usize,
    pub locked_row: LockedEntityEdition,
    pub decision_time: Timestamp<DecisionTime>,
    pub draft_transition: DraftTransition,
}

pub(super) struct EntityPatchValidation {
    entity_type: ClosedMultiEntityType,
    components: ValidateEntityComponents,
    report: EntityValidationReport,
}

impl EntityPatchValidation {
    /// Checks the prepared entity and combines validation results under its original input index.
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

/// Restores patch order and requires exactly one locked temporal row per target.
fn decode_locked_entity_editions(
    rows: &[Row],
    params: &[PatchEntityParams],
) -> Result<Vec<LockedEntityEdition>, Report<UpdateError>> {
    let mut locked_rows = HashMap::with_capacity(rows.len());
    for row in rows {
        let entity_id = EntityId {
            web_id: row.get(0),
            entity_uuid: row.get(1),
            draft_id: row.get(2),
        };
        let locked_row = LockedEntityEdition {
            entity_id,
            entity_edition_id: row.get(3),
            transaction_time: row.get(4),
            decision_time: row.get(5),
        };
        ensure!(
            locked_rows.insert(entity_id, locked_row).is_none(),
            Report::new(UpdateError)
                .attach("Multiple temporal rows match the entity patch")
                .attach(entity_id)
        );
    }
    params
        .iter()
        .map(|params| {
            locked_rows.remove(&params.entity_id).ok_or_else(|| {
                Report::new(EntityDoesNotExist)
                    .attach_opaque(StatusCode::NotFound)
                    .attach(params.entity_id)
                    .change_context(UpdateError)
            })
        })
        .collect()
}

impl<C: AsClient> PostgresStore<C, InTransaction> {
    /// Locks each target's temporal row before the group's editions are read or changed.
    #[tracing::instrument(level = "info", skip_all)]
    pub(super) async fn lock_entity_editions_for_patch(
        &self,
        params: &[PatchEntityParams],
        transaction_time: Timestamp<TransactionTime>,
    ) -> Result<Vec<LockedEntityEdition>, Report<UpdateError>> {
        let web_ids = params
            .iter()
            .map(|params| params.entity_id.web_id)
            .collect::<Vec<_>>();
        let entity_uuids = params
            .iter()
            .map(|params| params.entity_id.entity_uuid)
            .collect::<Vec<_>>();
        let draft_ids = params
            .iter()
            .map(|params| params.entity_id.draft_id)
            .collect::<Vec<_>>();
        let decision_times = params
            .iter()
            .map(|params| patch_decision_time(params, transaction_time))
            .collect::<Vec<_>>();
        let rows = self
            .as_client()
            .query(
                "
                SELECT
                    metadata.web_id,
                    metadata.entity_uuid,
                    metadata.draft_id,
                    metadata.entity_edition_id,
                    metadata.transaction_time,
                    metadata.decision_time
                FROM
                    unnest($1::UUID [], $2::UUID [], $3::UUID [], $4::TIMESTAMPTZ [])
                    WITH ORDINALITY
                        AS targets (
                            web_id, entity_uuid, draft_id, decision_time, position
                        )
                INNER JOIN entity_temporal_metadata AS metadata
                    ON targets.web_id = metadata.web_id
                    AND targets.entity_uuid = metadata.entity_uuid
                    AND metadata.draft_id IS NOT DISTINCT FROM targets.draft_id
                    AND metadata.transaction_time @> $5::TIMESTAMPTZ
                    AND metadata.decision_time @> targets.decision_time
                ORDER BY targets.position
                FOR NO KEY UPDATE OF metadata NOWAIT;
                ",
                &[
                    &web_ids,
                    &entity_uuids,
                    &draft_ids,
                    &decision_times,
                    &transaction_time,
                ],
            )
            .instrument(tracing::info_span!(
                "SELECT",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres"
            ))
            .await
            .map_err(|error| match error.code() {
                Some(&SqlState::LOCK_NOT_AVAILABLE) => Report::new(RaceConditionOnUpdate)
                    .attach_opaque(
                        params
                            .iter()
                            .map(|params| params.entity_id)
                            .collect::<Vec<_>>(),
                    )
                    .change_context(UpdateError),
                _ => Report::new(error).change_context(UpdateError),
            })?;

        decode_locked_entity_editions(&rows, params)
    }

    /// Loads the locked editions at their individual temporal bounds and restores input order.
    #[tracing::instrument(level = "info", skip_all)]
    pub(super) async fn read_entities_for_patch(
        &self,
        locked_rows: &[LockedEntityEdition],
    ) -> Result<Vec<Entity>, Report<UpdateError>> {
        let mut compiler = SelectCompiler::<Entity>::new(None, true);
        let paths = Entity::parameters();
        let indices = Entity::compile(&mut compiler, &paths);
        let edition_column = compiler.compile_path_column(&EntityQueryPath::EditionId);
        let transaction_column = compiler.compile_path_column(&EntityQueryPath::TransactionTime);
        let decision_column = compiler.compile_path_column(&EntityQueryPath::DecisionTime);
        let mut conditions = Vec::with_capacity(locked_rows.len());
        for locked_row in locked_rows {
            let ClosedTemporalBound::Inclusive(transaction_time) =
                *locked_row.transaction_time.start();
            let ClosedTemporalBound::Inclusive(decision_time) = *locked_row.decision_time.start();
            let edition = compiler.add_parameter(&locked_row.entity_edition_id);
            let transaction = compiler.add_owned_parameter(Box::new(transaction_time));
            let decision = compiler.add_owned_parameter(Box::new(decision_time));
            conditions.push(Expression::all(vec![
                edition_column.clone().equal(edition),
                transaction_column
                    .clone()
                    .time_interval_contains_timestamp(transaction),
                decision_column
                    .clone()
                    .time_interval_contains_timestamp(decision),
            ]));
        }
        compiler.add_condition(Expression::any(conditions));
        let (statement, parameters) = compiler.compile();
        let rows = self
            .as_client()
            .query_raw(&statement, parameters)
            .instrument(tracing::info_span!(
                "SELECT",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
                db.query.text = %statement,
            ))
            .await
            .change_context(EntityDoesNotExist)
            .change_context(UpdateError)?
            .map_ok(|row| Entity::decode(&row, &indices))
            .try_collect::<Vec<_>>()
            .await
            .change_context(EntityDoesNotExist)
            .change_context(UpdateError)?;
        let mut entities = HashMap::with_capacity(rows.len());
        for entity in rows {
            let record_id = entity.metadata.record_id;
            ensure!(
                entities.insert(record_id.entity_id, entity).is_none(),
                Report::new(EntityDoesNotExist)
                    .attach(record_id.entity_id)
                    .change_context(UpdateError)
            );
        }
        locked_rows
            .iter()
            .map(|locked_row| {
                entities.remove(&locked_row.entity_id).ok_or_else(|| {
                    Report::new(EntityDoesNotExist)
                        .attach(locked_row.entity_id)
                        .change_context(UpdateError)
                })
            })
            .collect()
    }

    /// Resolves write and validation policies for the group's editions and requested types.
    pub(super) async fn build_entity_patch_policy_components(
        &self,
        actor_id: ActorId,
        params: &[PatchEntityParams],
        previous_entities: &[Entity],
    ) -> Result<PolicyComponents, Report<UpdateError>> {
        PolicyComponents::builder(self, Some(actor_id))
            .with_entity_edition_ids(
                previous_entities
                    .iter()
                    .map(|entity| entity.metadata.record_id.edition_id),
            )
            .with_entity_type_ids(params.iter().flat_map(|params| &params.entity_type_ids))
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

    /// Prepares and validates patches in order, flushing bulk writes around link validation.
    pub(super) async fn apply_entity_patch_batch(
        &self,
        actor_id: ActorId,
        params: Vec<PatchEntityParams>,
        locked_rows: Vec<LockedEntityEdition>,
        previous_entities: Vec<Entity>,
        transaction_time: Timestamp<TransactionTime>,
        offset: usize,
    ) -> Result<(Vec<Entity>, Vec<EntityId>), Report<UpdateError>> {
        let policy_components = self
            .build_entity_patch_policy_components(actor_id, &params, &previous_entities)
            .await?;
        let mut entities = Vec::with_capacity(params.len());
        let mut writes = Vec::new();
        let mut changed_indices = Vec::new();
        for ((params, locked_row), previous_entity) in
            params.into_iter().zip(locked_rows).zip(previous_entities)
        {
            let index = entities.len();
            let decision_time = patch_decision_time(&params, transaction_time);
            let provider = StoreProvider::new(self, &policy_components);
            match self
                .prepare_entity_patch(
                    actor_id,
                    params,
                    previous_entity,
                    &policy_components,
                    &provider,
                )
                .await?
            {
                EntityPatchPreparation::Unchanged(entity) => entities.push(*entity),
                EntityPatchPreparation::Changed(prepared) => {
                    let PreparedEntityPatch {
                        changes,
                        validation,
                    } = *prepared;
                    let EntityPatchChanges {
                        entity,
                        draft_transition,
                    } = changes;
                    // Link validation must observe earlier writes before later patches change its
                    // targets.
                    let validate_links = self.settings.validate_links && entity.link_data.is_some();
                    if validate_links {
                        self.persist_entity_patches(
                            actor_id,
                            &mut entities,
                            &mut writes,
                            transaction_time,
                        )
                        .await?;
                    }
                    entities.push(entity);
                    writes.push(EntityPatchWrite {
                        index,
                        locked_row,
                        decision_time,
                        draft_transition,
                    });
                    if validate_links {
                        self.persist_entity_patches(
                            actor_id,
                            &mut entities,
                            &mut writes,
                            transaction_time,
                        )
                        .await?;
                    }
                    validation
                        .validate(
                            &provider,
                            entities
                                .get(index)
                                .expect("patch index should identify a prepared entity"),
                            offset + index,
                        )
                        .await?;
                    changed_indices.push(index);
                }
            }
        }
        self.persist_entity_patches(actor_id, &mut entities, &mut writes, transaction_time)
            .await?;
        let embedding_ids = changed_indices
            .into_iter()
            .map(|index| {
                entities
                    .get(index)
                    .expect("patch index should identify a prepared entity")
                    .metadata
                    .record_id
                    .entity_id
            })
            .collect();
        Ok((entities, embedding_ids))
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
}
