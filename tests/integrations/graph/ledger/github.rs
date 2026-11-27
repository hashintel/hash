//! Adds the types of the GitHub example to a user's web in the local HASH stack, and makes the
//! web's machine its administrator, so that `hash-integrations-follow` can write the repository's
//! issues and pull requests there as that machine. A user may create an integration's entities,
//! which are read-only, but not update them.
//!
//! ```sh
//! HASH_LEDGER_WEB=alice cargo nextest run -p hash-integrations-graph-tests --test ledger \
//!     --run-ignored only -E 'test(github_types_in_local_web)' --no-capture
//! ```

use hash_graph_authorization::policies::store::PrincipalStore as _;
use hash_graph_store::{
    account::AccountStore as _,
    entity_type::{CreateEntityTypeParams, EntityTypeStore as _},
    pool::StorePool as _,
    property_type::{CreatePropertyTypeParams, PropertyTypeStore as _},
    query::ConflictBehavior,
};
use serde::Deserialize;
use type_system::{
    ontology::{
        entity_type::EntityType,
        property_type::PropertyType,
        provenance::{OntologyOwnership, ProvidedOntologyEditionProvenance},
    },
    principal::{
        actor::{ActorId, UserId},
        role::RoleName,
    },
    provenance::{OriginProvenance, OriginType},
};

use super::database;

/// The property and entity types of the GitHub example.
#[derive(Deserialize)]
struct Ontology {
    #[serde(rename = "propertyTypes")]
    properties: Vec<PropertyType>,
    #[serde(rename = "entityTypes")]
    entities: Vec<EntityType>,
}

#[tokio::test]
#[ignore = "writes to the local HASH stack, which must be running"]
async fn github_types_in_local_web() {
    let shortname = std::env::var("HASH_LEDGER_WEB").unwrap_or_else(|_| "alice".to_owned());
    let pool = database::pool();
    let mut store = pool
        .acquire(None)
        .await
        .expect("a database connection should open");
    let system = store
        .get_or_create_system_machine("h")
        .await
        .expect("the system actor should exist");
    let web = store
        .get_web_by_shortname(system.into(), &shortname)
        .await
        .expect("the web should be readable")
        .unwrap_or_else(|| panic!("there should be a user `{shortname}`"))
        .id;
    let actor = ActorId::User(UserId::new(web));
    let machine = store
        .get_machine_by_identifier(system.into(), &format!("system-{web}"))
        .await
        .expect("the web's machine should be readable")
        .unwrap_or_else(|| panic!("the web of `{shortname}` should have a machine"))
        .id;
    // A machine is a member of its web, and the follower needs to administer it.
    store
        .unassign_role(actor, machine.into(), web.into(), RoleName::Member)
        .await
        .expect("the machine's member role should be removed");
    store
        .assign_role(actor, machine.into(), web.into(), RoleName::Administrator)
        .await
        .expect("the machine should administer the web");

    let ontology: Ontology = serde_json::from_str(include_str!(
        "../../../../libs/@local/integrations/collect/examples/github/ontology.json"
    ))
    .expect("the GitHub ontology should be valid");
    let provenance = ProvidedOntologyEditionProvenance {
        actor_type: actor.actor_type(),
        origin: OriginProvenance::from_empty_type(OriginType::Api),
        sources: Vec::new(),
    };
    store
        .create_property_types(
            actor,
            ontology
                .properties
                .into_iter()
                .map(|schema| CreatePropertyTypeParams {
                    schema,
                    ownership: OntologyOwnership::Local { web_id: web },
                    conflict_behavior: ConflictBehavior::Skip,
                    provenance: provenance.clone(),
                }),
        )
        .await
        .expect("the property types should be added");
    store
        .create_entity_types(
            actor,
            ontology
                .entities
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
        .expect("the entity types should be added");

    println!("HASH_WEB_ID={web} HASH_ACTOR_ID={machine}");
}
