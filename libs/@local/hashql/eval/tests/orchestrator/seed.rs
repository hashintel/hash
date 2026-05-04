use std::collections::HashMap;

use error_stack::{Report, ResultExt as _};
use hash_graph_authorization::policies::store::{PolicyStore as _, PrincipalStore as _};
use hash_graph_postgres_store::store::{AsClient as _, PostgresStore};
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
use tokio_postgres::Client;
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

use crate::error::SetupError;

/// Entity IDs created during seeding, needed by tests to construct queries
/// and provide inputs.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub(crate) struct SeededEntities {
    pub alice: EntityId,
    pub bob: EntityId,
    pub organization: EntityId,
    pub friend_link: EntityId,
    pub draft_alice: EntityId,
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
) -> Result<Option<SeededEntities>, Report<SetupError>> {
    let client = store.as_client();

    client
        .execute(
            "CREATE TABLE IF NOT EXISTS _orchestrator_test_state (
                key TEXT PRIMARY KEY,
                value JSONB
            )",
            &[],
        )
        .await
        .change_context(SetupError::Seed)
        .attach("could not create state table")?;

    let row = client
        .query_opt(
            "SELECT value FROM _orchestrator_test_state WHERE key = $1",
            &[&SEED_KEY],
        )
        .await
        .change_context(SetupError::Seed)
        .attach("could not query seed state")?;

    match row {
        Some(row) => {
            let value: serde_json::Value = row.get(0);
            let entities: SeededEntities = serde_json::from_value(value)
                .change_context(SetupError::Seed)
                .attach("could not deserialize stored seed state")?;
            Ok(Some(entities))
        }
        None => Ok(None),
    }
}

async fn save_seed(
    store: &PostgresStore<Client>,
    entities: &SeededEntities,
) -> Result<(), Report<SetupError>> {
    let value = serde_json::to_value(entities)
        .change_context(SetupError::Seed)
        .attach("could not serialize seed state")?;

    store
        .as_client()
        .execute(
            "INSERT INTO _orchestrator_test_state (key, value) VALUES ($1, $2)",
            &[&SEED_KEY, &value],
        )
        .await
        .change_context(SetupError::Seed)
        .attach("could not persist seed state")?;

    Ok(())
}

/// Connects to the database, runs migrations, and seeds test data if needed.
///
/// On a reused container where seeding already completed, returns the
/// previously stored entity IDs without creating duplicates.
pub(crate) async fn setup(
    store: &mut PostgresStore<Client>,
) -> Result<SeededEntities, Report<SetupError>> {
    store
        .run_migrations()
        .await
        .change_context(SetupError::Migration)?;
    store
        .seed_system_policies()
        .await
        .change_context(SetupError::Seed)
        .attach("could not seed system policies")?;

    if let Some(entities) = load_existing_seed(store).await? {
        return Ok(entities);
    }

    let entities = seed_data(store).await?;
    save_seed(store, &entities).await?;

    Ok(entities)
}

/// Seeds all ontology types (data types, property types, entity types).
async fn seed_ontology(
    store: &mut PostgresStore<Client>,
    actor_id: ActorEntityUuid,
    ownership: &OntologyOwnership,
) -> Result<(), Report<SetupError>> {
    let ontology_provenance = ProvidedOntologyEditionProvenance {
        actor_type: ActorType::User,
        origin: OriginProvenance::from_empty_type(OriginType::Api),
        sources: Vec::new(),
    };

    store
        .create_data_types(
            actor_id,
            [
                data_type::VALUE_V1,
                data_type::TEXT_V1,
                data_type::NUMBER_V1,
            ]
            .into_iter()
            .map(|json| CreateDataTypeParams {
                schema: serde_json::from_str::<DataType>(json).expect("could not parse data type"),
                ownership: ownership.clone(),
                conflict_behavior: ConflictBehavior::Skip,
                provenance: ontology_provenance.clone(),
                conversions: HashMap::new(),
            }),
        )
        .await
        .change_context(SetupError::Seed)
        .attach("could not seed data types")?;

    store
        .create_property_types(
            actor_id,
            [
                // Leaf property types (no property type refs).
                property_type::NAME_V1,
                property_type::AGE_V1,
                property_type::FAVORITE_FILM_V1,
                property_type::FAVORITE_SONG_V1,
                property_type::HOBBY_V1,
                // Composite (refs leaf property types above).
                property_type::INTERESTS_V1,
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
        .await
        .change_context(SetupError::Seed)
        .attach("could not seed property types")?;

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
        .await
        .change_context(SetupError::Seed)
        .attach("could not seed entity types")?;

    Ok(())
}

/// Creates a non-link entity from a property JSON fixture and entity type JSON.
async fn create_entity(
    store: &mut PostgresStore<Client>,
    actor_id: ActorEntityUuid,
    web_id: WebId,
    entity_type_json: &str,
    properties_json: &str,
    draft: bool,
) -> Result<EntityId, Report<SetupError>> {
    let properties: PropertyObject =
        serde_json::from_str(properties_json).expect("could not parse entity properties");

    let entity = store
        .create_entity(
            actor_id,
            CreateEntityParams {
                web_id,
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: std::collections::HashSet::from([entity_type_id(
                    entity_type_json,
                )]),
                properties: PropertyObjectWithMetadata::from_parts(properties, None)
                    .expect("could not create property metadata"),
                confidence: None,
                link_data: None,
                draft,
                policies: Vec::new(),
                provenance: entity_provenance(),
            },
        )
        .await
        .change_context(SetupError::Seed)?;

    Ok(entity.metadata.record_id.entity_id)
}

async fn seed_data(
    store: &mut PostgresStore<Client>,
) -> Result<SeededEntities, Report<SetupError>> {
    let system_account_id: MachineId = store
        .get_or_create_system_machine("h")
        .await
        .change_context(SetupError::Seed)
        .attach("could not create system machine")?;
    let user_id = store
        .create_user_actor(
            system_account_id.into(),
            CreateUserActorParams {
                user_id: None,
                shortname: Some("orchestrator-test".to_owned()),
                registration_complete: true,
            },
        )
        .await
        .change_context(SetupError::Seed)
        .attach("could not create test user")?
        .user_id;

    let actor_id: ActorEntityUuid = user_id.into();
    let web_id: WebId = user_id.into();
    let ownership = OntologyOwnership::Local { web_id };

    seed_ontology(store, actor_id, &ownership).await?;

    let alice = create_entity(
        store,
        actor_id,
        web_id,
        entity_type::PERSON_V1,
        entity::PERSON_ALICE_V1,
        false,
    )
    .await?;

    let bob = create_entity(
        store,
        actor_id,
        web_id,
        entity_type::PERSON_V1,
        entity::PERSON_BOB_V1,
        false,
    )
    .await?;

    let organization = create_entity(
        store,
        actor_id,
        web_id,
        entity_type::ORGANIZATION_V1,
        entity::ORGANIZATION_V1,
        false,
    )
    .await?;

    let draft_alice = create_entity(
        store,
        actor_id,
        web_id,
        entity_type::PERSON_V1,
        entity::PERSON_ALICE_V1,
        true,
    )
    .await?;

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
                    left_entity_id: alice,
                    right_entity_id: bob,
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
        .await
        .change_context(SetupError::Seed)
        .attach("could not create friend-of link entity")?;

    Ok(SeededEntities {
        alice,
        bob,
        organization,
        friend_link: friend_link.metadata.record_id.entity_id,
        draft_alice,
    })
}
