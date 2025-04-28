pub use self::{
    error::{SnapshotDumpError, SnapshotRestoreError},
    metadata::{BlockProtocolModuleVersions, CustomGlobalMetadata},
    ontology::{
        DataTypeEmbeddingRecord, DataTypeSnapshotRecord, EntityTypeEmbeddingRecord,
        EntityTypeSnapshotRecord, OntologyTypeSnapshotRecord, PropertyTypeEmbeddingRecord,
        PropertyTypeSnapshotRecord,
    },
};
pub use crate::snapshot::metadata::SnapshotMetadata;

mod entity;
mod error;
mod metadata;
mod ontology;
mod owner;
mod principal;
mod restore;
mod web;

use core::{error::Error, future::ready};

use async_scoped::TokioScope;
use error_stack::{Report, ResultExt as _, ensure};
use futures::{
    Sink, SinkExt as _, Stream, StreamExt as _, TryFutureExt as _, TryStreamExt as _,
    channel::mpsc, stream,
};
use hash_graph_authorization::{
    AuthorizationApi, NoAuthorization,
    backend::ZanzibarBackend,
    schema::{
        AccountGroupRelationAndSubject, DataTypeRelationAndSubject, EntityNamespace,
        EntityRelationAndSubject, EntityTypeRelationAndSubject, PropertyTypeRelationAndSubject,
        WebRelationAndSubject,
    },
    zanzibar::{
        Consistency,
        types::{RelationshipFilter, ResourceFilter},
    },
};
use hash_graph_store::{
    error::InsertionError,
    filter::{Filter, QueryRecord},
    pool::StorePool,
    query::Read,
};
use hash_status::StatusCode;
use postgres_types::ToSql;
use serde::{Deserialize, Serialize};
use tokio_postgres::error::SqlState;
use type_system::{
    knowledge::entity::{
        Entity,
        id::{EntityId, EntityUuid},
    },
    ontology::{
        VersionedUrl,
        data_type::{DataTypeUuid, DataTypeWithMetadata},
        entity_type::{EntityTypeUuid, EntityTypeWithMetadata},
        property_type::{PropertyTypeUuid, PropertyTypeWithMetadata},
    },
    principal::{
        Actor, ActorGroup, Principal, PrincipalType, Role,
        actor::{Ai, Machine, User},
        actor_group::{ActorGroupEntityUuid, ActorGroupId, Team, Web, WebId},
        role::{RoleId, TeamRole, TeamRoleId, WebRole, WebRoleId},
    },
};
use uuid::Uuid;

use crate::{
    snapshot::{entity::EntityEmbeddingRecord, restore::SnapshotRecordBatch},
    store::postgres::{AsClient, PostgresStore, PostgresStorePool},
};

#[derive(Debug, Serialize, Deserialize)]
pub struct AccountGroup {
    pub id: ActorGroupEntityUuid,
    pub relations: Vec<AccountGroupRelationAndSubject>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SnapshotWeb {
    pub id: WebId,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub relations: Vec<WebRelationAndSubject>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "namespace")]
pub enum AuthorizationRelation {
    Entity {
        object: EntityUuid,
        #[serde(flatten)]
        relationship: EntityRelationAndSubject,
    },
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type", deny_unknown_fields)]
pub enum SnapshotEntry {
    Snapshot(SnapshotMetadata),
    AccountGroup(AccountGroup),
    Web(SnapshotWeb),
    Principal(Principal),
    DataType(Box<DataTypeSnapshotRecord>),
    DataTypeEmbedding(DataTypeEmbeddingRecord),
    PropertyType(Box<PropertyTypeSnapshotRecord>),
    PropertyTypeEmbedding(PropertyTypeEmbeddingRecord),
    EntityType(Box<EntityTypeSnapshotRecord>),
    EntityTypeEmbedding(EntityTypeEmbeddingRecord),
    Entity(Box<Entity>),
    EntityEmbedding(EntityEmbeddingRecord),
    Relation(AuthorizationRelation),
}

impl SnapshotEntry {
    #[expect(clippy::too_many_lines)]
    pub fn install_error_stack_hook() {
        error_stack::Report::install_debug_hook::<Self>(|entry, context| match entry {
            Self::Snapshot(global_metadata) => {
                context.push_body(format!(
                    "graph version: {}",
                    global_metadata.block_protocol_module_versions.graph
                ));
            }
            Self::AccountGroup(account_group) => {
                context.push_body(format!("account group: {}", account_group.id));
            }
            Self::Web(web) => {
                context.push_body(format!("web: {}", web.id));
            }
            Self::Principal(principal) => {
                context.push_body(format!("principal: {}", principal.id()));
            }
            Self::DataType(data_type) => {
                context.push_body(format!("data type: {}", data_type.metadata.record_id));
                if context.alternate()
                    && let Ok(json) = serde_json::to_string_pretty(data_type)
                {
                    context.push_appendix(format!("{}:\n{json}", data_type.metadata.record_id));
                }
            }
            Self::PropertyType(property_type) => {
                context.push_body(format!(
                    "property type: {}",
                    property_type.metadata.record_id
                ));
                if context.alternate()
                    && let Ok(json) = serde_json::to_string_pretty(property_type)
                {
                    context.push_appendix(format!("{}:\n{json}", property_type.metadata.record_id));
                }
            }
            Self::EntityType(entity_type) => {
                context.push_body(format!("entity type: {}", entity_type.metadata.record_id));
                if context.alternate()
                    && let Ok(json) = serde_json::to_string_pretty(entity_type)
                {
                    context.push_appendix(format!("{}:\n{json}", entity_type.metadata.record_id));
                }
            }
            Self::Entity(entity) => {
                context.push_body(format!("entity: {}", entity.metadata.record_id.entity_id));
                if context.alternate()
                    && let Ok(json) = serde_json::to_string_pretty(entity)
                {
                    context
                        .push_appendix(format!("{}:\n{json}", entity.metadata.record_id.entity_id));
                }
            }
            Self::Relation(AuthorizationRelation::Entity {
                object: id,
                relationship: relation,
            }) => {
                context.push_body(format!("relation: {id}"));
                if context.alternate()
                    && let Ok(json) = serde_json::to_string_pretty(relation)
                {
                    context.push_appendix(format!("{id}:\n{json}"));
                }
            }
            Self::DataTypeEmbedding(embedding) => {
                context.push_body(format!("data type embedding: {}", embedding.data_type_id));
                if context.alternate()
                    && let Ok(json) = serde_json::to_string_pretty(embedding)
                {
                    context.push_appendix(format!("{}:\n{json}", embedding.data_type_id));
                }
            }
            Self::PropertyTypeEmbedding(embedding) => {
                context.push_body(format!(
                    "property type embedding: {}",
                    embedding.property_type_id
                ));
                if context.alternate()
                    && let Ok(json) = serde_json::to_string_pretty(embedding)
                {
                    context.push_appendix(format!("{}:\n{json}", embedding.property_type_id));
                }
            }
            Self::EntityTypeEmbedding(embedding) => {
                context.push_body(format!(
                    "entity type embedding: {}",
                    embedding.entity_type_id
                ));
                if context.alternate()
                    && let Ok(json) = serde_json::to_string_pretty(embedding)
                {
                    context.push_appendix(format!("{}:\n{json}", embedding.entity_type_id));
                }
            }
            Self::EntityEmbedding(embedding) => {
                context.push_body(format!(
                    "entity embedding: {}",
                    embedding.entity_id.entity_uuid
                ));
                if context.alternate()
                    && let Ok(json) = serde_json::to_string_pretty(embedding)
                {
                    context.push_appendix(format!("{}:\n{json}", embedding.entity_id.entity_uuid));
                }
            }
        });
    }
}

trait WriteBatch<C, A> {
    fn begin(
        postgres_client: &mut PostgresStore<C, A>,
    ) -> impl Future<Output = Result<(), Report<InsertionError>>> + Send;
    fn write(
        self,
        postgres_client: &mut PostgresStore<C, A>,
    ) -> impl Future<Output = Result<(), Report<InsertionError>>> + Send;
    fn commit(
        postgres_client: &mut PostgresStore<C, A>,
        ignore_validation_errors: bool,
    ) -> impl Future<Output = Result<(), Report<InsertionError>>> + Send;
}

pub struct SnapshotStore<C, A>(PostgresStore<C, A>);

impl<C, A> SnapshotStore<C, A> {
    pub const fn new(store: PostgresStore<C, A>) -> Self {
        Self(store)
    }
}

#[expect(
    clippy::struct_excessive_bools,
    reason = "This is a configuration struct"
)]
#[derive(Debug, Copy, Clone)]
pub struct SnapshotDumpSettings {
    pub chunk_size: usize,
    pub dump_principals: bool,
    pub dump_entities: bool,
    pub dump_entity_types: bool,
    pub dump_property_types: bool,
    pub dump_data_types: bool,
    pub dump_embeddings: bool,
    pub dump_relations: bool,
}

impl PostgresStorePool {
    async fn read_account_groups<'a>(
        &'a self,
        authorization_api: &'a (impl ZanzibarBackend + Sync),
    ) -> Result<
        impl Stream<Item = Result<AccountGroup, Report<SnapshotDumpError>>> + Send + 'a,
        Report<SnapshotDumpError>,
    > {
        // TODO: Make account groups a first-class `Record` type
        //   see https://linear.app/hash/issue/H-752
        Ok(self
            .acquire(NoAuthorization, None)
            .await
            .change_context(SnapshotDumpError::Query)?
            .as_client()
            .query_raw("SELECT id FROM actor_group", [] as [&(dyn ToSql + Sync); 0])
            .await
            .map_err(|error| Report::new(error).change_context(SnapshotDumpError::Query))?
            .map_err(|error| Report::new(error).change_context(SnapshotDumpError::Read))
            .and_then(move |row| async move {
                let id: ActorGroupEntityUuid = row.get(0);
                Ok(AccountGroup {
                    id,
                    relations: authorization_api
                        .read_relations::<(ActorGroupEntityUuid, AccountGroupRelationAndSubject)>(
                            RelationshipFilter::from_resource(id),
                            Consistency::FullyConsistent,
                        )
                        .await
                        .change_context(SnapshotDumpError::Query)?
                        .map_ok(|(_group, relation)| relation)
                        .try_collect()
                        .await
                        .change_context(SnapshotDumpError::Query)?,
                })
            }))
    }

    async fn read_snapshot_webs<'a>(
        &'a self,
        authorization_api: &'a (impl ZanzibarBackend + Sync),
    ) -> Result<
        impl Stream<Item = Result<SnapshotWeb, Report<SnapshotDumpError>>> + Send + 'a,
        Report<SnapshotDumpError>,
    > {
        Ok(self
            .acquire(NoAuthorization, None)
            .await
            .change_context(SnapshotDumpError::Query)?
            .as_client()
            .query_raw("SELECT id FROM web", [] as [&(dyn ToSql + Sync); 0])
            .await
            .map_err(|error| Report::new(error).change_context(SnapshotDumpError::Query))?
            .map_err(|error| Report::new(error).change_context(SnapshotDumpError::Read))
            .and_then(move |row| async move {
                let id = row.get(0);
                Ok(SnapshotWeb {
                    id,
                    relations: authorization_api
                        .read_relations::<(WebId, WebRelationAndSubject)>(
                            RelationshipFilter::from_resource(id),
                            Consistency::FullyConsistent,
                        )
                        .await
                        .change_context(SnapshotDumpError::Query)?
                        .map_ok(|(_web_id, relation)| relation)
                        .try_collect()
                        .await
                        .change_context(SnapshotDumpError::Query)?,
                })
            }))
    }

    async fn read_users(
        &self,
    ) -> Result<
        impl Stream<Item = Result<Principal, Report<SnapshotDumpError>>> + Send,
        Report<SnapshotDumpError>,
    > {
        Ok(self
            .acquire(NoAuthorization, None)
            .await
            .change_context(SnapshotDumpError::Query)?
            .as_client()
            .query_raw(
                "
                SELECT user_actor.id,
                       array_agg(role.id) FILTER (WHERE role.id IS NOT NULL),
                       array_agg(role.principal_type) FILTER (WHERE role.id IS NOT NULL)
                FROM user_actor
                LEFT OUTER JOIN actor_role ON user_actor.id = actor_role.actor_id
                LEFT OUTER JOIN role ON actor_role.role_id = role.id
                GROUP BY user_actor.id",
                [] as [&(dyn ToSql + Sync); 0],
            )
            .await
            .change_context(SnapshotDumpError::Query)?
            .map_ok(|row| {
                let role_ids = row.get::<_, Option<Vec<Uuid>>>(1).unwrap_or_default();
                let principal_types = row
                    .get::<_, Option<Vec<PrincipalType>>>(2)
                    .unwrap_or_default();
                Principal::Actor(Actor::User(User {
                    id: row.get(0),
                    roles: role_ids
                        .into_iter()
                        .zip(principal_types)
                        .map(|(id, principal_type)| match principal_type {
                            PrincipalType::WebRole => RoleId::Web(WebRoleId::new(id)),
                            PrincipalType::TeamRole => RoleId::Team(TeamRoleId::new(id)),
                            _ => unreachable!("Unexpected role type: {principal_type:?}"),
                        })
                        .collect(),
                }))
            })
            .map_err(|error| Report::new(error).change_context(SnapshotDumpError::Read)))
    }

    async fn read_machines(
        &self,
    ) -> Result<
        impl Stream<Item = Result<Principal, Report<SnapshotDumpError>>> + Send,
        Report<SnapshotDumpError>,
    > {
        Ok(self
            .acquire(NoAuthorization, None)
            .await
            .change_context(SnapshotDumpError::Query)?
            .as_client()
            .query_raw(
                "
                SELECT
                    machine_actor.id,
                    machine_actor.identifier,
                    array_agg(role.id) FILTER (WHERE role.id IS NOT NULL),
                    array_agg(role.principal_type) FILTER (WHERE role.id IS NOT NULL)
                FROM machine_actor
                LEFT OUTER JOIN actor_role ON machine_actor.id = actor_role.actor_id
                LEFT OUTER JOIN role ON actor_role.role_id = role.id
                GROUP BY machine_actor.id, machine_actor.identifier",
                [] as [&(dyn ToSql + Sync); 0],
            )
            .await
            .change_context(SnapshotDumpError::Query)?
            .map_ok(|row| {
                let role_ids = row.get::<_, Option<Vec<Uuid>>>(2).unwrap_or_default();
                let principal_types = row
                    .get::<_, Option<Vec<PrincipalType>>>(3)
                    .unwrap_or_default();
                Principal::Actor(Actor::Machine(Machine {
                    id: row.get(0),
                    identifier: row.get(1),
                    roles: role_ids
                        .into_iter()
                        .zip(principal_types)
                        .map(|(id, principal_type)| match principal_type {
                            PrincipalType::WebRole => RoleId::Web(WebRoleId::new(id)),
                            PrincipalType::TeamRole => RoleId::Team(TeamRoleId::new(id)),
                            _ => unreachable!("Unexpected role type: {principal_type:?}"),
                        })
                        .collect(),
                }))
            })
            .map_err(|error| Report::new(error).change_context(SnapshotDumpError::Read)))
    }

    async fn read_ais(
        &self,
    ) -> Result<
        impl Stream<Item = Result<Principal, Report<SnapshotDumpError>>> + Send,
        Report<SnapshotDumpError>,
    > {
        Ok(self
            .acquire(NoAuthorization, None)
            .await
            .change_context(SnapshotDumpError::Query)?
            .as_client()
            .query_raw(
                "
                SELECT
                    ai_actor.id,
                    ai_actor.identifier,
                    array_agg(role.id) FILTER (WHERE role.id IS NOT NULL),
                    array_agg(role.principal_type) FILTER (WHERE role.id IS NOT NULL)
                FROM ai_actor
                LEFT OUTER JOIN actor_role ON ai_actor.id = actor_role.actor_id
                LEFT OUTER JOIN role ON actor_role.role_id = role.id
                GROUP BY ai_actor.id, ai_actor.identifier",
                [] as [&(dyn ToSql + Sync); 0],
            )
            .await
            .change_context(SnapshotDumpError::Query)?
            .map_ok(|row| {
                let role_ids = row.get::<_, Option<Vec<Uuid>>>(2).unwrap_or_default();
                let principal_types = row
                    .get::<_, Option<Vec<PrincipalType>>>(3)
                    .unwrap_or_default();
                Principal::Actor(Actor::Ai(Ai {
                    id: row.get(0),
                    identifier: row.get(1),
                    roles: role_ids
                        .into_iter()
                        .zip(principal_types)
                        .map(|(id, principal_type)| match principal_type {
                            PrincipalType::WebRole => RoleId::Web(WebRoleId::new(id)),
                            PrincipalType::TeamRole => RoleId::Team(TeamRoleId::new(id)),
                            _ => unreachable!("Unexpected role type: {principal_type:?}"),
                        })
                        .collect(),
                }))
            })
            .map_err(|error| Report::new(error).change_context(SnapshotDumpError::Read)))
    }

    async fn read_webs(
        &self,
    ) -> Result<
        impl Stream<Item = Result<Principal, Report<SnapshotDumpError>>> + Send,
        Report<SnapshotDumpError>,
    > {
        Ok(self
            .acquire(NoAuthorization, None)
            .await
            .change_context(SnapshotDumpError::Query)?
            .as_client()
            .query_raw(
                "
                SELECT
                    web.id,
                    web.shortname,
                    array_agg(role.id) FILTER (WHERE role.id IS NOT NULL)
                FROM web
                LEFT OUTER JOIN role ON web.id = role.actor_group_id
                GROUP BY web.id, web.shortname",
                [] as [&(dyn ToSql + Sync); 0],
            )
            .await
            .change_context(SnapshotDumpError::Query)?
            .map_ok(|row| {
                let role_ids = row.get::<_, Option<Vec<WebRoleId>>>(2).unwrap_or_default();
                Principal::ActorGroup(ActorGroup::Web(Web {
                    id: row.get(0),
                    shortname: row.get(1),
                    roles: role_ids.into_iter().collect(),
                }))
            })
            .map_err(|error| Report::new(error).change_context(SnapshotDumpError::Read)))
    }

    async fn read_teams(
        &self,
    ) -> Result<
        impl Stream<Item = Result<Principal, Report<SnapshotDumpError>>> + Send,
        Report<SnapshotDumpError>,
    > {
        Ok(self
            .acquire(NoAuthorization, None)
            .await
            .change_context(SnapshotDumpError::Query)?
            .as_client()
            .query_raw(
                "SELECT
                    team.id,
                    parent.principal_type,
                    parent.id,
                    team.name,
                    array_agg(role.id) FILTER (WHERE role.id IS NOT NULL)
                FROM team
                JOIN actor_group AS parent ON parent.id = parent_id
                LEFT OUTER JOIN role ON team.id = role.actor_group_id
                GROUP BY team.id, parent.principal_type, parent.id, team.name",
                [] as [&(dyn ToSql + Sync); 0],
            )
            .await
            .change_context(SnapshotDumpError::Query)?
            .map_ok(|row| {
                let role_ids = row.get::<_, Option<Vec<TeamRoleId>>>(4).unwrap_or_default();
                Principal::ActorGroup(ActorGroup::Team(Team {
                    id: row.get(0),
                    parent_id: match row.get(1) {
                        PrincipalType::Web => ActorGroupId::Web(row.get(2)),
                        PrincipalType::Team => ActorGroupId::Team(row.get(2)),
                        principal_type => {
                            unreachable!("Unexpected principal type {principal_type}")
                        }
                    },
                    name: row.get(3),
                    roles: role_ids.into_iter().collect(),
                }))
            })
            .map_err(|error| Report::new(error).change_context(SnapshotDumpError::Read)))
    }

    async fn read_roles(
        &self,
    ) -> Result<
        impl Stream<Item = Result<Principal, Report<SnapshotDumpError>>> + Send,
        Report<SnapshotDumpError>,
    > {
        Ok(self
            .acquire(NoAuthorization, None)
            .await
            .change_context(SnapshotDumpError::Query)?
            .as_client()
            .query_raw(
                "SELECT
                    principal_type,
                    id,
                    actor_group_id,
                    name
                FROM role",
                [] as [&(dyn ToSql + Sync); 0],
            )
            .await
            .change_context(SnapshotDumpError::Query)?
            .map_ok(|row| {
                Principal::Role(match row.get(0) {
                    PrincipalType::WebRole => Role::Web(WebRole {
                        id: row.get(1),
                        web_id: row.get(2),
                        name: row.get(3),
                    }),
                    PrincipalType::TeamRole => Role::Team(TeamRole {
                        id: row.get(1),
                        team_id: row.get(2),
                        name: row.get(3),
                    }),
                    principal_type => unreachable!("Unexpected principal type {principal_type}"),
                })
            })
            .map_err(|error| Report::new(error).change_context(SnapshotDumpError::Read)))
    }

    /// Convenience function to create a stream of snapshot entries.
    async fn create_dump_stream<'pool, T>(
        &'pool self,
    ) -> Result<
        impl Stream<Item = Result<T, Report<SnapshotDumpError>>> + Send + 'pool,
        Report<SnapshotDumpError>,
    >
    where
        <Self as StorePool>::Store<'pool, NoAuthorization>: Read<T>,
        T: QueryRecord + 'pool,
    {
        Ok(Read::<T>::read(
            &self
                .acquire(NoAuthorization, None)
                .await
                .change_context(SnapshotDumpError::Query)?,
            &Filter::All(vec![]),
            None,
            true,
        )
        .await
        .map_err(|future_error| future_error.change_context(SnapshotDumpError::Query))?
        .map_err(|stream_error| stream_error.change_context(SnapshotDumpError::Read)))
    }

    async fn create_data_type_embedding_stream(
        &self,
    ) -> Result<
        impl Stream<Item = Result<SnapshotEntry, Report<SnapshotDumpError>>> + Send,
        Report<SnapshotDumpError>,
    > {
        Ok(self
            .acquire(NoAuthorization, None)
            .await
            .change_context(SnapshotDumpError::Query)?
            .as_client()
            .query_raw(
                "SELECT base_url, version, embedding, updated_at_transaction_time
                 FROM data_type_embeddings
                 JOIN ontology_ids USING (ontology_id)",
                [] as [&(dyn ToSql + Sync); 0],
            )
            .await
            .change_context(SnapshotDumpError::Query)?
            .map(|result| result.change_context(SnapshotDumpError::Query))
            .map_ok(|row| {
                SnapshotEntry::DataTypeEmbedding(DataTypeEmbeddingRecord {
                    data_type_id: VersionedUrl {
                        base_url: row.get(0),
                        version: row.get(1),
                    },
                    embedding: row.get(2),
                    updated_at_transaction_time: row.get(3),
                })
            }))
    }

    async fn create_property_type_embedding_stream(
        &self,
    ) -> Result<
        impl Stream<Item = Result<SnapshotEntry, Report<SnapshotDumpError>>> + Send,
        Report<SnapshotDumpError>,
    > {
        Ok(self
            .acquire(NoAuthorization, None)
            .await
            .change_context(SnapshotDumpError::Query)?
            .as_client()
            .query_raw(
                "SELECT base_url, version, embedding, updated_at_transaction_time
                 FROM property_type_embeddings
                 JOIN ontology_ids USING (ontology_id)",
                [] as [&(dyn ToSql + Sync); 0],
            )
            .await
            .change_context(SnapshotDumpError::Query)?
            .map(|result| result.change_context(SnapshotDumpError::Query))
            .map_ok(|row| {
                SnapshotEntry::PropertyTypeEmbedding(PropertyTypeEmbeddingRecord {
                    property_type_id: VersionedUrl {
                        base_url: row.get(0),
                        version: row.get(1),
                    },
                    embedding: row.get(2),
                    updated_at_transaction_time: row.get(3),
                })
            }))
    }

    async fn create_entity_type_embedding_stream(
        &self,
    ) -> Result<
        impl Stream<Item = Result<SnapshotEntry, Report<SnapshotDumpError>>> + Send,
        Report<SnapshotDumpError>,
    > {
        Ok(self
            .acquire(NoAuthorization, None)
            .await
            .change_context(SnapshotDumpError::Query)?
            .as_client()
            .query_raw(
                "SELECT base_url, version, embedding, updated_at_transaction_time
                 FROM entity_type_embeddings
                 JOIN ontology_ids USING (ontology_id)",
                [] as [&(dyn ToSql + Sync); 0],
            )
            .await
            .change_context(SnapshotDumpError::Query)?
            .map(|result| result.change_context(SnapshotDumpError::Query))
            .map_ok(|row| {
                SnapshotEntry::EntityTypeEmbedding(EntityTypeEmbeddingRecord {
                    entity_type_id: VersionedUrl {
                        base_url: row.get(0),
                        version: row.get(1),
                    },
                    embedding: row.get(2),
                    updated_at_transaction_time: row.get(3),
                })
            }))
    }

    async fn create_entity_embedding_stream(
        &self,
    ) -> Result<
        impl Stream<Item = Result<SnapshotEntry, Report<SnapshotDumpError>>> + Send,
        Report<SnapshotDumpError>,
    > {
        Ok(self
            .acquire(NoAuthorization, None)
            .await
            .change_context(SnapshotDumpError::Query)?
            .as_client()
            .query_raw(
                "SELECT
                    web_id,
                    entity_uuid,
                    draft_id,
                    property,
                    embedding,
                    updated_at_decision_time,
                    updated_at_transaction_time
                 FROM entity_embeddings",
                [] as [&(dyn ToSql + Sync); 0],
            )
            .await
            .change_context(SnapshotDumpError::Query)?
            .map(|result| result.change_context(SnapshotDumpError::Query))
            .map_ok(|row| {
                SnapshotEntry::EntityEmbedding(EntityEmbeddingRecord {
                    entity_id: EntityId {
                        web_id: row.get(0),
                        entity_uuid: row.get(1),
                        draft_id: row.get(2),
                    },
                    property: row.get(3),
                    embedding: row.get(4),
                    updated_at_decision_time: row.get(5),
                    updated_at_transaction_time: row.get(6),
                })
            }))
    }

    /// Reads the snapshot from the store into the given sink.
    ///
    /// The sink is expected to be a `futures::Sink` that can be used to write the snapshot entries
    /// into.
    ///
    /// # Errors
    ///
    /// - If reading a record from the datastore fails
    /// - If writing a record into the sink fails
    #[expect(clippy::too_many_lines)]
    pub fn dump_snapshot(
        &self,
        sink: impl Sink<SnapshotEntry, Error = Report<impl Error + Send + Sync + 'static>>
        + Send
        + 'static,
        authorization_api: &(impl ZanzibarBackend + Sync),
        settings: SnapshotDumpSettings,
    ) -> Result<(), Report<SnapshotDumpError>> {
        let (snapshot_record_tx, snapshot_record_rx) = mpsc::channel(settings.chunk_size);
        let snapshot_record_tx = snapshot_record_tx
            .sink_map_err(|error| Report::new(error).change_context(SnapshotDumpError::Write));

        let ((), results) = TokioScope::scope_and_block(|scope| {
            scope.spawn(snapshot_record_rx.map(Ok).forward(
                sink.sink_map_err(|report| report.change_context(SnapshotDumpError::Write)),
            ));

            scope.spawn(
                stream::once(ready(Ok(SnapshotEntry::Snapshot(SnapshotMetadata {
                    block_protocol_module_versions: BlockProtocolModuleVersions {
                        graph: semver::Version::new(0, 3, 0),
                    },
                    custom: CustomGlobalMetadata,
                }))))
                .forward(snapshot_record_tx.clone()),
            );

            if settings.dump_principals {
                scope.spawn(
                    self.read_users()
                        .try_flatten_stream()
                        .chain(self.read_machines().try_flatten_stream())
                        .chain(self.read_ais().try_flatten_stream())
                        .chain(self.read_webs().try_flatten_stream())
                        .chain(self.read_teams().try_flatten_stream())
                        .chain(self.read_roles().try_flatten_stream())
                        .map_ok(SnapshotEntry::Principal)
                        .forward(snapshot_record_tx.clone()),
                );
                scope.spawn(
                    self.read_snapshot_webs(authorization_api)
                        .try_flatten_stream()
                        .map_ok(SnapshotEntry::Web)
                        .forward(snapshot_record_tx.clone()),
                );

                scope.spawn(
                    self.read_account_groups(authorization_api)
                        .try_flatten_stream()
                        .map_ok(SnapshotEntry::AccountGroup)
                        .forward(snapshot_record_tx.clone()),
                );
            }

            if settings.dump_data_types {
                scope.spawn(
                    self.create_dump_stream::<DataTypeWithMetadata>()
                        .try_flatten_stream()
                        .and_then(move |record| async move {
                            Ok(SnapshotEntry::DataType(Box::new(DataTypeSnapshotRecord {
                                schema: record.schema,
                                relations: authorization_api
                                    .read_relations::<(DataTypeUuid, DataTypeRelationAndSubject)>(
                                        RelationshipFilter::from_resource(DataTypeUuid::from_url(
                                            &VersionedUrl::from(record.metadata.record_id.clone()),
                                        )),
                                        Consistency::FullyConsistent,
                                    )
                                    .await
                                    .change_context(SnapshotDumpError::Query)?
                                    .map_ok(|(_, relation)| relation)
                                    .try_collect()
                                    .await
                                    .change_context(SnapshotDumpError::Query)?,
                                metadata: record.metadata,
                            })))
                        })
                        .forward(snapshot_record_tx.clone()),
                );
            }

            if settings.dump_property_types {
                scope.spawn(
                    self.create_dump_stream::<PropertyTypeWithMetadata>()
                        .try_flatten_stream()
                        .and_then(move |record| async move {
                            Ok(
                                SnapshotEntry::PropertyType(
                                    Box::new(
                                        PropertyTypeSnapshotRecord {
                                            schema: record.schema,
                                            relations:
                                                authorization_api
                                                    .read_relations::<(
                                                        PropertyTypeUuid,
                                                        PropertyTypeRelationAndSubject,
                                                    )>(
                                                        RelationshipFilter::from_resource(
                                                            PropertyTypeUuid::from_url(
                                                                &VersionedUrl::from(
                                                                    record
                                                                        .metadata
                                                                        .record_id
                                                                        .clone(),
                                                                ),
                                                            ),
                                                        ),
                                                        Consistency::FullyConsistent,
                                                    )
                                                    .await
                                                    .change_context(SnapshotDumpError::Query)?
                                                    .map_ok(|(_, relation)| relation)
                                                    .try_collect()
                                                    .await
                                                    .change_context(SnapshotDumpError::Query)?,
                                            metadata: record.metadata,
                                        },
                                    ),
                                ),
                            )
                        })
                        .forward(snapshot_record_tx.clone()),
                );
            }

            if settings.dump_entity_types {
                scope.spawn(
                        self.create_dump_stream::<EntityTypeWithMetadata>()
                            .try_flatten_stream()
                            .and_then(move |record| async move {
                                Ok(SnapshotEntry::EntityType(Box::new(EntityTypeSnapshotRecord {
                                    schema: record.schema,
                                    relations: authorization_api
                                        .read_relations::<(EntityTypeUuid, EntityTypeRelationAndSubject)>(
                                            RelationshipFilter::from_resource(EntityTypeUuid::from_url(
                                                &VersionedUrl::from(record.metadata.record_id.clone()),
                                            )),
                                            Consistency::FullyConsistent,
                                        )
                                        .await
                                        .change_context(SnapshotDumpError::Query)?
                                        .map_ok(|(_, relation)| relation)
                                        .try_collect()
                                        .await
                                        .change_context(SnapshotDumpError::Query)?,
                                    metadata: record.metadata,
                                })))
                            })
                            .forward(snapshot_record_tx.clone()),
                    );
            }

            if settings.dump_entities {
                scope.spawn(
                    self.create_dump_stream::<Entity>()
                        .try_flatten_stream()
                        .map_ok(|entity| SnapshotEntry::Entity(Box::new(entity)))
                        .forward(snapshot_record_tx.clone()),
                );
            }

            if settings.dump_data_types && settings.dump_embeddings {
                scope.spawn(
                    self.create_data_type_embedding_stream()
                        .try_flatten_stream()
                        .forward(snapshot_record_tx.clone()),
                );
            }

            if settings.dump_property_types && settings.dump_embeddings {
                scope.spawn(
                    self.create_property_type_embedding_stream()
                        .try_flatten_stream()
                        .forward(snapshot_record_tx.clone()),
                );
            }

            if settings.dump_entity_types && settings.dump_embeddings {
                scope.spawn(
                    self.create_entity_type_embedding_stream()
                        .try_flatten_stream()
                        .forward(snapshot_record_tx.clone()),
                );
            }

            if settings.dump_entities && settings.dump_embeddings {
                scope.spawn(
                    self.create_entity_embedding_stream()
                        .try_flatten_stream()
                        .forward(snapshot_record_tx.clone()),
                );
            }

            if settings.dump_entities && settings.dump_relations {
                scope.spawn(
                    authorization_api
                        .read_relations::<(EntityUuid, EntityRelationAndSubject)>(
                            RelationshipFilter::from_resource(ResourceFilter::from_kind(
                                EntityNamespace::Entity,
                            )),
                            Consistency::FullyConsistent,
                        )
                        .try_flatten_stream()
                        .map(|result| result.change_context(SnapshotDumpError::Query))
                        .map_ok(|(id, relation)| {
                            SnapshotEntry::Relation(AuthorizationRelation::Entity {
                                object: id,
                                relationship: relation,
                            })
                        })
                        .forward(snapshot_record_tx),
                );
            }
        });

        for result in results {
            result.change_context(SnapshotDumpError::Read)??;
        }

        Ok(())
    }
}

impl<C, A> SnapshotStore<C, A>
where
    C: AsClient,
    A: ZanzibarBackend + AuthorizationApi,
{
    /// Reads the snapshot from the stream into the store.
    ///
    /// The data emitted by the stream is read in a separate thread and is sent to different
    /// channels for each record type. Each channel holds a buffer of `chunk_size` entries. The
    /// receivers of the channels are then used to insert the records into the store. When a write
    /// operation to the store succeeds, the next entry is read from the channel, even if the
    /// buffer of the channel is not full yet. This ensures, that the store is continuously writing
    /// to the database and does not wait for the buffer to be full.
    ///
    /// Writing to the store happens in three stages:
    ///   1. The first stage is the `begin` stage. This stage is executed before any records are
    ///      read from the stream. It is used to create a transaction, so a possible rollback is
    ///      possible. For each data, which is inserted, a temporary table is created. This table is
    ///      used to insert the data into the store without locking the store and avoiding yet
    ///      unfulfilled foreign key constraints.
    ///   2. The second stage is the `write` stage. This stage is executed for each record type. It
    ///      reads the batch of records from the channels and inserts them into the temporary
    ///      tables, which were created above.
    ///   3. The third stage is the `commit` stage. This stage is executed after all records have
    ///      been read from the stream. It is used to insert the data from the temporary tables into
    ///      the store and to drop the temporary tables. As foreign key constraints are now enabled,
    ///      this stage might fail. In this case, the transaction is rolled back and the error is
    ///      returned.
    ///
    /// If the input stream contains an `Err` value, the snapshot restore is aborted and the error
    /// is returned.
    ///
    /// # Errors
    ///
    /// - If reading a record from the provided stream fails
    /// - If writing a record into the datastore fails
    pub async fn restore_snapshot(
        &mut self,
        snapshot: impl Stream<Item = Result<SnapshotEntry, Report<impl Error + Send + Sync + 'static>>>
        + Send
        + 'static,
        chunk_size: usize,
        ignore_validation_errors: bool,
    ) -> Result<(), Report<SnapshotRestoreError>> {
        tracing::info!("snapshot restore started");

        let (snapshot_record_tx, snapshot_record_rx, metadata_rx) = restore::channel(chunk_size);

        let read_thread = tokio::spawn(
            snapshot
                .map_err(|report| report.change_context(SnapshotRestoreError::Read))
                .forward(
                    snapshot_record_tx
                        .sink_map_err(|report| report.change_context(SnapshotRestoreError::Buffer)),
                ),
        );

        let mut client = self
            .0
            .transaction()
            .await
            .change_context(SnapshotRestoreError::Write)?;

        SnapshotRecordBatch::begin(&mut client)
            .await
            .change_context(SnapshotRestoreError::Write)?;

        let mut client = snapshot_record_rx
            .map(Ok::<_, Report<SnapshotRestoreError>>)
            .try_fold(
                client,
                |mut client, records: SnapshotRecordBatch| async move {
                    records
                        .write(&mut client)
                        .await
                        .change_context(SnapshotRestoreError::Write)?;
                    Ok(client)
                },
            )
            .await?;

        tracing::info!("snapshot reading finished, committing...");

        read_thread
            .await
            .change_context(SnapshotRestoreError::Read)??;

        SnapshotRecordBatch::commit(&mut client, ignore_validation_errors)
            .await
            .change_context(SnapshotRestoreError::Write)
            .map_err(|report| {
                if let Some(error) = report
                    .downcast_ref()
                    .and_then(tokio_postgres::Error::as_db_error)
                {
                    match *error.code() {
                        SqlState::FOREIGN_KEY_VIOLATION => {
                            report.attach_printable(StatusCode::NotFound)
                        }
                        SqlState::UNIQUE_VIOLATION => {
                            report.attach_printable(StatusCode::AlreadyExists)
                        }
                        _ => report,
                    }
                } else {
                    report
                }
            })?;

        client
            .commit()
            .await
            .change_context(SnapshotRestoreError::Write)
            .attach_printable("unable to commit snapshot to the store")?;

        let mut found_metadata = false;
        for metadata in metadata_rx.collect::<Vec<SnapshotMetadata>>().await {
            if found_metadata {
                tracing::warn!("found more than one metadata record in the snapshot");
            }
            found_metadata = true;

            ensure!(
                metadata.block_protocol_module_versions.graph == semver::Version::new(0, 3, 0),
                SnapshotRestoreError::Unsupported
            );
        }

        ensure!(found_metadata, SnapshotRestoreError::MissingMetadata);

        tracing::info!("snapshot restore finished");

        Ok(())
    }
}
