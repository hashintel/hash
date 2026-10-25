mod write;

use alloc::borrow::Cow;
use std::collections::{HashMap, HashSet};

use error_stack::{Report, ResultExt as _};
use hash_graph_authorization::policies::{
    Authorized, Context, ContextBuilder, MergePolicies, PolicyComponents, PolicySet, Request,
    RequestContext, ResourceId, action::ActionName, resource::EntityResource,
};
use hash_graph_store::{
    entity::{EntityQueryPath, PatchEntityParams},
    error::UpdateError,
    filter::{Filter, FilterExpression, Parameter},
    query::Read,
    subgraph::temporal_axes::{PinnedTemporalAxis, QueryTemporalAxes, VariableTemporalAxis},
};
use hash_graph_temporal_versioning::{
    ClosedTemporalBound, DecisionTime, LeftClosedTemporalInterval, LimitedTemporalBound,
    OpenTemporalBound, TemporalBound, TemporalTagged as _, Timestamp, TransactionTime,
};
use hash_status::StatusCode;
use tokio_postgres::{GenericClient as _, error::SqlState};
use type_system::{
    knowledge::{
        Entity,
        entity::{
            EntityId, EntityProvenance,
            id::{DraftId, EntityEditionId},
        },
    },
    ontology::{VersionedUrl, entity_type::ClosedMultiEntityType},
    principal::{
        PrincipalType,
        actor::{ActorEntityUuid, ActorId, ActorType},
    },
};
use uuid::Uuid;

use super::{
    history::EntityHistory,
    patch::{DraftTransition, EntityPatchPreparation, authorize_entity_patch},
};
use crate::store::{
    AsClient, InTransaction, PostgresStore,
    error::{EntityDoesNotExist, RaceConditionOnUpdate},
    postgres::{
        PrincipalContext,
        query::rows::{EntityDraftRow, EntityTemporalMetadataRow},
    },
    validation::StoreProvider,
};

/// Keeps intermediate editions alongside final temporal history so repeated patches can each
/// return their own result while their database updates are combined.
pub(crate) struct EntityPatchSet {
    history: EntityHistory,
    editions: HashMap<EntityEditionId, Entity>,
    changed: Vec<EntityEditionId>,
    drafts: Vec<EntityDraftRow>,
    publications: HashMap<EntityId, EntityProvenance>,
    archived: HashSet<EntityEditionId>,
    resources: HashMap<EntityEditionId, EntityResource<'static>>,
    creators: HashMap<ActorEntityUuid, ActorId>,
}

/// Supplements entity payloads with inherited type memberships and creator actor kinds.
/// Write checks use the edition creator; link visibility uses the entity's original creator.
struct EntityPatchResource {
    edition_id: EntityEditionId,
    entity_types: Vec<VersionedUrl>,
    edition_creator_type: ActorType,
    creator_type: ActorType,
}

fn actor_type(principal_type: PrincipalType) -> ActorType {
    match principal_type {
        PrincipalType::User => ActorType::User,
        PrincipalType::Machine => ActorType::Machine,
        PrincipalType::Ai => ActorType::Ai,
        PrincipalType::Web
        | PrincipalType::Team
        | PrincipalType::WebRole
        | PrincipalType::TeamRole => {
            unreachable!("entity creator should be an actor")
        }
    }
}

const fn temporal_row(entity: &Entity) -> EntityTemporalMetadataRow {
    let id = entity.metadata.record_id.entity_id;
    EntityTemporalMetadataRow {
        web_id: id.web_id,
        entity_uuid: id.entity_uuid,
        draft_id: id.draft_id,
        entity_edition_id: entity.metadata.record_id.edition_id,
        decision_time: entity.metadata.temporal_versioning.decision_time,
        transaction_time: entity.metadata.temporal_versioning.transaction_time,
    }
}

/// Isolates policy checks to one resolved edition while reusing the actor's role hierarchy.
/// This lets authorization see pending edits before their editions are persisted.
fn entity_context(
    principals: &PrincipalContext,
    entity: &EntityResource<'_>,
) -> Result<Context, Report<UpdateError>> {
    let mut context = ContextBuilder::default();
    principals.extend_context(&mut context);
    context.add_entity(entity);
    context.build().change_context(UpdateError)
}

impl EntityPatchSet {
    /// Returns every edition created by the batch, including those superseded by later patches.
    pub(super) fn changed_entities(&self) -> impl Iterator<Item = &Entity> {
        self.changed.iter().map(|id| {
            self.editions
                .get(id)
                .expect("changed editions should be present")
        })
    }

    /// Reconstructs the entity visible at both timestamps from the batch's working history.
    /// Temporal bounds and first-publication times include earlier patches in the batch.
    fn get(
        &self,
        entity_id: EntityId,
        transaction_time: Timestamp<TransactionTime>,
        decision_time: Timestamp<DecisionTime>,
    ) -> Option<Entity> {
        let row = self
            .history
            .get(entity_id, transaction_time, decision_time)?;
        let mut entity = self.editions.get(&row.entity_edition_id)?.clone();
        entity.metadata.record_id.entity_id = entity_id;
        entity.metadata.temporal_versioning.decision_time = row.decision_time;
        entity.metadata.temporal_versioning.transaction_time = row.transaction_time;
        if let Some(publication) = self.publications.get(&EntityId {
            draft_id: None,
            ..entity_id
        }) {
            entity
                .metadata
                .provenance
                .first_non_draft_created_at_transaction_time =
                publication.first_non_draft_created_at_transaction_time;
            entity
                .metadata
                .provenance
                .first_non_draft_created_at_decision_time =
                publication.first_non_draft_created_at_decision_time;
        }
        Some(entity)
    }

    /// Places a prepared change into history using the entity's existing bounds as the interval
    /// to replace. Draft creation preserves live history; publication closes the live interval
    /// being superseded.
    fn apply(
        &mut self,
        actor_id: ActorId,
        entity: &mut Entity,
        transition: DraftTransition,
        transaction_time: Timestamp<TransactionTime>,
        decision_time: Timestamp<DecisionTime>,
    ) {
        let previous = temporal_row(entity);
        let id = &mut entity.metadata.record_id.entity_id;
        match transition {
            DraftTransition::Update => {}
            DraftTransition::Create => {
                let draft_id = DraftId::new(Uuid::new_v4());
                id.draft_id = Some(draft_id);
                self.drafts.push(EntityDraftRow {
                    web_id: id.web_id,
                    entity_uuid: id.entity_uuid,
                    draft_id,
                });
            }
            DraftTransition::Publish => {
                id.draft_id = None;
                if let Some(live) = self
                    .history
                    .get(*id, transaction_time, decision_time)
                    .cloned()
                {
                    self.history.close(&live, transaction_time, decision_time);
                    self.archived.insert(live.entity_edition_id);
                    if let Some(edition) = self.editions.get_mut(&live.entity_edition_id) {
                        edition.metadata.provenance.edition.archived_by_id = Some(actor_id.into());
                    }
                }
                let provenance = &mut entity.metadata.provenance;
                if provenance
                    .first_non_draft_created_at_decision_time
                    .is_none()
                {
                    provenance.first_non_draft_created_at_transaction_time = Some(transaction_time);
                    provenance.first_non_draft_created_at_decision_time = Some(decision_time);
                    self.publications.insert(*id, provenance.clone());
                }
            }
        }
        entity.metadata.record_id.edition_id = EntityEditionId::new(Uuid::new_v4());
        entity.metadata.temporal_versioning.transaction_time = LeftClosedTemporalInterval::new(
            ClosedTemporalBound::Inclusive(transaction_time),
            OpenTemporalBound::Unbounded,
        );
        entity.metadata.temporal_versioning.decision_time = LeftClosedTemporalInterval::new(
            ClosedTemporalBound::Inclusive(decision_time),
            if matches!(transition, DraftTransition::Create) {
                OpenTemporalBound::Unbounded
            } else {
                *previous.decision_time.end()
            },
        );
        if matches!(transition, DraftTransition::Create) {
            self.history.insert(temporal_row(entity));
        } else {
            self.history.replace(
                &previous,
                temporal_row(entity),
                transaction_time,
                decision_time,
            );
        }
        self.changed.push(entity.metadata.record_id.edition_id);
    }

    /// Retains a new edition with its inherited type memberships so subsequent patches authorize
    /// against its updated types before the edition cache is written.
    fn remember(&mut self, actor_id: ActorId, entity: &Entity, schema: &ClosedMultiEntityType) {
        let entity_types: HashSet<_> = schema
            .all_of
            .iter()
            .flat_map(|entity_type| {
                core::iter::once(entity_type.id.clone())
                    .chain(entity_type.all_of.iter().map(|parent| parent.id.clone()))
            })
            .collect();
        self.resources.insert(
            entity.metadata.record_id.edition_id,
            EntityResource {
                id: entity.metadata.record_id.entity_id,
                entity_base_types: Cow::Owned(
                    entity_types.iter().map(|id| id.base_url.clone()).collect(),
                ),
                entity_types: Cow::Owned(entity_types.into_iter().collect()),
                created_by: actor_id,
                read_only: entity.metadata.read_only,
            },
        );
        self.editions
            .insert(entity.metadata.record_id.edition_id, entity.clone());
    }

    /// Overrides endpoint lookups for entities in this batch so link validation sees earlier edits.
    /// Missing or hidden endpoints are denied so validation cannot read stale database editions.
    async fn cache_link_endpoints<C: AsClient>(
        &self,
        actor_id: ActorId,
        entity: &Entity,
        provider: &StoreProvider<'_, PostgresStore<C, InTransaction>>,
        transaction_time: Timestamp<TransactionTime>,
        policies: &PolicySet,
        principals: &PrincipalContext,
    ) -> Result<(), Report<UpdateError>> {
        let Some(link) = &entity.link_data else {
            return Ok(());
        };
        for id in [link.left_entity_id, link.right_entity_id] {
            if !self.history.contains(id) {
                continue;
            }
            let Some(endpoint) = self.get(id, transaction_time, Timestamp::now()) else {
                provider.deny_entity_access(id).await;
                continue;
            };
            let Some(resource) = self.resources.get(&endpoint.metadata.record_id.edition_id) else {
                continue;
            };
            let context = entity_context(
                principals,
                &EntityResource {
                    id,
                    entity_types: Cow::Borrowed(&resource.entity_types),
                    entity_base_types: Cow::Borrowed(&resource.entity_base_types),
                    created_by: *self
                        .creators
                        .get(&endpoint.metadata.provenance.created_by_id)
                        .expect("endpoint creator should be loaded"),
                    read_only: resource.read_only,
                },
            )?;
            let request = Request {
                actor: Some(actor_id),
                action: ActionName::ViewEntity,
                resource: &ResourceId::Entity(id.entity_uuid),
                context: RequestContext::default(),
            };
            let authorized = policies
                .evaluate(&request, &context)
                .change_context(UpdateError)?;
            if matches!(authorized, Authorized::Always) {
                provider.grant_entity_access(endpoint).await;
            } else {
                provider.deny_entity_access(id).await;
            }
        }
        Ok(())
    }
}

impl<C: AsClient> PostgresStore<C, InTransaction> {
    /// Locks every decision-time interval visible at the batch's transaction time, including live
    /// counterparts needed for draft publication. A conflicting lock fails immediately.
    #[tracing::instrument(level = "info", skip(self, params))]
    async fn lock_entity_patch_history(
        &self,
        params: &[PatchEntityParams],
        transaction_time: Timestamp<TransactionTime>,
    ) -> Result<EntityHistory, Report<UpdateError>> {
        let mut entity_ids = HashSet::with_capacity(params.len());

        for params in params {
            entity_ids.insert(params.entity_id);

            if params.draft == Some(false) {
                entity_ids.insert(EntityId {
                    draft_id: None,
                    ..params.entity_id
                });
            }
        }

        let mut history = Vec::new();
        for id in entity_ids {
            let rows = self
                .as_client()
                .query(
                    "
                    SELECT
                        entity_temporal_metadata.web_id,
                        entity_temporal_metadata.entity_uuid,
                        entity_temporal_metadata.draft_id,
                        entity_temporal_metadata.entity_edition_id,
                        entity_temporal_metadata.decision_time,
                        entity_temporal_metadata.transaction_time
                    FROM entity_temporal_metadata
                    WHERE entity_temporal_metadata.web_id = $1
                        AND entity_temporal_metadata.entity_uuid = $2
                        AND entity_temporal_metadata.draft_id IS NOT DISTINCT FROM $3
                        AND entity_temporal_metadata.transaction_time @> $4::TIMESTAMPTZ
                    FOR NO KEY UPDATE NOWAIT
                    ",
                    &[&id.web_id, &id.entity_uuid, &id.draft_id, &transaction_time],
                )
                .await
                .map_err(|error| {
                    if error.code() == Some(&SqlState::LOCK_NOT_AVAILABLE) {
                        Report::new(error)
                            .change_context(RaceConditionOnUpdate)
                            .change_context(UpdateError)
                    } else {
                        Report::new(error).change_context(UpdateError)
                    }
                })?;
            history.extend(rows.into_iter().map(|row| EntityTemporalMetadataRow {
                web_id: row.get("web_id"),
                entity_uuid: row.get("entity_uuid"),
                draft_id: row.get("draft_id"),
                entity_edition_id: row.get("entity_edition_id"),
                decision_time: row.get("decision_time"),
                transaction_time: row.get("transaction_time"),
            }));
        }
        Ok(EntityHistory::new(history))
    }

    /// Supplies authorization attributes absent from the loaded entity payloads.
    /// Uses the batch's transaction timestamp to match the locked history.
    async fn read_entity_patch_resources(
        &self,
        edition_ids: &[EntityEditionId],
        transaction_time: Timestamp<TransactionTime>,
    ) -> Result<Vec<EntityPatchResource>, Report<UpdateError>> {
        let mut resources = Vec::new();
        for edition_id in edition_ids {
            let rows = self
                .as_client()
                .query(
                    "
                SELECT
                    temporal.entity_edition_id,
                    edition_cache.versioned_urls,
                    edition_creator.principal_type AS edition_creator_type,
                    creator.principal_type AS creator_type
                FROM entity_temporal_metadata AS temporal
                INNER JOIN entity_edition_cache AS edition_cache
                    ON temporal.entity_edition_id = edition_cache.entity_edition_id
                INNER JOIN entity_editions AS editions
                    ON temporal.entity_edition_id = editions.entity_edition_id
                INNER JOIN actor AS edition_creator
                    ON editions.created_by_id = edition_creator.id
                INNER JOIN entity_ids AS entities
                    ON temporal.web_id = entities.web_id
                    AND temporal.entity_uuid = entities.entity_uuid
                INNER JOIN actor AS creator
                    ON entities.created_by_id = creator.id
                WHERE temporal.entity_edition_id = $1
                    AND temporal.transaction_time @> $2::TIMESTAMPTZ
                ",
                    &[edition_id, &transaction_time],
                )
                .await
                .change_context(UpdateError)?;
            resources.extend(rows.into_iter().map(|row| EntityPatchResource {
                edition_id: row.get("entity_edition_id"),
                entity_types: row.get("versioned_urls"),
                edition_creator_type: actor_type(row.get("edition_creator_type")),
                creator_type: actor_type(row.get("creator_type")),
            }));
        }
        Ok(resources)
    }

    /// Establishes the batch's working state while holding locks until transaction completion.
    /// Loads history for backdated patches and draft publication to be resolved in memory.
    #[tracing::instrument(level = "info", skip(self, params))]
    pub(super) async fn load_entity_patch_set(
        &self,
        params: &[PatchEntityParams],
        transaction_time: Timestamp<TransactionTime>,
    ) -> Result<EntityPatchSet, Report<UpdateError>> {
        let history = self
            .lock_entity_patch_history(params, transaction_time)
            .await?;
        let edition_ids: Vec<_> = history.edition_ids().collect();
        let mut entities = Vec::new();
        for edition_id in &edition_ids {
            entities.extend(
                Read::<Entity>::read_vec(
                    self,
                    &[Filter::Equal(
                        FilterExpression::Path {
                            path: EntityQueryPath::EditionId,
                        },
                        FilterExpression::Parameter {
                            parameter: Parameter::Uuid(edition_id.into_uuid()),
                            convert: None,
                        },
                    )],
                    Some(&QueryTemporalAxes::DecisionTime {
                        pinned: PinnedTemporalAxis::new(transaction_time),
                        variable: VariableTemporalAxis::new(
                            TemporalBound::Unbounded,
                            LimitedTemporalBound::Inclusive(transaction_time.cast()),
                        ),
                    }),
                    true,
                )
                .await
                .change_context(UpdateError)?,
            );
        }
        let editions: HashMap<_, _> = entities
            .into_iter()
            .map(|entity| (entity.metadata.record_id.edition_id, entity))
            .collect();
        let mut resources = HashMap::new();
        let mut creators = HashMap::new();
        for EntityPatchResource {
            edition_id,
            entity_types,
            edition_creator_type,
            creator_type,
        } in self
            .read_entity_patch_resources(&edition_ids, transaction_time)
            .await?
        {
            let entity = editions
                .get(&edition_id)
                .expect("locked edition should be loaded");
            resources.insert(
                edition_id,
                EntityResource {
                    id: entity.metadata.record_id.entity_id,
                    entity_base_types: Cow::Owned(
                        entity_types.iter().map(|id| id.base_url.clone()).collect(),
                    ),
                    entity_types: Cow::Owned(entity_types),
                    created_by: ActorId::new(
                        entity.metadata.provenance.edition.created_by_id,
                        edition_creator_type,
                    ),
                    read_only: entity.metadata.read_only,
                },
            );
            let creator_id = entity.metadata.provenance.created_by_id;
            creators.insert(creator_id, ActorId::new(creator_id, creator_type));
        }
        Ok(EntityPatchSet {
            history,
            editions,
            changed: Vec::new(),
            drafts: Vec::new(),
            publications: HashMap::new(),
            archived: HashSet::new(),
            resources,
            creators,
        })
    }

    /// Resolves permissions for both existing and requested types before processing the batch.
    /// Keeps policies intact for direct checks; merged policies support ontology queries.
    async fn build_entity_patch_policy_components(
        &self,
        actor_id: ActorId,
        params: &[PatchEntityParams],
        patches: &EntityPatchSet,
    ) -> Result<PolicyComponents, Report<UpdateError>> {
        PolicyComponents::builder(self, Some(actor_id))
            .with_entity_type_ids(
                params
                    .iter()
                    .flat_map(|params| &params.entity_type_ids)
                    .chain(
                        patches
                            .resources
                            .values()
                            .flat_map(|resource| resource.entity_types.iter()),
                    ),
            )
            .with_actions(
                [
                    ActionName::Instantiate,
                    ActionName::UpdateEntity,
                    ActionName::ArchiveEntity,
                    ActionName::ViewEntity,
                ],
                MergePolicies::No,
            )
            .with_actions(
                [
                    ActionName::ViewEntityType,
                    ActionName::ViewPropertyType,
                    ActionName::ViewDataType,
                ],
                MergePolicies::Yes,
            )
            .await
            .change_context(UpdateError)
    }

    /// Applies and authorizes each patch against the state left by earlier inputs, including
    /// repeated entity IDs. Accumulates validated writes and returns results in input order.
    #[tracing::instrument(level = "info", skip(self, params, patches))]
    pub(super) async fn resolve_entity_patches(
        &self,
        actor_id: ActorId,
        params: Vec<PatchEntityParams>,
        patches: &mut EntityPatchSet,
        transaction_time: Timestamp<TransactionTime>,
    ) -> Result<Vec<Entity>, Report<UpdateError>> {
        let principals = self
            .load_principal_context(actor_id)
            .await
            .change_context(UpdateError)?;
        let mut results = Vec::with_capacity(params.len());
        for (index, params) in params.into_iter().enumerate() {
            let decision_time = params
                .decision_time
                .map_or_else(|| transaction_time.cast(), Timestamp::remove_nanosecond);
            let previous = patches
                .get(params.entity_id, transaction_time, decision_time)
                .ok_or_else(|| {
                    Report::new(EntityDoesNotExist)
                        .attach_opaque(StatusCode::NotFound)
                        .attach(params.entity_id)
                        .change_context(UpdateError)
                })?;
            let policies = self
                .build_entity_patch_policy_components(
                    actor_id,
                    core::slice::from_ref(&params),
                    patches,
                )
                .await?;
            let view_policies = policies
                .build_policy_set([ActionName::ViewEntity])
                .change_context(UpdateError)?;
            let write_policies = policies
                .build_policy_set([
                    ActionName::Instantiate,
                    ActionName::UpdateEntity,
                    ActionName::ArchiveEntity,
                ])
                .change_context(UpdateError)?;
            let context = entity_context(
                &principals,
                patches
                    .resources
                    .get(&previous.metadata.record_id.edition_id)
                    .expect("previous edition should have an authorization resource"),
            )?;
            authorize_entity_patch(actor_id, &params, &previous, &write_policies, &context)?;
            let provider = StoreProvider::new(self, &policies);
            let prepared = self
                .prepare_entity_patch(
                    actor_id,
                    params,
                    previous,
                    &policies,
                    &write_policies,
                    &provider,
                )
                .await?;
            match prepared {
                EntityPatchPreparation::Unchanged(entity) => results.push(*entity),
                EntityPatchPreparation::Changed(prepared) => {
                    let mut entity = prepared.entity;
                    patches.apply(
                        actor_id,
                        &mut entity,
                        prepared.draft_transition,
                        transaction_time,
                        decision_time,
                    );
                    patches.remember(actor_id, &entity, &prepared.validation.entity_type);
                    if self.settings.validate_links {
                        patches
                            .cache_link_endpoints(
                                actor_id,
                                &entity,
                                &provider,
                                transaction_time,
                                &view_policies,
                                &principals,
                            )
                            .await?;
                    }
                    prepared
                        .validation
                        .validate(&provider, &entity, index)
                        .await?;
                    results.push(entity);
                }
            }
        }
        Ok(results)
    }
}
