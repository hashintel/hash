use std::collections::HashMap;

use hash_graph_authorization::policies::store::{PolicyStore as _, PrincipalStore as _};
use hash_graph_postgres_store::store::{PooledConnection, PostgresStore};
use hash_graph_store::{
    account::{AccountStore as _, CreateUserActorParams},
    data_type::{CreateDataTypeParams, DataTypeStore as _},
    entity_type::{CreateEntityTypeParams, EntityTypeStore as _},
    property_type::{CreatePropertyTypeParams, PropertyTypeStore as _},
    query::ConflictBehavior,
};
use hash_graph_test_data::{data_type, entity_type};
use serde::Deserialize;
use type_system::{
    ontology::{
        data_type::DataType,
        entity_type::EntityType,
        property_type::PropertyType,
        provenance::{OntologyOwnership, ProvidedOntologyEditionProvenance},
    },
    principal::{actor::ActorId, actor_group::WebId, role::RoleName},
    provenance::{OriginProvenance, OriginType},
};

#[derive(Deserialize)]
struct OntologyFixture {
    #[serde(rename = "dataTypes")]
    data: Vec<DataType>,
    #[serde(rename = "propertyTypes")]
    properties: Vec<PropertyType>,
    #[serde(rename = "entityTypes")]
    entities: Vec<EntityType>,
}

pub(super) async fn seed(store: &mut PostgresStore<PooledConnection>) -> (ActorId, WebId) {
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
        origin: OriginProvenance::from_empty_type(OriginType::Api),
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
