use alloc::sync::Arc;
use std::collections::HashMap;

use hash_graph_authorization::policies::store::{PolicyStore as _, PrincipalStore as _};
use hash_graph_postgres_store::store::{AsClient as _, PostgresStore, PostgresStoreSettings};
use hash_graph_store::{
    account::{AccountStore as _, CreateUserActorParams},
    data_type::{CreateDataTypeParams, DataTypeStore as _},
    entity::{CreateEntityParams, EntityStore as _},
    entity_type::{CreateEntityTypeParams, EntityTypeStore as _},
    migration::StoreMigration as _,
    property_type::{CreatePropertyTypeParams, PropertyTypeStore as _},
    query::ConflictBehavior,
};
use hash_graph_test_data::{data_type, entity, entity_type, property_type};
use tokio_postgres::{Client, NoTls};
use type_system::{
    knowledge::{
        Confidence,
        entity::{EntityId, LinkData, provenance::ProvidedEntityEditionProvenance},
        property::{PropertyObject, PropertyObjectWithMetadata, metadata::PropertyProvenance},
    },
    ontology::{
        data_type::DataType,
        entity_type::EntityType,
        id::VersionedUrl,
        property_type::PropertyType,
        provenance::{OntologyOwnership, ProvidedOntologyEditionProvenance},
    },
    principal::{
        actor::{ActorEntityUuid, ActorType, MachineId},
        actor_group::WebId,
    },
    provenance::{OriginProvenance, OriginType},
};

/// Entity IDs created during seeding, needed by tests to construct queries
/// and provide inputs.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub(crate) struct SeededEntities {
    pub alice: EntityId,
    pub bob: EntityId,
    pub organization: EntityId,
    pub friend_link: EntityId,
}

const SEED_KEY: &str = "orchestrator_test_seed";

fn entity_type_id(json: &str) -> VersionedUrl {
    serde_json::from_str::<EntityType>(json)
        .expect("could not parse entity type")
        .id
}

const fn entity_provenance() -> ProvidedEntityEditionProvenance {
    ProvidedEntityEditionProvenance {
        actor_type: ActorType::User,
        origin: OriginProvenance::from_empty_type(OriginType::Api),
        sources: Vec::new(),
    }
}

/// Ensures the state table exists and returns the previously seeded entities
/// if seeding was already completed.
async fn load_existing_seed(
    store: &PostgresStore<Client>,
) -> Result<Option<SeededEntities>, Box<dyn core::error::Error>> {
    let client = store.as_client();

    client
        .execute(
            "CREATE TABLE IF NOT EXISTS _orchestrator_test_state (
                key TEXT PRIMARY KEY,
                value JSONB
            )",
            &[],
        )
        .await?;

    let row = client
        .query_opt(
            "SELECT value FROM _orchestrator_test_state WHERE key = $1",
            &[&SEED_KEY],
        )
        .await?;

    match row {
        Some(row) => {
            let value: serde_json::Value = row.get(0);
            let entities: SeededEntities = serde_json::from_value(value)?;
            Ok(Some(entities))
        }
        None => Ok(None),
    }
}

async fn save_seed(
    store: &PostgresStore<Client>,
    entities: &SeededEntities,
) -> Result<(), Box<dyn core::error::Error>> {
    let value = serde_json::to_value(entities)?;

    store
        .as_client()
        .execute(
            "INSERT INTO _orchestrator_test_state (key, value) VALUES ($1, $2)",
            &[&SEED_KEY, &value],
        )
        .await?;

    Ok(())
}

/// Connects to the database, runs migrations, and seeds test data if needed.
///
/// On a reused container where seeding already completed, returns the
/// previously stored entity IDs without creating duplicates.
pub(crate) async fn setup(
    host: &str,
    port: u16,
) -> Result<(PostgresStore<Client>, SeededEntities), Box<dyn core::error::Error>> {
    let (client, connection) = tokio_postgres::Config::new()
        .user("hash")
        .password("hash")
        .host(host)
        .port(port)
        .dbname("hash")
        .connect(NoTls)
        .await?;
    tokio::spawn(connection);

    let mut store = PostgresStore::new(client, None, Arc::new(PostgresStoreSettings::default()));
    store.run_migrations().await?;
    store.seed_system_policies().await?;

    if let Some(entities) = load_existing_seed(&store).await? {
        return Ok((store, entities));
    }

    let entities = seed_data(&mut store).await?;
    save_seed(&store, &entities).await?;

    Ok((store, entities))
}

async fn seed_data(
    store: &mut PostgresStore<Client>,
) -> Result<SeededEntities, Box<dyn core::error::Error>> {
    let system_account_id: MachineId = store.get_or_create_system_machine("h").await?;
    let user_id = store
        .create_user_actor(
            system_account_id.into(),
            CreateUserActorParams {
                user_id: None,
                shortname: Some("orchestrator-test".to_owned()),
                registration_complete: true,
            },
        )
        .await?
        .user_id;

    let actor_id: ActorEntityUuid = user_id.into();
    let web_id: WebId = user_id.into();

    let ontology_provenance = ProvidedOntologyEditionProvenance {
        actor_type: ActorType::User,
        origin: OriginProvenance::from_empty_type(OriginType::Api),
        sources: Vec::new(),
    };

    let ownership = OntologyOwnership::Local { web_id };

    store
        .create_data_types(
            actor_id,
            [data_type::TEXT_V1, data_type::NUMBER_V1]
                .into_iter()
                .map(|json| CreateDataTypeParams {
                    schema: serde_json::from_str::<DataType>(json)
                        .expect("could not parse data type"),
                    ownership: ownership.clone(),
                    conflict_behavior: ConflictBehavior::Skip,
                    provenance: ontology_provenance.clone(),
                    conversions: HashMap::new(),
                }),
        )
        .await?;

    store
        .create_property_types(
            actor_id,
            [
                property_type::NAME_V1,
                property_type::AGE_V1,
                property_type::BLURB_V1,
                property_type::PUBLISHED_ON_V1,
                property_type::ADDRESS_LINE_1_V1,
                property_type::CITY_V1,
                property_type::POSTCODE_NUMBER_V1,
                property_type::INTERESTS_V1,
                property_type::EMAIL_V1,
            ]
            .into_iter()
            .map(|json| CreatePropertyTypeParams {
                schema: serde_json::from_str::<PropertyType>(json)
                    .expect("could not parse property type"),
                ownership: ownership.clone(),
                conflict_behavior: ConflictBehavior::Skip,
                provenance: ontology_provenance.clone(),
            }),
        )
        .await?;

    store
        .create_entity_types(
            actor_id,
            [
                entity_type::LINK_V1,
                entity_type::link::FRIEND_OF_V1,
                entity_type::link::ACQUAINTANCE_OF_V1,
                entity_type::PERSON_V1,
                entity_type::ORGANIZATION_V1,
            ]
            .into_iter()
            .map(|json| CreateEntityTypeParams {
                schema: serde_json::from_str::<EntityType>(json)
                    .expect("could not parse entity type"),
                ownership: ownership.clone(),
                conflict_behavior: ConflictBehavior::Skip,
                provenance: ontology_provenance.clone(),
            }),
        )
        .await?;

    let alice_properties: PropertyObject =
        serde_json::from_str(entity::PERSON_ALICE_V1).expect("could not parse entity");
    let bob_properties: PropertyObject =
        serde_json::from_str(entity::PERSON_BOB_V1).expect("could not parse entity");
    let organization_properties: PropertyObject =
        serde_json::from_str(entity::ORGANIZATION_V1).expect("could not parse entity");

    let alice = store
        .create_entity(
            actor_id,
            CreateEntityParams {
                web_id,
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: std::collections::HashSet::from([entity_type_id(
                    entity_type::PERSON_V1,
                )]),
                properties: PropertyObjectWithMetadata::from_parts(alice_properties, None)
                    .expect("could not create property metadata"),
                confidence: None,
                link_data: None,
                draft: false,
                policies: Vec::new(),
                provenance: entity_provenance(),
            },
        )
        .await?;

    let bob = store
        .create_entity(
            actor_id,
            CreateEntityParams {
                web_id,
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: std::collections::HashSet::from([entity_type_id(
                    entity_type::PERSON_V1,
                )]),
                properties: PropertyObjectWithMetadata::from_parts(bob_properties, None)
                    .expect("could not create property metadata"),
                confidence: None,
                link_data: None,
                draft: false,
                policies: Vec::new(),
                provenance: entity_provenance(),
            },
        )
        .await?;

    let organization = store
        .create_entity(
            actor_id,
            CreateEntityParams {
                web_id,
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: std::collections::HashSet::from([entity_type_id(
                    entity_type::ORGANIZATION_V1,
                )]),
                properties: PropertyObjectWithMetadata::from_parts(organization_properties, None)
                    .expect("could not create property metadata"),
                confidence: None,
                link_data: None,
                draft: false,
                policies: Vec::new(),
                provenance: entity_provenance(),
            },
        )
        .await?;

    let alice_entity_id = alice.metadata.record_id.entity_id;
    let bob_entity_id = bob.metadata.record_id.entity_id;

    let friend_link = store
        .create_entity(
            actor_id,
            CreateEntityParams {
                web_id,
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: std::collections::HashSet::from([entity_type_id(
                    entity_type::link::FRIEND_OF_V1,
                )]),
                properties: PropertyObjectWithMetadata::from_parts(PropertyObject::empty(), None)
                    .expect("could not create property metadata"),
                confidence: None,
                link_data: Some(LinkData {
                    left_entity_id: alice_entity_id,
                    right_entity_id: bob_entity_id,
                    left_entity_confidence: Confidence::new(0.9),
                    left_entity_provenance: PropertyProvenance::default(),
                    right_entity_confidence: Confidence::new(0.8),
                    right_entity_provenance: PropertyProvenance::default(),
                }),
                draft: false,
                policies: Vec::new(),
                provenance: entity_provenance(),
            },
        )
        .await?;

    Ok(SeededEntities {
        alice: alice_entity_id,
        bob: bob_entity_id,
        organization: organization.metadata.record_id.entity_id,
        friend_link: friend_link.metadata.record_id.entity_id,
    })
}
