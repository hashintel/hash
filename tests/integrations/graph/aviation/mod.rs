#![expect(missing_docs, reason = "integration tests")]

extern crate alloc;

mod database;

use alloc::collections::BTreeMap;
use std::collections::{HashMap, HashSet};

use hash_crypto::Secret;
use hash_graph_authorization::policies::store::{PolicyStore as _, PrincipalStore as _};
use hash_graph_postgres_store::store::{PooledConnection, PostgresStore};
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
use hash_integrations_definition::{Definition, SourceKind};
use hash_integrations_engine::{
    Applied, FinishedPlan, GraphClient, GraphPlan, Planner, SinkColumns, SinkRow, TableAssertions,
    Workspace, WorkspaceConfig, derive_entity_id, integration_provenance,
};
use pretty_assertions::assert_eq;
use reqwest::Url;
use serde::Deserialize;
use serde_json::json;
use tempfile::TempDir;
use type_system::{
    knowledge::entity::{Entity, Link, provenance::ProvidedEntityEditionProvenance},
    ontology::{
        VersionedUrl,
        data_type::DataType,
        entity_type::EntityType,
        property_type::PropertyType,
        provenance::{OntologyOwnership, ProvidedOntologyEditionProvenance},
    },
    principal::{actor::ActorId, actor_group::WebId, role::RoleName},
    provenance::{Location, SourceProvenance, SourceType},
};

const TYPES: &str = "https://example.com/@demo/types";

#[derive(Deserialize)]
struct OntologyFixture {
    #[serde(rename = "dataTypes")]
    data: Vec<DataType>,
    #[serde(rename = "propertyTypes")]
    properties: Vec<PropertyType>,
    #[serde(rename = "entityTypes")]
    entities: Vec<EntityType>,
}

fn url(kind: &str, name: &str) -> VersionedUrl {
    format!("{TYPES}/{kind}/{name}/v/1")
        .parse()
        .expect("the aviation type URL should be valid")
}

fn provenance() -> ProvidedEntityEditionProvenance {
    integration_provenance(SourceProvenance {
        ty: SourceType::Integration,
        entity_id: None,
        authors: Vec::new(),
        location: Some(Location {
            name: Some("aviation".to_owned()),
            uri: None,
            description: None,
        }),
        first_published: None,
        last_updated: None,
        loaded_at: None,
    })
}

async fn seed(store: &mut PostgresStore<PooledConnection>) -> (ActorId, WebId) {
    store
        .seed_system_policies()
        .await
        .expect("the Graph policies should be seeded");
    let system = store
        .get_or_create_system_machine("h")
        .await
        .expect("the system actor should exist");
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
        .expect("the aviation web should be created");
    let actor = ActorId::from(user.machine_id);
    let web_id = WebId::from(user.user_id);
    store
        .unassign_role(
            user.user_id.into(),
            actor.into(),
            web_id.into(),
            RoleName::Member,
        )
        .await
        .expect("the machine's member role should be removed before assigning administrator");
    store
        .assign_role(
            user.user_id.into(),
            actor.into(),
            web_id.into(),
            RoleName::Administrator,
        )
        .await
        .expect("the machine should administer the aviation web");
    seed_ontology(store, actor, web_id).await;
    (actor, web_id)
}

async fn seed_ontology(store: &mut PostgresStore<PooledConnection>, actor: ActorId, web_id: WebId) {
    let mut ontology: OntologyFixture = serde_json::from_str(include_str!("ontology.json"))
        .expect("the aviation ontology should be valid");
    ontology.data.extend(
        [
            data_type::VALUE_V1,
            data_type::TEXT_V1,
            data_type::NUMBER_V1,
        ]
        .map(|schema| serde_json::from_str(schema).expect("the primitive schema should be valid")),
    );
    ontology
        .entities
        .push(serde_json::from_str(entity_type::LINK_V1).expect("the link schema should be valid"));
    let provenance = ProvidedOntologyEditionProvenance {
        actor_type: actor.actor_type(),
        origin: provenance().origin,
        sources: Vec::new(),
    };
    store
        .create_data_types(
            actor,
            ontology
                .data
                .into_iter()
                .map(|schema| CreateDataTypeParams {
                    schema,
                    ownership: OntologyOwnership::Local { web_id },
                    conflict_behavior: ConflictBehavior::Skip,
                    provenance: provenance.clone(),
                    conversions: HashMap::new(),
                }),
        )
        .await
        .expect("the aviation data types should be seeded");
    store
        .create_property_types(
            actor,
            ontology
                .properties
                .into_iter()
                .map(|schema| CreatePropertyTypeParams {
                    schema,
                    ownership: OntologyOwnership::Local { web_id },
                    conflict_behavior: ConflictBehavior::Skip,
                    provenance: provenance.clone(),
                }),
        )
        .await
        .expect("the aviation property types should be seeded");
    store
        .create_entity_types(
            actor,
            ontology
                .entities
                .into_iter()
                .map(|schema| CreateEntityTypeParams {
                    schema,
                    ownership: OntologyOwnership::Local { web_id },
                    conflict_behavior: ConflictBehavior::Skip,
                    provenance: provenance.clone(),
                    fetched_from_origin: false,
                }),
        )
        .await
        .expect("the aviation entity types should be seeded");
}

fn namespace(web_id: WebId) -> String {
    format!("aviation/{web_id}")
}

async fn plan(workspace: &Workspace, web_id: WebId) -> FinishedPlan {
    let definition = Definition::from_yaml(include_str!(
        "../../../../libs/@local/integrations/definition/examples/aviation.yaml"
    ))
    .expect("the aviation definition should parse");
    let planner = Planner::new(
        web_id,
        namespace(web_id),
        provenance(),
        definition.unit_maps().clone(),
    );
    let mut checkpoints = BTreeMap::new();
    let mut plans = GraphPlan::default();
    for pipeline in definition.entity_pipelines() {
        let source = definition
            .sources()
            .get(&pipeline.source)
            .expect("the source should exist");
        let SourceKind::Sql { query, primary_key } = &source.kind else {
            panic!("the aviation example should use SQL sources");
        };
        let table = format!("source/{}", pipeline.source).into_boxed_str();
        workspace
            .stage_table(
                table.clone(),
                query.as_ref().into(),
                primary_key.clone(),
                TableAssertions::default(),
            )
            .await
            .expect("the aviation source should be staged");
        let prepared = workspace
            .prepare_pipeline(pipeline.clone(), table, checkpoints.clone())
            .await
            .expect("the aviation pipeline should run");
        checkpoints.extend(prepared.checkpoints);
        for sink in prepared.sinks {
            let rows = workspace
                .query(format!("SELECT * FROM \"{}\"", sink.table).into_boxed_str())
                .await
                .expect("the sink rows should be readable");
            let columns = rows
                .columns()
                .iter()
                .map(AsRef::as_ref)
                .collect::<SinkColumns>();
            plans.extend([planner
                .plan_entities(
                    &sink.sink,
                    rows.iter().map(|row| SinkRow::new(&columns, row)),
                )
                .expect("the entity rows should plan")]);
        }
    }
    for link in definition.link_pipelines() {
        let prepared = workspace
            .prepare_link_pipeline(link.clone(), checkpoints.clone())
            .await
            .expect("the aviation link pipeline should run");
        let rows = workspace
            .query(format!("SELECT * FROM \"{}\"", prepared.table).into_boxed_str())
            .await
            .expect("the link rows should be readable");
        let columns = rows
            .columns()
            .iter()
            .map(AsRef::as_ref)
            .collect::<SinkColumns>();
        plans.extend([planner
            .plan_links(
                &prepared.pipeline,
                rows.iter().map(|row| SinkRow::new(&columns, row)),
            )
            .expect("the link rows should plan")]);
    }
    let plan = plans
        .finish()
        .expect("the aviation records should have distinct IDs");
    assert!(
        plan.issues().is_empty(),
        "the aviation rows should plan without issues: {:?}",
        plan.issues()
    );
    plan
}

async fn read(
    store: &mut PostgresStore<PooledConnection>,
    actor: ActorId,
    web_id: WebId,
) -> Vec<Entity> {
    let entities = store
        .query_entities(
            Some(actor),
            QueryEntitiesParams {
                filter: Filter::Equal(
                    FilterExpression::Path {
                        path: EntityQueryPath::WebId,
                    },
                    FilterExpression::Parameter {
                        parameter: Parameter::Uuid(web_id.into()),
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
        .expect("the committed aviation entities should be readable")
        .entities;
    assert_eq!(
        entities.len(),
        6,
        "the web should contain exactly four records and two links"
    );
    entities
}

fn entity<'entities>(
    entities: &'entities [Entity],
    web_id: WebId,
    kind: &str,
    source: &str,
) -> &'entities Entity {
    let entity_type = url("entity-type", kind);
    let id = derive_entity_id(web_id, &namespace(web_id), &entity_type, source);
    let entity = entities
        .iter()
        .find(|entity| entity.metadata.record_id.entity_id == id)
        .expect("the deterministic entity ID should be stored");
    assert_eq!(
        entity.metadata.entity_type_ids,
        HashSet::from([entity_type])
    );
    entity
}

fn assert_data(entities: &[Entity], actor: ActorId, web_id: WebId) {
    let mut records = BTreeMap::new();
    for (kind, source) in [
        ("airfield", "ESSA"),
        ("airfield", "ESSB"),
        ("aircraft", "SE-XXX"),
        ("aircraft", "N100"),
    ] {
        records.insert(
            format!("{kind}/{source}"),
            entity(entities, web_id, kind, source),
        );
    }
    for tail in ["SE-XXX", "N100"] {
        let aircraft = entity(entities, web_id, "aircraft", tail);
        let link_source = format!(
            "{}::{tail}::{}::ESSA",
            url("entity-type", "aircraft"),
            url("entity-type", "airfield")
        );
        let link = entity(entities, web_id, "based-at", &link_source);
        let Some(Link::Directed { source, target }) = &link.link_data else {
            panic!("based-at should be a directed link");
        };
        assert_eq!(source.entity_id, aircraft.metadata.record_id.entity_id);
        assert_eq!(
            target.entity_id,
            entity(entities, web_id, "airfield", "ESSA")
                .metadata
                .record_id
                .entity_id
        );
        records.insert(format!("based-at/{tail}/ESSA"), link);
    }
    let names: HashMap<_, _> = records
        .iter()
        .map(|(name, entity)| (entity.metadata.record_id.entity_id, name))
        .collect();
    let snapshot: BTreeMap<_, _> = records
        .iter()
        .map(|(name, entity)| {
            assert_eq!(entity.metadata.provenance.created_by_id, actor.into());
            let link = entity.link_data.as_ref().map(|Link::Directed { source, target }| {
                json!({
                    "source": names.get(&source.entity_id).expect("the link source should be stored"),
                    "target": names.get(&target.entity_id).expect("the link target should be stored"),
                })
            });
            (name, json!({
                "entityTypeIds": entity.metadata.entity_type_ids,
                "properties": entity.properties,
                "propertyMetadata": entity.metadata.properties,
                "readOnly": entity.metadata.read_only,
                "archived": entity.metadata.archived,
                "provenance": entity.metadata.provenance.edition.provided,
                "link": link,
            }))
        })
        .collect();
    insta::with_settings!({sort_maps => true}, {
        insta::assert_json_snapshot!("aviation", snapshot);
    });
}

#[tokio::test]
async fn delivery_replay() {
    let pool = database::pool();
    let mut store = pool
        .acquire(None)
        .await
        .expect("the aviation database connection should open");
    let (actor, web_id) = seed(&mut store).await;
    let directory = TempDir::new().expect("the workspace directory should be created");
    let workspace = Workspace::open(
        directory.path().join("aviation.duckdb"),
        WorkspaceConfig::default(),
    )
    .await
    .expect("the aviation workspace should open");
    let plan = plan(&workspace, web_id).await;
    let host = std::env::var("HASH_GRAPH_HTTP_HOST").unwrap_or_else(|_| "127.0.0.1".to_owned());
    let port = std::env::var("HASH_GRAPH_HTTP_PORT").unwrap_or_else(|_| "4000".to_owned());
    let client = GraphClient::new(
        &Url::parse(&format!("http://{host}:{port}")).expect("the Graph URL should be valid"),
        Secret::from_string(
            std::env::var("HASH_GRAPH_SERVICE_SECRET")
                .expect("the Graph service secret should be configured"),
        ),
    )
    .expect("the Graph client should be configured");
    for expected in [Applied::Created, Applied::Patched] {
        for write in plan.writes() {
            assert_eq!(
                client
                    .send(actor.into(), write)
                    .await
                    .expect("the Graph should apply the aviation write"),
                expected
            );
        }
        assert_data(&read(&mut store, actor, web_id).await, actor, web_id);
    }
}
