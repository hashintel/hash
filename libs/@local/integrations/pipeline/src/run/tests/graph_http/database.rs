//! Isolated seeding and observations; pipeline delivery always uses HTTP.

use alloc::collections::BTreeMap;
use std::collections::HashMap;

use hash_crypto::Secret;
use hash_graph_authorization::policies::store::{PolicyStore as _, PrincipalStore as _};
use hash_graph_postgres_store::store::{
    DatabaseConnectionInfo, DatabasePoolConfig, DatabaseType, PooledConnection, PostgresStore,
    PostgresStorePool, PostgresStoreSettings,
};
use hash_graph_store::{
    account::{AccountStore as _, CreateUserActorParams},
    data_type::{CreateDataTypeParams, DataTypeStore as _},
    entity::{EntityQueryPath, EntityQuerySorting, EntityStore as _, QueryEntitiesParams},
    entity_type::{CreateEntityTypeParams, EntityTypeStore as _},
    filter::{Filter, FilterExpression, Parameter},
    pool::StorePool as _,
    property_type::{CreatePropertyTypeParams, PropertyTypeStore as _},
    query::ConflictBehavior,
    subgraph::temporal_axes::QueryTemporalAxesUnresolved,
};
use hash_graph_test_data::{data_type, entity_type};
use serde::Deserialize;
use similar_asserts::assert_eq;
use type_system::{
    knowledge::entity::Entity,
    ontology::{
        data_type::DataType,
        entity_type::EntityType,
        property_type::PropertyType,
        provenance::{OntologyOwnership, ProvidedOntologyEditionProvenance},
    },
    principal::{
        actor::{ActorId, UserId},
        actor_group::WebId,
        role::RoleName,
    },
    provenance::{OriginProvenance, OriginType},
};

pub(super) const GRAPH_URL: &str = "http://127.0.0.1:55031";
pub(super) const SERVICE_SECRET: &str = "pipeline-acceptance-only";
const DATABASE: &str = "pipeline_acceptance_01a1d65f";

pub(super) struct Seeded {
    pub store: PostgresStore<PooledConnection>,
    pub actor: ActorId,
    pub user: UserId,
    pub web: WebId,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
#[expect(
    clippy::struct_field_names,
    reason = "Matches the ontology fixture's field names"
)]
struct Ontology {
    data_types: Vec<DataType>,
    property_types: Vec<PropertyType>,
    entity_types: Vec<EntityType>,
}

pub(super) async fn seed() -> Seeded {
    // There is deliberately no fallback to the development Graph or its database.
    let connection = DatabaseConnectionInfo::new(
        DatabaseType::Postgres,
        "postgres".into(),
        Secret::from_string("postgres".into()),
        "127.0.0.1".into(),
        5432,
        DATABASE.into(),
    );
    assert_eq!(connection.database(), "pipeline_acceptance_01a1d65f");
    let pool = PostgresStorePool::new(
        &connection,
        &DatabasePoolConfig::default(),
        PostgresStoreSettings::default(),
    )
    .expect("should configure the isolated acceptance database");
    let mut store = pool.acquire(None).await.expect(
        "should connect to the isolated acceptance database; see graph_http/README.md for setup",
    );
    let database: String = store
        .as_ref()
        .query_one("SELECT current_database()", &[])
        .await
        .expect("should verify the connected database before seeding")
        .get(0);
    assert_eq!(
        database, DATABASE,
        "should seed only the task-owned database"
    );
    store
        .seed_system_policies()
        .await
        .expect("should seed Graph policies");
    let system = store
        .get_or_create_system_machine("h")
        .await
        .expect("should obtain the system actor");
    let user = store
        .create_user_actor(
            system.into(),
            CreateUserActorParams {
                user_id: None,
                shortname: None,
                registration_complete: true,
            },
        )
        .await
        .expect("should create an isolated acceptance web");
    let actor = ActorId::from(user.machine_id);
    let web = WebId::from(user.user_id);
    store
        .unassign_role(
            user.user_id.into(),
            actor.into(),
            web.into(),
            RoleName::Member,
        )
        .await
        .expect("should replace the machine's member role");
    store
        .assign_role(
            user.user_id.into(),
            actor.into(),
            web.into(),
            RoleName::Administrator,
        )
        .await
        .expect("should let the integration machine administer its web");
    seed_ontology(&mut store, actor, web).await;
    Seeded {
        store,
        actor,
        user: user.user_id,
        web,
    }
}

async fn seed_ontology(store: &mut PostgresStore<PooledConnection>, actor: ActorId, web: WebId) {
    // Based on c47a17eed3's aviation ontology. S2 explicitly removes empty-mass, so that
    // property is optional here; model and first-flight remain required for validation probes.
    let mut ontology: Ontology = serde_json::from_str(include_str!("ontology.json"))
        .expect("should decode the scenario-grounded ontology");
    ontology.data_types.extend(
        [
            data_type::VALUE_V1,
            data_type::TEXT_V1,
            data_type::NUMBER_V1,
        ]
        .map(|schema| serde_json::from_str(schema).expect("should decode primitive schemas")),
    );
    ontology
        .entity_types
        .push(serde_json::from_str(entity_type::LINK_V1).expect("should decode the link schema"));
    let provenance = ProvidedOntologyEditionProvenance {
        actor_type: actor.actor_type(),
        origin: OriginProvenance::from_empty_type(OriginType::Api),
        sources: Vec::new(),
    };
    store
        .create_data_types(
            actor,
            ontology
                .data_types
                .into_iter()
                .map(|schema| CreateDataTypeParams {
                    schema,
                    ownership: OntologyOwnership::Local { web_id: web },
                    conflict_behavior: ConflictBehavior::Skip,
                    provenance: provenance.clone(),
                    conversions: HashMap::new(),
                }),
        )
        .await
        .expect("should seed aviation data types");
    store
        .create_property_types(
            actor,
            ontology
                .property_types
                .into_iter()
                .map(|schema| CreatePropertyTypeParams {
                    schema,
                    ownership: OntologyOwnership::Local { web_id: web },
                    conflict_behavior: ConflictBehavior::Skip,
                    provenance: provenance.clone(),
                }),
        )
        .await
        .expect("should seed aviation property types");
    store
        .create_entity_types(
            actor,
            ontology
                .entity_types
                .into_iter()
                .map(|schema| CreateEntityTypeParams {
                    schema,
                    ownership: OntologyOwnership::Local { web_id: web },
                    conflict_behavior: ConflictBehavior::Skip,
                    provenance: provenance.clone(),
                    fetched_from_origin: false,
                }),
        )
        .await
        .expect("should seed aviation entity types");
}

impl Seeded {
    pub(super) async fn read(&mut self) -> BTreeMap<String, Entity> {
        self.store
            .query_entities(
                Some(self.actor),
                QueryEntitiesParams {
                    filter: Filter::Equal(
                        FilterExpression::Path {
                            path: EntityQueryPath::WebId,
                        },
                        FilterExpression::Parameter {
                            parameter: Parameter::Uuid(self.web.into()),
                            convert: None,
                        },
                    ),
                    temporal_axes: QueryTemporalAxesUnresolved::live_only(),
                    sorting: EntityQuerySorting {
                        paths: Vec::new(),
                        cursor: None,
                    },
                    limit: 100,
                    conversions: Vec::new(),
                    include_entity_types: None,
                    include_drafts: false,
                    include_permissions: false,
                },
            )
            .await
            .expect("should read the committed HTTP effects")
            .entities
            .into_iter()
            .map(|entity| {
                (
                    super::expected_alias(
                        self.web,
                        &entity.metadata.record_id.entity_id.entity_uuid.to_string(),
                    ),
                    entity,
                )
            })
            .collect()
    }
}
