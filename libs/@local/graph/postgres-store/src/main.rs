#![expect(
    unreachable_pub,
    clippy::print_stdout,
    clippy::print_stderr,
    clippy::panic_in_result_fn,
    clippy::std_instead_of_alloc
)]
#![feature(impl_trait_in_assoc_type)]
#![feature(type_alias_impl_trait)]
#![feature(hash_raw_entry)]
#![feature(let_chains)]
#![feature(never_type)]
#![feature(extend_one)]
#![expect(
    clippy::significant_drop_tightening,
    reason = "This should be enabled but it's currently too noisy"
)]

extern crate alloc;

use core::{error::Error, mem, str::FromStr as _};
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    io::BufRead as _,
};

use hash_graph_authorization::schema::{
    AccountGroupRelationAndSubject, DataTypeOwnerSubject, DataTypeRelationAndSubject,
    EntityAdministratorSubject, EntityEditorSubject, EntityOwnerSubject, EntityRelationAndSubject,
    EntityTypeOwnerSubject, EntityTypeRelationAndSubject, EntityViewerSubject,
    PropertyTypeOwnerSubject, PropertyTypeRelationAndSubject, WebEntityCreatorSubject,
    WebEntityEditorSubject, WebEntityViewerSubject, WebOwnerSubject, WebRelationAndSubject,
};
use hash_graph_temporal_versioning::OpenTemporalBound;
use hash_graph_types::{
    account::{AccountGroupId, AccountId},
    knowledge::{
        entity::{
            ActorType, Entity, EntityUuid, OriginProvenance, OriginType,
            ProvidedEntityEditionProvenance,
        },
        property::{Property, PropertyMetadata, PropertyObject},
    },
    ontology::ProvidedOntologyEditionProvenance,
    owned_by_id::OwnedById,
};
use serde_json::json;
use type_system::{
    Value,
    url::{BaseUrl, VersionedUrl},
};
use uuid::Uuid;

use crate::snapshot::{
    Account, AccountGroup, AuthorizationRelation, DataTypeEmbeddingRecord, DataTypeSnapshotRecord,
    EntityTypeEmbeddingRecord, EntityTypeSnapshotRecord, PropertyTypeEmbeddingRecord,
    PropertyTypeSnapshotRecord, SnapshotEntry, SnapshotMetadata, Web,
    entity::EntityEmbeddingRecord,
};

pub mod snapshot;
pub mod store;

fn create_system_type_namespace_mapping() -> Result<BTreeMap<String, String>, Box<dyn Error>> {
    let data_types =
        serde_json::from_str::<Vec<String>>(include_str!("../system-data-types.json"))?;
    let property_types =
        serde_json::from_str::<Vec<String>>(include_str!("../system-property-types.json"))?;
    let entity_types =
        serde_json::from_str::<Vec<String>>(include_str!("../system-entity-types.json"))?;
    let link_types =
        serde_json::from_str::<Vec<String>>(include_str!("../system-link-types.json"))?;

    Ok(data_types
        .into_iter()
        .chain(property_types)
        .chain(entity_types)
        .chain(link_types)
        .map(|type_url| {
            let mapped = type_url.replace("/@hash/", "/@h/");
            (type_url, mapped)
        })
        .collect())
}

const ENTITY_PROVENANCE_USER: ProvidedEntityEditionProvenance = ProvidedEntityEditionProvenance {
    sources: Vec::new(),
    actor_type: Some(ActorType::Human),
    origin: Some(OriginProvenance::from_empty_type(OriginType::WebApp)),
};
const ENTITY_PROVENANCE_MACHINE: ProvidedEntityEditionProvenance =
    ProvidedEntityEditionProvenance {
        sources: Vec::new(),
        actor_type: Some(ActorType::Machine),
        origin: Some(OriginProvenance::from_empty_type(OriginType::Api)),
    };
const ENTITY_PROVENANCE_BROWSER_EXT: ProvidedEntityEditionProvenance =
    ProvidedEntityEditionProvenance {
        sources: Vec::new(),
        actor_type: Some(ActorType::Human),
        origin: Some(OriginProvenance::from_empty_type(
            OriginType::BrowserExtension,
        )),
    };

const ENTITIES_TO_RETAIN: [(&str, ProvidedEntityEditionProvenance); 9] = [
    (
        "https://hash.ai/@h/types/entity-type/browser-plugin-settings/",
        ENTITY_PROVENANCE_BROWSER_EXT,
    ),
    (
        "https://hash.ai/@h/types/entity-type/has-avatar/",
        ENTITY_PROVENANCE_USER,
    ),
    (
        "https://hash.ai/@h/types/entity-type/has-cover-image/",
        ENTITY_PROVENANCE_USER,
    ),
    (
        "https://hash.ai/@h/types/entity-type/image-file/",
        ENTITY_PROVENANCE_USER,
    ),
    (
        "https://hash.ai/@h/types/entity-type/is-member-of/",
        ENTITY_PROVENANCE_USER,
    ),
    (
        "https://hash.ai/@h/types/entity-type/machine/",
        ENTITY_PROVENANCE_MACHINE,
    ),
    (
        "https://hash.ai/@h/types/entity-type/organization/",
        ENTITY_PROVENANCE_USER,
    ),
    (
        "https://hash.ai/@h/types/entity-type/prospective-user/",
        ENTITY_PROVENANCE_MACHINE,
    ),
    (
        "https://hash.ai/@h/types/entity-type/user/",
        ENTITY_PROVENANCE_USER,
    ),
];

// Creator of HASH-instance entity
const OLD_SYSTEM_ACCOUNT_ID: AccountId =
    AccountId::new(Uuid::from_u128(0x8D86C8C3_D66D_43D1_859B_676C3BCAEADC));
// Generated when running API migrations
const NEW_SYSTEM_ACCOUNT_ID: AccountId =
    AccountId::new(Uuid::from_u128(0x065D5C74_C7BC_4138_929E_02AA4DDC4FB9));

// Account of the HASH-ai machine
const OLD_HASH_AI_ACCOUNT_ID: AccountId =
    AccountId::new(Uuid::from_u128(0x5DF73B08_0BD8_4AC3_A699_B842EEF9F797));
// Generated when running API migrations
const NEW_HASH_AI_ACCOUNT_ID: AccountId =
    AccountId::new(Uuid::from_u128(0x3940C0CC_3A37_4DCA_A586_0F34294CAA4A));

// Administrator of HASH-instance entity
const OLD_INSTANCE_ADMIN_ACCOUNT_GROUP_ID: AccountGroupId =
    AccountGroupId::new(Uuid::from_u128(0x95A3E999_2023_4B3E_B5C7_B9BEC51A3624));
// Generated when running API migrations
const NEW_INSTANCE_ADMIN_ACCOUNT_GROUP_ID: AccountGroupId =
    AccountGroupId::new(Uuid::from_u128(0xFA4472BB_54B8_42B1_B731_61C726D76AA5));

type EntityMapValue = (
    Vec<Entity>,
    Vec<EntityRelationAndSubject>,
    Vec<EntityEmbeddingRecord>,
);
struct SnapshotData {
    metadata: SnapshotMetadata,
    accounts: HashSet<AccountId>,
    account_groups: HashMap<AccountGroupId, Vec<AccountGroupRelationAndSubject>>,
    webs: HashMap<OwnedById, Vec<WebRelationAndSubject>>,

    data_types: BTreeMap<VersionedUrl, (DataTypeSnapshotRecord, DataTypeEmbeddingRecord)>,
    property_types: BTreeMap<
        VersionedUrl,
        (
            PropertyTypeSnapshotRecord,
            Option<PropertyTypeEmbeddingRecord>,
        ),
    >,
    entity_types:
        BTreeMap<VersionedUrl, (EntityTypeSnapshotRecord, Option<EntityTypeEmbeddingRecord>)>,
    entities: HashMap<EntityUuid, EntityMapValue>,
}

impl SnapshotData {
    #[expect(clippy::too_many_lines)]
    fn from_stdin() -> Result<Self, Box<dyn Error>> {
        let old_system_account_id_string = OLD_SYSTEM_ACCOUNT_ID.to_string();
        let new_system_account_id_string = NEW_SYSTEM_ACCOUNT_ID.to_string();
        let old_hash_ai_account_id_string = OLD_HASH_AI_ACCOUNT_ID.to_string();
        let new_hash_ai_account_id_string = NEW_HASH_AI_ACCOUNT_ID.to_string();
        let old_instance_admin_account_group_id_string =
            OLD_INSTANCE_ADMIN_ACCOUNT_GROUP_ID.to_string();
        let new_instance_admin_account_group_id_string =
            NEW_INSTANCE_ADMIN_ACCOUNT_GROUP_ID.to_string();

        let mut ontology_type_mappings = create_system_type_namespace_mapping()?;
        let namespace_to_retain = HashMap::<&str, ProvidedOntologyEditionProvenance>::from([
            (
                "https://hash.ai/@hash/",
                ProvidedOntologyEditionProvenance {
                    sources: Vec::new(),
                    actor_type: Some(ActorType::Human),
                    origin: Some(OriginProvenance::from_empty_type(OriginType::WebApp)),
                },
            ),
            (
                "https://blockprotocol.org/@blockprotocol/types/entity-type/followed-by/",
                ProvidedOntologyEditionProvenance {
                    sources: Vec::new(),
                    actor_type: Some(ActorType::Machine),
                    origin: Some(OriginProvenance::from_empty_type(OriginType::Api)),
                },
            ),
        ]);

        "https://hash.ai/@h/types/entity-type/image-file/".clone_into(
            ontology_type_mappings
                .get_mut("https://hash.ai/@hash/types/entity-type/image/")
                .expect("mapping should exist"),
        );
        ontology_type_mappings.insert(
            r#""https://hash.ai/@ciaran/types/entity-type/employed-by/v/3":{"#.to_owned(),
            r#""https://hash.ai/@hash/types/entity-type/employed-by/v/2":{"#.to_owned(),
        );

        let mut accounts = HashSet::new();
        let mut account_groups = HashMap::new();
        let mut webs = HashMap::new();
        let mut data_types = BTreeMap::new();
        let mut data_type_embeddings = HashMap::new();
        let mut property_types = BTreeMap::new();
        let mut property_type_embeddings = HashMap::new();
        let mut entity_types = BTreeMap::new();
        let mut entity_type_embeddings = HashMap::new();
        let mut entities: HashMap<EntityUuid, Vec<Entity>> = HashMap::new();
        let mut entity_relations: HashMap<EntityUuid, Vec<EntityRelationAndSubject>> =
            HashMap::new();
        let mut entity_embeddings: HashMap<EntityUuid, Vec<EntityEmbeddingRecord>> = HashMap::new();
        let mut entities_by_type = BTreeMap::<VersionedUrl, (usize, usize)>::new();
        // let mut user_entities = HashMap::new();
        // let mut prospective_user_entities = HashMap::new();
        // let mut hash_machine = None;
        // let mut hash_ai_machine = None;
        // let mut system_machine_entities = HashMap::new();
        // let mut org_entities = HashMap::new();
        let mut snapshot_metadata = None;

        'line: for line in std::io::BufReader::new(std::io::stdin().lock()).lines() {
            let mut line = line?;

            // We can skip the loop if `@hash` does not appear in the line
            if line.contains("/@hash/") {
                for (old, new) in &ontology_type_mappings {
                    line = line.replace(old, new);
                }
            }
            line = line.replace(&old_system_account_id_string, &new_system_account_id_string);
            line = line.replace(
                &old_hash_ai_account_id_string,
                &new_hash_ai_account_id_string,
            );
            line = line.replace(
                &old_instance_admin_account_group_id_string,
                &new_instance_admin_account_group_id_string,
            );

            match serde_json::from_str::<SnapshotEntry>(&line)? {
                SnapshotEntry::Snapshot(metadata) => {
                    snapshot_metadata = Some(metadata);
                }
                SnapshotEntry::Account(account) => {
                    accounts.insert(account.id);
                }
                SnapshotEntry::AccountGroup(account_group) => {
                    account_groups.insert(account_group.id, account_group.relations);
                }
                SnapshotEntry::Web(web) => {
                    webs.insert(web.id, web.relations);
                }
                SnapshotEntry::DataType(mut data_type) => {
                    for (namespace, provenance) in &namespace_to_retain {
                        if !data_type.schema.id.base_url.as_str().starts_with(namespace) {
                            continue;
                        }

                        let data_type_provenance =
                            &mut data_type.metadata.provenance.edition.user_defined;
                        if data_type_provenance.actor_type.is_none() {
                            data_type_provenance
                                .actor_type
                                .clone_from(&provenance.actor_type);
                        }
                        if data_type_provenance.origin.is_none() {
                            data_type_provenance.origin.clone_from(&provenance.origin);
                        }

                        data_types.insert(data_type.schema.id.clone(), data_type);
                        continue 'line;
                    }
                    eprintln!("- Removed {}", data_type.schema.id);
                }
                SnapshotEntry::DataTypeEmbedding(data_type_embedding) => {
                    data_type_embeddings.insert(
                        data_type_embedding.data_type_id.clone(),
                        data_type_embedding,
                    );
                }
                SnapshotEntry::PropertyType(mut property_type) => {
                    for (namespace, provenance) in &namespace_to_retain {
                        if !property_type
                            .schema
                            .id
                            .base_url
                            .as_str()
                            .starts_with(namespace)
                        {
                            continue;
                        }

                        let property_type_provenance =
                            &mut property_type.metadata.provenance.edition.user_defined;
                        if property_type_provenance.actor_type.is_none() {
                            property_type_provenance
                                .actor_type
                                .clone_from(&provenance.actor_type);
                        }
                        if property_type_provenance.origin.is_none() {
                            property_type_provenance
                                .origin
                                .clone_from(&provenance.origin);
                        }

                        property_types.insert(property_type.schema.id.clone(), property_type);
                        continue 'line;
                    }
                    eprintln!("- Removed {}", property_type.schema.id);
                }
                SnapshotEntry::PropertyTypeEmbedding(property_type_embedding) => {
                    property_type_embeddings.insert(
                        property_type_embedding.property_type_id.clone(),
                        property_type_embedding,
                    );
                }
                SnapshotEntry::EntityType(mut entity_type) => {
                    for (namespace, provenance) in &namespace_to_retain {
                        if !entity_type
                            .schema
                            .id
                            .base_url
                            .as_str()
                            .starts_with(namespace)
                        {
                            continue;
                        }

                        let entity_type_provenance =
                            &mut entity_type.metadata.provenance.edition.user_defined;
                        if entity_type_provenance.actor_type.is_none() {
                            entity_type_provenance
                                .actor_type
                                .clone_from(&provenance.actor_type);
                        }
                        if entity_type_provenance.origin.is_none() {
                            entity_type_provenance.origin.clone_from(&provenance.origin);
                        }

                        entity_types.insert(entity_type.schema.id.clone(), entity_type);
                        continue 'line;
                    }
                    eprintln!("- Removed {}", entity_type.schema.id);
                }
                SnapshotEntry::EntityTypeEmbedding(entity_type_embedding) => {
                    entity_type_embeddings.insert(
                        entity_type_embedding.entity_type_id.clone(),
                        entity_type_embedding,
                    );
                }
                SnapshotEntry::Entity(entity) => {
                    for entity_type_id in &entity.metadata.entity_type_ids {
                        let (total, latest) =
                            entities_by_type.entry(entity_type_id.clone()).or_default();
                        if *entity.metadata.temporal_versioning.decision_time.end()
                            == OpenTemporalBound::Unbounded
                        {
                            // Only count entities that are still active, otherwise updated entities
                            // would be counted twice
                            *total += 1;
                            if *entity.metadata.temporal_versioning.transaction_time.end()
                                == OpenTemporalBound::Unbounded
                            {
                                *latest += 1;
                            }
                        }
                    }
                    entities
                        .entry(entity.metadata.record_id.entity_id.entity_uuid)
                        .or_default()
                        .push(*entity);
                }
                SnapshotEntry::EntityEmbedding(entity_embedding) => {
                    entity_embeddings
                        .entry(entity_embedding.entity_id.entity_uuid)
                        .or_default()
                        .push(entity_embedding);
                }
                SnapshotEntry::Relation(AuthorizationRelation::Entity {
                    object,
                    relationship,
                }) => {
                    entity_relations
                        .entry(object)
                        .or_default()
                        .push(relationship);
                }
            }
        }

        Ok(Self {
            metadata: snapshot_metadata.expect("Missing snapshot metadata"),
            accounts,
            account_groups,
            webs,
            data_types: data_types
                .into_iter()
                .map(|(url, data_type)| {
                    let embedding = data_type_embeddings
                        .remove(&url)
                        .unwrap_or_else(|| panic!("Missing embedding for data type: {url}"));
                    (url, (*data_type, embedding))
                })
                .collect(),
            property_types: property_types
                .into_iter()
                .map(|(url, property_type)| {
                    let embedding = property_type_embeddings.remove(&url);
                    (url, (*property_type, embedding))
                })
                .collect(),
            entity_types: entity_types
                .into_iter()
                .map(|(url, entity_type)| {
                    let embedding = entity_type_embeddings.remove(&url);
                    (url, (*entity_type, embedding))
                })
                .collect(),
            entities: entities
                .into_iter()
                .map(|(entity_uuid, editions)| {
                    (
                        entity_uuid,
                        (
                            editions,
                            entity_relations.remove(&entity_uuid).unwrap_or_default(),
                            entity_embeddings.remove(&entity_uuid).unwrap_or_default(),
                        ),
                    )
                })
                .collect(),
        })
    }

    fn print_full_snapshot(&self) {
        println!("{}", json!(SnapshotEntry::Snapshot(self.metadata.clone())));
        self.print_accounts();
        self.print_account_groups();
        self.print_webs();
        self.print_data_types();
        self.print_property_types();
        self.print_entity_types();
        self.print_entities();
        self.print_entity_relations();
        self.print_data_type_embeddings();
        self.print_property_type_embeddings();
        self.print_entity_type_embeddings();
        self.print_entity_embeddings();
    }

    fn print_accounts(&self) {
        for account_id in &self.accounts {
            println!(
                "{}",
                json!(SnapshotEntry::Account(Account { id: *account_id }))
            );
        }
    }

    fn print_account_groups(&self) {
        for (account_group_id, relations) in &self.account_groups {
            println!(
                "{}",
                json!(SnapshotEntry::AccountGroup(AccountGroup {
                    id: *account_group_id,
                    relations: relations.clone(),
                }))
            );
        }
    }

    fn print_webs(&self) {
        for (owned_by_id, relations) in &self.webs {
            println!(
                "{}",
                json!(SnapshotEntry::Web(Web {
                    id: *owned_by_id,
                    relations: relations.clone(),
                }))
            );
        }
    }

    fn print_data_types(&self) {
        for (data_type, _) in self.data_types.values() {
            println!(
                "{}",
                json!(SnapshotEntry::DataType(Box::new(data_type.clone())))
            );
        }
    }

    fn print_data_type_embeddings(&self) {
        for (_, embedding) in self.data_types.values() {
            println!(
                "{}",
                json!(SnapshotEntry::DataTypeEmbedding(embedding.clone()))
            );
        }
    }

    fn print_property_types(&self) {
        for (property_type, _) in self.property_types.values() {
            println!(
                "{}",
                json!(SnapshotEntry::PropertyType(Box::new(property_type.clone())))
            );
        }
    }

    fn print_property_type_embeddings(&self) {
        for (_, embedding) in self.property_types.values() {
            if let Some(embedding) = embedding {
                println!(
                    "{}",
                    json!(SnapshotEntry::PropertyTypeEmbedding(embedding.clone()))
                );
            }
        }
    }

    fn print_entity_types(&self) {
        for (entity_type, _) in self.entity_types.values() {
            println!(
                "{}",
                json!(SnapshotEntry::EntityType(Box::new(entity_type.clone())))
            );
        }
    }

    fn print_entity_type_embeddings(&self) {
        for (_, embedding) in self.entity_types.values() {
            if let Some(embedding) = embedding {
                println!(
                    "{}",
                    json!(SnapshotEntry::EntityTypeEmbedding(embedding.clone()))
                );
            }
        }
    }

    fn print_entities(&self) {
        for (editions, _, _) in self.entities.values() {
            for edition in editions {
                println!(
                    "{}",
                    json!(SnapshotEntry::Entity(Box::new(edition.clone())))
                );
            }
        }
    }

    fn print_entity_relations(&self) {
        for (entity_uuid, (_, relations, _)) in &self.entities {
            for relation in relations {
                println!(
                    "{}",
                    json!(SnapshotEntry::Relation(AuthorizationRelation::Entity {
                        object: *entity_uuid,
                        relationship: *relation,
                    }))
                );
            }
        }
    }

    fn print_entity_embeddings(&self) {
        for (_, _, embeddings) in self.entities.values() {
            for embedding in embeddings {
                println!(
                    "{}",
                    json!(SnapshotEntry::EntityEmbedding(embedding.clone()))
                );
            }
        }
    }

    fn filter_entities_by_type(&mut self) {
        let entities_to_retain = HashMap::from(ENTITIES_TO_RETAIN);
        let current_num_entities = self.entities.len();
        self.entities.retain(|_, (editions, _, _)| {
            editions.iter_mut().all(|edition| {
                let entity_provenance = &mut edition.metadata.provenance.edition.provided;
                edition.metadata.entity_type_ids.iter().any(|entity_type| {
                    // We simply use the first provenance field we find
                    if let Some(provenance) = entities_to_retain.get(entity_type.base_url.as_str())
                    {
                        if entity_provenance.actor_type.is_none() {
                            entity_provenance
                                .actor_type
                                .clone_from(&provenance.actor_type);
                        }
                        if entity_provenance.origin.is_none() {
                            entity_provenance.origin.clone_from(&provenance.origin);
                        }
                        true
                    } else {
                        false
                    }
                })
            })
        });
        eprintln!(
            "Removed {} entities due to filtered type",
            current_num_entities - self.entities.len()
        );
    }

    fn filter_entities_by_invalid_links(&mut self) {
        let current_num_entities = self.entities.len();
        loop {
            let current_entities = self.entities.keys().copied().collect::<HashSet<_>>();
            self.entities.retain(|entity_uuid, (editions, _, _)| {
                let retain = editions.iter().all(|edition| {
                    edition.link_data.as_ref().is_none_or(|link_data| {
                        current_entities.contains(&link_data.left_entity_id.entity_uuid)
                            && current_entities.contains(&link_data.right_entity_id.entity_uuid)
                    })
                });

                if !retain {
                    eprintln!("Removed entity due to invalid link data {entity_uuid}");
                }
                retain
            });
            if self.entities.len() == current_entities.len() {
                break;
            }
        }
        eprintln!(
            "Removed {} entities due to wrong link data",
            current_num_entities - self.entities.len()
        );
    }

    fn fix_entity_provenance(&mut self) {
        let uri_data_type_baseurl =
            BaseUrl::new("https://hash.ai/@h/types/data-type/uri/".to_owned())
                .expect("should be a valid Base URL");
        let email_data_type_baseurl =
            BaseUrl::new("https://hash.ai/@h/types/data-type/email/".to_owned())
                .expect("should be a valid Base URL");

        for (editions, _, _) in self.entities.values_mut() {
            for edition in editions {
                for (key, metadata) in &mut edition.metadata.properties.value {
                    match key.as_str() {
                        "https://hash.ai/@h/types/property-type/email/" => match metadata {
                            PropertyMetadata::Array { value: array, .. } => {
                                for value in array {
                                    if let PropertyMetadata::Value { metadata } = value {
                                        if let Some(data_type_id) = &mut metadata.data_type_id {
                                            data_type_id.base_url = email_data_type_baseurl.clone();
                                            metadata.canonical.clear();
                                            metadata.original_data_type_id = None;
                                        }
                                    }
                                }
                            }
                            PropertyMetadata::Value { metadata } => {
                                if let Some(data_type_id) = &mut metadata.data_type_id {
                                    data_type_id.base_url = email_data_type_baseurl.clone();
                                    metadata.canonical.clear();
                                    metadata.original_data_type_id = None;
                                }
                            }
                            PropertyMetadata::Object { .. } => {}
                        },
                        "https://hash.ai/@h/types/property-type/website-url/"
                        | "https://hash.ai/@h/types/property-type/pinned-entity-type-base-url/" => {
                            match metadata {
                                PropertyMetadata::Array { value: array, .. } => {
                                    for value in array {
                                        if let PropertyMetadata::Value { metadata } = value {
                                            if let Some(data_type_id) = &mut metadata.data_type_id {
                                                data_type_id.base_url =
                                                    uri_data_type_baseurl.clone();
                                                metadata.canonical.clear();
                                                metadata.original_data_type_id = None;
                                            }
                                        }
                                    }
                                }
                                PropertyMetadata::Value { metadata } => {
                                    if let Some(data_type_id) = &mut metadata.data_type_id {
                                        data_type_id.base_url = uri_data_type_baseurl.clone();
                                        metadata.canonical.clear();
                                        metadata.original_data_type_id = None;
                                    }
                                }
                                PropertyMetadata::Object { .. } => {}
                            }
                        }
                        _ => {}
                    }
                }

                edition.properties = PropertyObject::new(
                    mem::take(&mut edition.properties)
                        .into_iter()
                        .map(|(key, mut value)| {
                            if key.as_str() == "https://hash.ai/@h/types/property-type/website-url/"
                            {
                                if let Property::Value(Value::String(value)) = &mut value {
                                    if !value.starts_with("http") {
                                        *value = format!("https://{value}");
                                    }
                                }
                            }
                            (key, value)
                        })
                        .collect(),
                );
            }
        }
    }

    fn replace_machine_user_uuid(&mut self) {
        let entity_uuids = self
            .entities
            .keys()
            .copied()
            .collect::<HashSet<EntityUuid>>();
        self.entities = mem::take(&mut self.entities)
            .into_iter()
            .map(|(entity_uuid, (mut editions, relations, mut embeddings))| {
                if let Some(edition) = editions.iter().find(|edition| {
                    edition
                        .metadata
                        .entity_type_ids
                        .iter()
                        .any(|entity_type_id| {
                            entity_type_id.base_url.as_str()
                                == "https://hash.ai/@h/types/entity-type/machine/"
                        })
                }) {
                    let new_entity_uuid = EntityUuid::new(
                        edition
                            .metadata
                            .provenance
                            .inferred
                            .created_by_id
                            .into_uuid(),
                    );
                    assert!(
                        !entity_uuids.contains(&new_entity_uuid),
                        "Duplicate entity UUID: {new_entity_uuid}"
                    );
                    for edition in &mut editions {
                        edition.metadata.record_id.entity_id.entity_uuid = new_entity_uuid;
                    }
                    for embedding in &mut embeddings {
                        embedding.entity_id.entity_uuid = new_entity_uuid;
                    }
                    (new_entity_uuid, (editions, relations, embeddings))
                } else {
                    (entity_uuid, (editions, relations, embeddings))
                }
            })
            .collect();
    }

    fn filter_users_without_account(&mut self) {
        let mut found_user_entities = 0;
        let mut removed_user_entities = 0;
        self.entities.retain(|entity_uuid, (editions, _, _)| {
            let is_user = editions.iter().any(|edition| {
                edition
                    .metadata
                    .entity_type_ids
                    .iter()
                    .any(|entity_type_id| {
                        entity_type_id.base_url.as_str()
                            == "https://hash.ai/@h/types/entity-type/user/"
                    })
            });
            if is_user {
                found_user_entities += 1;
                let retain = self
                    .accounts
                    .contains(&AccountId::new(entity_uuid.into_uuid()));
                if !retain {
                    removed_user_entities += 1;
                }
                retain
            } else {
                true
            }
        });
        eprintln!(
            "Removed {}/{}=>{} user entities due to missing account ({})",
            removed_user_entities,
            found_user_entities,
            found_user_entities - removed_user_entities,
            self.accounts.len(),
        );
    }

    fn filter_machines_without_account(&mut self) {
        let mut found_machine_entities = 0;
        let mut removed_machine_entities = 0;
        self.entities.retain(|entity_uuid, (editions, _, _)| {
            let is_machine = editions.iter().any(|edition| {
                edition
                    .metadata
                    .entity_type_ids
                    .iter()
                    .any(|entity_type_id| {
                        entity_type_id.base_url.as_str()
                            == "https://hash.ai/@h/types/entity-type/machine/"
                    })
            });
            if is_machine {
                found_machine_entities += 1;
                let retain = self
                    .accounts
                    .contains(&AccountId::new(entity_uuid.into_uuid()));
                if !retain {
                    removed_machine_entities += 1;
                }
                retain
            } else {
                true
            }
        });
        eprintln!(
            "Removed {}/{}=>{} machine entities due to missing account ({})",
            removed_machine_entities,
            found_machine_entities,
            found_machine_entities - removed_machine_entities,
            self.accounts.len(),
        );
    }

    fn filter_system_machines_without_web(&mut self) {
        let mut found_machine_entities = 0;
        let mut removed_machine_entities = 0;
        let machine_identifier_base_url =
            BaseUrl::new("https://hash.ai/@h/types/property-type/machine-identifier/".to_owned())
                .expect("should be a valid Base URL");
        self.entities.retain(|_, (editions, _, _)| {
            let Some(edition) = editions.iter().find(|edition| {
                edition
                    .metadata
                    .entity_type_ids
                    .iter()
                    .any(|entity_type_id| {
                        entity_type_id.base_url.as_str()
                            == "https://hash.ai/@h/types/entity-type/machine/"
                    })
            }) else {
                return true;
            };

            found_machine_entities += 1;
            let Some(Property::Value(Value::String(identifier))) = edition
                .properties
                .properties()
                .get(&machine_identifier_base_url)
            else {
                panic!(
                    "Invalid machine identifier: {}",
                    json!(&edition.properties.properties()[&machine_identifier_base_url])
                )
            };
            let retain = if identifier != "hash" && identifier != "hash-ai" {
                let Some((ty, uuid)) = identifier.split_once('-') else {
                    panic!("Invalid machine identifier: {identifier}");
                };

                let web_id = OwnedById::new(Uuid::from_str(uuid).unwrap_or_else(|error| {
                    panic!("Invalid machine identifier: {identifier}: {error}")
                }));

                match ty {
                    "system" => self.webs.contains_key(&web_id),
                    _ => {
                        panic!("Invalid machine identifier: {identifier}");
                    }
                }
            } else {
                true
            };
            if !retain {
                removed_machine_entities += 1;
            }
            retain
        });
        eprintln!(
            "Removed {}/{}=>{} system machine entities due to missing web ({})",
            removed_machine_entities,
            found_machine_entities,
            found_machine_entities - removed_machine_entities,
            self.webs.len(),
        );
    }

    fn filter_accounts_without_users_or_machines(&mut self) {
        let current_num_accounts = self.accounts.len();
        self.accounts.retain(|account_id| {
            *account_id == NEW_SYSTEM_ACCOUNT_ID
                || *account_id == NEW_HASH_AI_ACCOUNT_ID
                || self
                    .entities
                    .get(&EntityUuid::new(account_id.into_uuid()))
                    .is_some_and(|(editions, _, _)| {
                        editions.iter().any(|edition| {
                            edition
                                .metadata
                                .entity_type_ids
                                .iter()
                                .any(|entity_type_id| {
                                    matches!(
                                        entity_type_id.base_url.as_str(),
                                        "https://hash.ai/@h/types/entity-type/user/"
                                            | "https://hash.ai/@h/types/entity-type/machine/"
                                    )
                                })
                        })
                    })
        });
        eprintln!(
            "Removed {}/{}=>{} accounts due to missing users or machines",
            current_num_accounts - self.accounts.len(),
            current_num_accounts,
            self.accounts.len(),
        );
    }

    fn filter_orgs_without_account_group(&mut self) {
        let mut found_org_entities = 0;
        let mut removed_org_entities = 0;
        self.entities.retain(|entity_uuid, (editions, _, _)| {
            let is_org = editions.iter().any(|edition| {
                edition
                    .metadata
                    .entity_type_ids
                    .iter()
                    .any(|entity_type_id| {
                        entity_type_id.base_url.as_str()
                            == "https://hash.ai/@h/types/entity-type/organization/"
                    })
            });
            if is_org {
                found_org_entities += 1;
                let retain = self
                    .account_groups
                    .contains_key(&AccountGroupId::new(entity_uuid.into_uuid()));
                if !retain {
                    removed_org_entities += 1;
                }
                retain
            } else {
                true
            }
        });
        eprintln!(
            "Removed {}/{}=>{} organization entities due to missing account group ({})",
            removed_org_entities,
            found_org_entities,
            found_org_entities - removed_org_entities,
            self.account_groups.len(),
        );
    }

    fn filter_account_groups_without_org(&mut self) {
        let current_num_account_groups = self.account_groups.len();
        self.account_groups.retain(|account_group_id, _| {
            *account_group_id == NEW_INSTANCE_ADMIN_ACCOUNT_GROUP_ID
                || self
                    .entities
                    .get(&EntityUuid::new(account_group_id.into_uuid()))
                    .is_some_and(|(editions, _, _)| {
                        editions.iter().any(|edition| {
                            edition
                                .metadata
                                .entity_type_ids
                                .iter()
                                .any(|entity_type_id| {
                                    matches!(
                                        entity_type_id.base_url.as_str(),
                                        "https://hash.ai/@h/types/entity-type/organization/"
                                    )
                                })
                        })
                    })
        });
        eprintln!(
            "Removed {}/{}=>{} account groups due to missing orgs",
            current_num_account_groups - self.account_groups.len(),
            current_num_account_groups,
            self.account_groups.len(),
        );
    }

    fn filter_webs_without_user_or_organization(&mut self) {
        let current_num_webs = self.webs.len();
        self.webs.retain(|web_id, _| {
            self.entities
                .get(&EntityUuid::new(web_id.into_uuid()))
                .is_some_and(|(editions, _, _)| {
                    editions.iter().any(|edition| {
                        edition
                            .metadata
                            .entity_type_ids
                            .iter()
                            .any(|entity_type_id| {
                                matches!(
                                    entity_type_id.base_url.as_str(),
                                    "https://hash.ai/@h/types/entity-type/user/"
                                        | "https://hash.ai/@h/types/entity-type/organization/"
                                )
                            })
                    })
                })
        });
        eprintln!(
            "Removed {}/{}=>{} webs due to missing user or organization entities",
            current_num_webs - self.webs.len(),
            current_num_webs,
            self.webs.len(),
        );
    }

    fn filter_webs_without_accounts(&mut self) {
        let current_num_webs = self.webs.len();
        self.webs.retain(|web_id, _| {
            self.accounts.contains(&AccountId::new(web_id.into_uuid()))
                || self
                    .account_groups
                    .contains_key(&AccountGroupId::new(web_id.into_uuid()))
        });
        eprintln!(
            "Removed {}/{}=>{} webs due to missing accounts ({}) or account grops ({})",
            current_num_webs - self.webs.len(),
            current_num_webs,
            self.webs.len(),
            self.accounts.len(),
            self.account_groups.len(),
        );
    }

    fn filter_pre_defined_accounts(&mut self) {
        self.accounts.remove(&NEW_SYSTEM_ACCOUNT_ID);
        self.accounts.remove(&NEW_HASH_AI_ACCOUNT_ID);
    }

    fn filter_pre_defined_account_groups(&mut self) {
        self.account_groups
            .remove(&NEW_INSTANCE_ADMIN_ACCOUNT_GROUP_ID);
    }

    fn filter_data_type_relations(&mut self) {
        let mut filtered_relations = 0;
        for (data_type, _) in self.data_types.values_mut() {
            filtered_relations += data_type.relations.len();
            data_type.relations.retain(|relation| match relation {
                DataTypeRelationAndSubject::Owner {
                    subject: DataTypeOwnerSubject::Web { id },
                    ..
                } => self.webs.contains_key(id),
                _ => true,
            });
            filtered_relations -= data_type.relations.len();
        }
        eprintln!("Removed {filtered_relations} data type relations due to missing webs");
    }

    fn filter_property_type_relations(&mut self) {
        let mut filtered_relations = 0;
        for (property_type, _) in self.property_types.values_mut() {
            filtered_relations += property_type.relations.len();
            property_type.relations.retain(|relation| match relation {
                PropertyTypeRelationAndSubject::Owner {
                    subject: PropertyTypeOwnerSubject::Web { id },
                    ..
                } => self.webs.contains_key(id),
                _ => true,
            });
            filtered_relations -= property_type.relations.len();
        }
        eprintln!("Removed {filtered_relations} property type relations due to missing webs");
    }

    fn filter_entity_type_relations(&mut self) {
        let mut filtered_relations = 0;
        for (entity_type, _) in self.entity_types.values_mut() {
            filtered_relations += entity_type.relations.len();
            entity_type.relations.retain(|relation| match relation {
                EntityTypeRelationAndSubject::Owner {
                    subject: EntityTypeOwnerSubject::Web { id },
                    ..
                } => self.webs.contains_key(id),
                _ => true,
            });
            filtered_relations -= entity_type.relations.len();
        }
        eprintln!("Removed {filtered_relations} entity type relations due to missing webs");
    }

    fn filter_entity_relations(&mut self) {
        let mut filtered_relations = 0;
        for (_, relations, _) in self.entities.values_mut() {
            filtered_relations += relations.len();
            relations.retain(|relation| match relation {
                EntityRelationAndSubject::Owner {
                    subject: EntityOwnerSubject::Web { id },
                    ..
                } => self.webs.contains_key(id),
                EntityRelationAndSubject::Administrator {
                    subject: EntityAdministratorSubject::Account { id: account_id },
                    ..
                }
                | EntityRelationAndSubject::Editor {
                    subject: EntityEditorSubject::Account { id: account_id },
                    ..
                }
                | EntityRelationAndSubject::Viewer {
                    subject: EntityViewerSubject::Account { id: account_id },
                    ..
                } => self.accounts.contains(account_id),
                EntityRelationAndSubject::Administrator {
                    subject: EntityAdministratorSubject::AccountGroup { id: account_id, .. },
                    ..
                }
                | EntityRelationAndSubject::Editor {
                    subject: EntityEditorSubject::AccountGroup { id: account_id, .. },
                    ..
                }
                | EntityRelationAndSubject::Viewer {
                    subject: EntityViewerSubject::AccountGroup { id: account_id, .. },
                    ..
                } => self.account_groups.contains_key(account_id),
                _ => true,
            });
            filtered_relations -= relations.len();
        }
        eprintln!(
            "Removed {filtered_relations} entity relations due to missing accounts, groups, or \
             webs"
        );
    }

    fn filter_web_relations(&mut self) {
        let mut filtered_relations = 0;
        for relations in self.webs.values_mut() {
            filtered_relations += relations.len();
            relations.retain(|relation| match relation {
                WebRelationAndSubject::Owner {
                    subject: WebOwnerSubject::Account { id: account_id },
                    ..
                }
                | WebRelationAndSubject::EntityCreator {
                    subject: WebEntityCreatorSubject::Account { id: account_id },
                    ..
                }
                | WebRelationAndSubject::EntityEditor {
                    subject: WebEntityEditorSubject::Account { id: account_id },
                    ..
                }
                | WebRelationAndSubject::EntityViewer {
                    subject: WebEntityViewerSubject::Account { id: account_id },
                    ..
                } => self.accounts.contains(account_id),
                WebRelationAndSubject::Owner {
                    subject:
                        WebOwnerSubject::AccountGroup {
                            id: account_group_id,
                        },
                    ..
                }
                | WebRelationAndSubject::EntityCreator {
                    subject:
                        WebEntityCreatorSubject::AccountGroup {
                            id: account_group_id,
                            ..
                        },
                    ..
                }
                | WebRelationAndSubject::EntityEditor {
                    subject:
                        WebEntityEditorSubject::AccountGroup {
                            id: account_group_id,
                            ..
                        },
                    ..
                }
                | WebRelationAndSubject::EntityViewer {
                    subject:
                        WebEntityViewerSubject::AccountGroup {
                            id: account_group_id,
                            ..
                        },
                    ..
                } => self.account_groups.contains_key(account_group_id),
                _ => true,
            });
            filtered_relations -= relations.len();
        }
        eprintln!("Removed {filtered_relations} web relations due to missing accounts or groups");
    }

    fn count_entities(&self) {
        let mut current_entities = BTreeMap::<VersionedUrl, (usize, usize)>::new();
        for (editions, _, _) in self.entities.values() {
            for edition in editions {
                for entity_type_id in &edition.metadata.entity_type_ids {
                    let (total, latest) =
                        current_entities.entry(entity_type_id.clone()).or_default();

                    if *edition.metadata.temporal_versioning.decision_time.end()
                        == OpenTemporalBound::Unbounded
                    {
                        *total += 1;
                        if *edition.metadata.temporal_versioning.transaction_time.end()
                            == OpenTemporalBound::Unbounded
                        {
                            *latest += 1;
                        }
                    }
                }
            }
        }
        for (entity_type_id, (total, latest)) in current_entities {
            match total {
                0 => eprintln!("- {entity_type_id}"),
                1 => eprintln!("- {entity_type_id} (1 entity edition, {latest} latest)"),
                n => eprintln!("- {entity_type_id} ({n} entity editions, {latest} latest)"),
            }
        }
    }
}

fn main() -> Result<(), Box<dyn Error>> {
    let mut snapshot = SnapshotData::from_stdin()?;

    snapshot.filter_entities_by_type();

    snapshot.replace_machine_user_uuid();

    snapshot.filter_orgs_without_account_group();
    snapshot.filter_webs_without_user_or_organization();
    snapshot.filter_system_machines_without_web();

    snapshot.filter_accounts_without_users_or_machines();
    snapshot.filter_account_groups_without_org();

    snapshot.filter_webs_without_accounts();

    snapshot.filter_users_without_account();
    snapshot.filter_machines_without_account();

    snapshot.fix_entity_provenance();

    snapshot.filter_data_type_relations();
    snapshot.filter_property_type_relations();
    snapshot.filter_entity_type_relations();
    snapshot.filter_entity_relations();
    snapshot.filter_web_relations();

    snapshot.filter_entities_by_invalid_links();
    snapshot.count_entities();

    snapshot.filter_pre_defined_accounts();
    snapshot.filter_pre_defined_account_groups();

    snapshot.print_full_snapshot();

    Ok(())
}
