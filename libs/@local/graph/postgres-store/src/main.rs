#![expect(
    unreachable_pub,
    clippy::print_stdout,
    clippy::print_stderr,
    clippy::panic_in_result_fn,
    clippy::std_instead_of_alloc,
    clippy::cognitive_complexity
)]
#![feature(impl_trait_in_assoc_type)]
#![feature(type_alias_impl_trait)]
#![feature(hash_raw_entry)]
#![feature(let_chains)]
#![feature(never_type)]
#![feature(extend_one)]

extern crate alloc;

use core::{error::Error, str::FromStr};
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    io::BufRead as _,
};

use hash_graph_temporal_versioning::OpenTemporalBound;
use serde_json::json;
use type_system::{
    schema::{EntityTypeReference, OneOfSchema, PropertyValueArray},
    url::VersionedUrl,
};

use crate::snapshot::{AuthorizationRelation, SnapshotEntry};

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

struct SchemaChanges {
    title: Option<&'static str>,
    add_links: HashMap<VersionedUrl, PropertyValueArray<Option<OneOfSchema<EntityTypeReference>>>>,
}

#[expect(clippy::too_many_lines)]
fn main() -> Result<(), Box<dyn Error>> {
    let mut ontology_type_mappings = create_system_type_namespace_mapping()?;
    let namespace_to_retain = HashSet::<&str>::from([
        "https://hash.ai/@h/",
        "https://blockprotocol.org/@blockprotocol/",
        "https://blockprotocol.org/@hash/",
    ]);
    let entities_to_retain = HashSet::from([
        "https://hash.ai/@h/types/entity-type/browser-plugin-settings/",
        "https://hash.ai/@h/types/entity-type/has-avatar/",
        "https://hash.ai/@h/types/entity-type/has-bio/",
        "https://hash.ai/@h/types/entity-type/has-cover-image/",
        "https://hash.ai/@h/types/entity-type/hash-instance/",
        "https://hash.ai/@h/types/entity-type/has-service-account/",
        "https://hash.ai/@h/types/entity-type/image-file/",
        "https://hash.ai/@h/types/entity-type/is-member-of/",
        "https://hash.ai/@h/types/entity-type/machine/",
        "https://hash.ai/@h/types/entity-type/organization/",
        "https://hash.ai/@h/types/entity-type/profile-bio/",
        "https://hash.ai/@h/types/entity-type/prospective-user/",
        "https://hash.ai/@h/types/entity-type/service-account/",
        "https://hash.ai/@h/types/entity-type/service-feature/",
        "https://hash.ai/@h/types/entity-type/user/",
    ]);

    *ontology_type_mappings
        .get_mut("https://hash.ai/@hash/types/data-type/year/")
        .expect("mapping should exist") =
        "https://hash.ai/@h/types/data-type/calendar-year/".to_owned();
    *ontology_type_mappings
        .get_mut("https://hash.ai/@hash/types/entity-type/quick-note/")
        .expect("mapping should exist") = "https://hash.ai/@h/types/entity-type/note/".to_owned();
    *ontology_type_mappings
        .get_mut("https://hash.ai/@hash/types/entity-type/image/")
        .expect("mapping should exist") =
        "https://hash.ai/@h/types/entity-type/image-file/".to_owned();
    // eprintln!("{:#}", json!(ontology_type_mappings));

    let schema_changes = HashMap::from([
        (
            "https://hash.ai/@h/types/data-type/calendar-year/",
            SchemaChanges {
                title: Some("Calendar Year"),
                add_links: HashMap::new(),
            },
        ),
        (
            "https://hash.ai/@h/types/entity-type/note/",
            SchemaChanges {
                title: Some("Note"),
                add_links: HashMap::new(),
            },
        ),
        (
            "https://hash.ai/@h/types/entity-type/image-file/",
            SchemaChanges {
                title: Some("Image File"),
                add_links: HashMap::new(),
            },
        ),
        (
            "https://hash.ai/@h/types/entity-type/user/v/6",
            SchemaChanges {
                title: None,
                add_links: HashMap::from([(
                    VersionedUrl::from_str(
                        "https://hash.ai/@h/types/entity-type/has-cover-image/v/1",
                    )
                    .expect("should be a valid url"),
                    serde_json::from_value(json!({
                      "type": "array",
                      "items": {
                          "oneOf": [{
                              "$ref": "https://hash.ai/@h/types/entity-type/image-file/v/2"
                          }]
                      },
                      "minItems": 0,
                      "maxItems": 1,
                    }))
                    .expect("Should be a valid link definition"),
                )]),
            },
        ),
    ]);

    let line_matches_to_skip = ["3fb14679-a593-4d29-af99-14d2957dea98"];

    let mut data_types = BTreeMap::new();
    let mut data_type_embeddings = Vec::new();
    let mut property_types = BTreeMap::new();
    let mut property_type_embeddings = Vec::new();
    let mut entity_types = BTreeMap::new();
    let mut entity_type_embeddings = Vec::new();
    let mut entities = HashMap::new();
    let mut entity_relations = HashMap::new();
    let mut entity_embeddings = Vec::new();
    let mut other_entries = Vec::new();
    let mut entities_by_type = BTreeMap::<VersionedUrl, (usize, usize)>::new();

    'line: for line in std::io::BufReader::new(std::io::stdin().lock()).lines() {
        let mut line = line?;
        for line_match_to_skip in &line_matches_to_skip {
            if line.contains(line_match_to_skip) {
                continue 'line;
            }
        }

        // We can skip the loop if `@hash` does not appear in the line
        if line.contains("/@hash/") {
            for (old, new) in &ontology_type_mappings {
                line = line.replace(old, new);
            }
        }
        match serde_json::from_str::<SnapshotEntry>(&line)? {
            SnapshotEntry::DataType(mut data_type) => {
                for namespace in &namespace_to_retain {
                    if !data_type.schema.id.base_url.as_str().starts_with(namespace) {
                        continue;
                    }

                    if let Some(schema_changes) = schema_changes
                        .get(data_type.schema.id.base_url.as_str())
                        .or_else(|| schema_changes.get(data_type.schema.id.to_string().as_str()))
                    {
                        if let Some(title) = schema_changes.title {
                            data_type.schema.title = title.to_string();
                        }
                        assert!(
                            schema_changes.add_links.is_empty(),
                            "data types cannot have links"
                        );
                    }

                    data_types.insert(data_type.schema.id.clone(), data_type);
                    continue 'line;
                }
            }
            SnapshotEntry::DataTypeEmbedding(data_type_embedding) => {
                data_type_embeddings.push(data_type_embedding);
            }
            SnapshotEntry::PropertyType(mut property_type) => {
                for namespace in &namespace_to_retain {
                    if !property_type
                        .schema
                        .id
                        .base_url
                        .as_str()
                        .starts_with(namespace)
                    {
                        continue;
                    }

                    if let Some(schema_changes) = schema_changes
                        .get(property_type.schema.id.base_url.as_str())
                        .or_else(|| {
                            schema_changes.get(property_type.schema.id.to_string().as_str())
                        })
                    {
                        if let Some(title) = schema_changes.title {
                            property_type.schema.title = title.to_string();
                        }
                        assert!(
                            schema_changes.add_links.is_empty(),
                            "property types cannot have links"
                        );
                    }

                    property_types.insert(property_type.schema.id.clone(), property_type);
                    continue 'line;
                }
            }
            SnapshotEntry::PropertyTypeEmbedding(property_type_embedding) => {
                property_type_embeddings.push(property_type_embedding);
            }
            SnapshotEntry::EntityType(mut entity_type) => {
                entities_by_type
                    .entry(entity_type.schema.id.clone())
                    .or_default();
                for namespace in &namespace_to_retain {
                    if !entity_type
                        .schema
                        .id
                        .base_url
                        .as_str()
                        .starts_with(namespace)
                    {
                        continue;
                    }

                    if let Some(schema_changes) = schema_changes
                        .get(entity_type.schema.id.base_url.as_str())
                        .or_else(|| schema_changes.get(entity_type.schema.id.to_string().as_str()))
                    {
                        if let Some(title) = schema_changes.title {
                            entity_type.schema.title = title.to_string();
                        }
                        entity_type
                            .schema
                            .constraints
                            .links
                            .extend(schema_changes.add_links.clone());
                    }

                    entity_types.insert(entity_type.schema.id.clone(), entity_type);
                    continue 'line;
                }
            }
            SnapshotEntry::EntityTypeEmbedding(entity_type_embedding) => {
                entity_type_embeddings.push(entity_type_embedding);
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
                entities.insert(entity.metadata.record_id.entity_id, entity);
            }
            SnapshotEntry::EntityEmbedding(entity_embedding) => {
                entity_embeddings.push(entity_embedding);
            }
            SnapshotEntry::Relation(AuthorizationRelation::Entity {
                object,
                relationship,
            }) => {
                entity_relations.insert(object, relationship);
            }
            other => other_entries.push(other),
        };
    }

    for entry in other_entries {
        println!("{}", json!(entry));
    }

    for data_type_embedding in data_type_embeddings {
        if data_types.contains_key(&data_type_embedding.data_type_id) {
            println!(
                "{}",
                json!(SnapshotEntry::DataTypeEmbedding(data_type_embedding))
            );
        }
    }
    for data_type in data_types.into_values() {
        println!("{}", json!(SnapshotEntry::DataType(data_type)));
    }
    for property_type_embedding in property_type_embeddings {
        if property_types.contains_key(&property_type_embedding.property_type_id) {
            println!(
                "{}",
                json!(SnapshotEntry::PropertyTypeEmbedding(
                    property_type_embedding,
                ))
            );
        }
    }
    for property_type in property_types.into_values() {
        println!("{}", json!(SnapshotEntry::PropertyType(property_type)));
    }

    for entity_type_embedding in entity_type_embeddings {
        if entity_types.contains_key(&entity_type_embedding.entity_type_id) {
            println!(
                "{}",
                json!(SnapshotEntry::EntityTypeEmbedding(entity_type_embedding))
            );
        }
    }

    let current_num_entities = entities.len();
    loop {
        let num_entities = entities.len();
        let current_entities = entities.keys().copied().collect::<HashSet<_>>();
        entities.retain(|_, entity| {
            entity.link_data.as_ref().is_none_or(|link_data| {
                current_entities.contains(&link_data.left_entity_id)
                    && current_entities.contains(&link_data.right_entity_id)
            })
        });
        if entities.len() == num_entities {
            break;
        }
    }
    eprintln!(
        "Removed {} entities due to wrong link data",
        current_num_entities - entities.len()
    );

    let current_num_entities = entities.len();
    for retained_entity_type in &entities_to_retain {
        assert!(
            entity_types
                .keys()
                .any(|entity_type_id| entity_type_id.base_url.as_str() == *retained_entity_type),
            "{retained_entity_type} not found"
        );
    }
    entities.retain(|_, entity| {
        entity
            .metadata
            .entity_type_ids
            .iter()
            .any(|entity_type| entities_to_retain.contains(entity_type.base_url.as_str()))
    });
    eprintln!(
        "Removed {} entities due to filtered type",
        current_num_entities - entities.len()
    );

    for entity_type in entity_types.into_values() {
        println!("{}", json!(SnapshotEntry::EntityType(entity_type)));
    }

    let entity_uuids = entities
        .keys()
        .map(|entity_id| entity_id.entity_uuid)
        .collect::<HashSet<_>>();

    for entity_embedding in entity_embeddings {
        if entities.contains_key(&entity_embedding.entity_id) {
            println!(
                "{}",
                json!(SnapshotEntry::EntityEmbedding(entity_embedding))
            );
        }
    }
    for entity in entities.into_values() {
        println!("{}", json!(SnapshotEntry::Entity(entity)));
    }
    for (object, relationship) in entity_relations {
        if entity_uuids.contains(&object) {
            println!(
                "{}",
                json!(SnapshotEntry::Relation(AuthorizationRelation::Entity {
                    object,
                    relationship
                }))
            );
        }
    }

    // for (entity_type_id, (total, latest)) in entities_by_type {
    //     match total {
    //         0 => eprintln!("- {entity_type_id}"),
    //         1 => eprintln!("- {entity_type_id} (1 entity edition, {latest} latest)"),
    //         n => eprintln!("- {entity_type_id} ({n} entity editions, {latest} latest)"),
    //     }
    // }

    Ok(())
}
