use core::{str::FromStr as _, time::Duration};

use tokio_postgres::{Client, IsolationLevel, NoTls};
use type_system::{
    knowledge::entity::id::{EntityEditionId, EntityId, EntityUuid},
    ontology::VersionedUrl,
    principal::actor_group::WebId,
};
use uuid::Uuid;

use super::*;
use crate::salt::Probability;

#[test]
fn link_type_candidates_are_sorted_and_deduplicated() {
    let candidates = parse_types(vec![
        "https://example.com/types/z/v/1".to_owned(),
        "https://example.com/types/a/v/2".to_owned(),
        "https://example.com/types/a/v/1".to_owned(),
        "https://example.com/types/a/v/1".to_owned(),
    ])
    .expect("type URLs should parse");
    let strings = candidates
        .iter()
        .map(ToString::to_string)
        .collect::<Vec<_>>();

    assert_eq!(
        strings,
        [
            "https://example.com/types/a/v/1",
            "https://example.com/types/a/v/2",
            "https://example.com/types/z/v/1",
        ]
    );
}

#[test]
fn required_type_closure_is_sorted_and_deduplicated() {
    let entities = [
        entity(1, &["https://example.com/types/b/v/1"]),
        entity(
            2,
            &[
                "https://example.com/types/a/v/1",
                "https://example.com/types/b/v/1",
            ],
        ),
    ];
    let link_types = parse_types(vec!["https://example.com/types/c/v/1".to_owned()])
        .expect("link type should parse");
    let closure = required_types(&link_types, [0, 1], &entities)
        .iter()
        .map(ToString::to_string)
        .collect::<Vec<_>>();

    assert_eq!(
        closure,
        [
            "https://example.com/types/a/v/1",
            "https://example.com/types/b/v/1",
            "https://example.com/types/c/v/1",
        ]
    );
}

#[test]
fn ontology_identifiers_are_deduplicated_before_allocation() {
    let entities = [
        entity(
            1,
            &[
                "https://example.com/types/a/v/1",
                "https://example.com/types/b/v/1",
            ],
        ),
        entity(2, &["https://example.com/types/a/v/1"]),
    ];
    let relation_type =
        VersionedUrl::from_str("https://example.com/types/link/v/1").expect("type should parse");
    let link = ExtractedLink {
        link: entities[0].selected,
        left: entities[0].selected,
        right: entities[1].selected,
        relation_type: LinkTypeSelection {
            selected: relation_type.clone(),
            candidates: Box::new([relation_type]),
        },
        required_entity_types: parse_types(vec![
            "https://example.com/types/a/v/1".to_owned(),
            "https://example.com/types/c/v/1".to_owned(),
        ])
        .expect("required types should parse"),
        confidence: RelationConfidence::default(),
    };

    assert_eq!(
        collect_ontology_identifiers(&entities, &[link])
            .expect("unique ontology identifiers should collect"),
        [
            "https://example.com/types/a/v/1",
            "https://example.com/types/b/v/1",
            "https://example.com/types/c/v/1",
        ]
    );
}

#[test]
fn canonical_vectors_must_be_finite_and_nonzero() {
    let mut valid = vec![0.0_f32; CANONICAL_DIMENSIONS];
    valid[0] = 1.0;
    validate_embedding(0, &valid).expect("finite nonzero embedding should validate");

    assert!(validate_embedding(1, &vec![0.0; CANONICAL_DIMENSIONS]).is_err());
    valid[7] = f32::NAN;
    assert!(validate_embedding(2, &valid).is_err());
}

#[test]
fn knowledge_identity_binds_relation_confidence_provenance() {
    let entities = [
        entity(1, &["https://example.com/types/link/v/1"]),
        entity(2, &["https://example.com/types/left/v/1"]),
        entity(3, &["https://example.com/types/right/v/1"]),
    ];
    let relation_type =
        VersionedUrl::from_str("https://example.com/types/link/v/1").expect("type should parse");
    let mut link = ExtractedLink {
        link: entities[0].selected,
        left: entities[1].selected,
        right: entities[2].selected,
        relation_type: LinkTypeSelection {
            selected: relation_type.clone(),
            candidates: Box::new([relation_type]),
        },
        required_entity_types: Box::new([]),
        confidence: RelationConfidence::default(),
    };
    let embeddings = vec![1.0_f32; entities.len() * CANONICAL_DIMENSIONS];
    let unscored = knowledge_hash(&entities, &embeddings, core::slice::from_ref(&link));

    link.confidence.link = Some(Probability::new(0.5).expect("confidence should validate"));
    let scored = knowledge_hash(&entities, &embeddings, core::slice::from_ref(&link));

    assert_ne!(unscored, scored);
}

#[test]
fn knowledge_identity_distinguishes_absent_and_empty_labels() {
    let mut entity = entity(1, &["https://example.com/types/entity/v/1"]);
    let embeddings = vec![1.0_f32; CANONICAL_DIMENSIONS];
    let absent = knowledge_hash(core::slice::from_ref(&entity), &embeddings, &[]);

    entity.label = Some(Box::<str>::from(""));
    let empty = knowledge_hash(core::slice::from_ref(&entity), &embeddings, &[]);

    assert_ne!(absent, empty);
}

#[test]
fn one_link_entity_cannot_expand_to_multiple_endpoint_pairs() {
    let link = entity(1, &[]).entity_id();
    let mut links = HashSet::new();

    require_unique_link(&mut links, link).expect("first endpoint pair should be accepted");
    assert!(matches!(
        require_unique_link(&mut links, link),
        Err(PostgresExtractionError::AmbiguousLinkEndpoints)
    ));
}

#[test]
fn extraction_type_budget_is_shared_across_phases() {
    let mut budget = ExtractionBudget::default();
    budget
        .consume_types("entity types", MAXIMUM_TOTAL_TYPE_REFERENCES - 1, 1)
        .expect("entity phase should fit");
    budget
        .consume_types("link types", 1, 1)
        .expect("link phase should consume the remaining reference");
    assert!(matches!(
        budget.consume_types("ontology types", 1, 1),
        Err(PostgresExtractionError::Capacity {
            maximum: MAXIMUM_TOTAL_TYPE_REFERENCES,
            ..
        })
    ));
}

#[tokio::test]
#[ignore = "requires a live HASH PostgreSQL database with pgvector"]
async fn live_repeatable_read_extracts_one_complete_current_snapshot() {
    let mut client = connect_live().await;
    create_live_fixture_tables(&client).await;
    let identities = seed_live_snapshot(&client, 51).await;
    prepare_point_domain_table(&client)
        .await
        .expect("temporary point domain should be prepared");
    let transaction = client
        .build_transaction()
        .isolation_level(IsolationLevel::RepeatableRead)
        .read_only(true)
        .start()
        .await
        .expect("repeatable-read transaction should start");
    let mut request = FitRequestV1 {
        request_id: Uuid::from_u128(1),
        ..FitRequestV1::default()
    };
    request.web_ids = vec![identities[0].0];

    let extraction = extract_current_snapshot(
        &transaction,
        &request,
        camino::Utf8Path::new("."),
        crate::salt_fit::FitWorkerConfigurationV1::default().resources,
    )
    .await
    .expect("current snapshot should extract");
    transaction
        .commit()
        .await
        .expect("read transaction should commit");

    assert_eq!(extraction.entities.len(), identities.len());
    assert_eq!(
        extraction.canonical_embeddings.len(),
        51 * CANONICAL_DIMENSIONS
    );
    assert_eq!(extraction.links.len(), 1);
    assert_eq!(extraction.ambiguous_link_type_count, 0);
    assert_ne!(extraction.provenance_hash, ContentHash::from_bytes([0; 32]));
}

fn entity(discriminator: u128, types: &[&str]) -> ExtractedEntity {
    ExtractedEntity {
        selected: EntityAtEdition {
            entity_id: EntityId {
                web_id: WebId::new(Uuid::from_u128(1)),
                entity_uuid: EntityUuid::new(Uuid::from_u128(discriminator)),
                draft_id: None,
            },
            edition_id: EntityEditionId::new(Uuid::from_u128(discriminator + 10)),
        },
        label: None,
        entity_types: parse_types(types.iter().map(|value| (*value).to_owned()).collect())
            .expect("fixture types should parse"),
    }
}

async fn connect_live() -> Client {
    let user = std::env::var("HASH_GRAPH_PG_USER").unwrap_or_else(|_| "graph".to_owned());
    let password = std::env::var("HASH_GRAPH_PG_PASSWORD").unwrap_or_else(|_| "graph".to_owned());
    let host = std::env::var("HASH_GRAPH_PG_HOST").unwrap_or_else(|_| "localhost".to_owned());
    let port = std::env::var("HASH_GRAPH_PG_PORT")
        .unwrap_or_else(|_| "5432".to_owned())
        .parse()
        .expect("PostgreSQL port should be numeric");
    let database = std::env::var("HASH_GRAPH_PG_DATABASE").unwrap_or_else(|_| "graph".to_owned());
    let (client, connection) = tokio_postgres::Config::new()
        .user(&user)
        .password(password)
        .host(&host)
        .port(port)
        .dbname(&database)
        .connect_timeout(Duration::from_secs(5))
        .connect(NoTls)
        .await
        .expect("PostgreSQL should be reachable through HASH_GRAPH_PG_* settings");
    tokio::spawn(async move {
        connection
            .await
            .expect("live extraction fixture connection should remain healthy");
    });
    client
}

async fn create_live_fixture_tables(client: &Client) {
    client
        .batch_execute(
            "
            CREATE TEMPORARY TABLE entity_embeddings (
                web_id UUID NOT NULL,
                entity_uuid UUID NOT NULL,
                draft_id UUID,
                property TEXT,
                embedding VECTOR(3072) NOT NULL,
                updated_at_decision_time TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
                updated_at_transaction_time TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp()
            );
            CREATE TEMPORARY TABLE entity_temporal_metadata (
                web_id UUID NOT NULL,
                entity_uuid UUID NOT NULL,
                draft_id UUID,
                entity_edition_id UUID NOT NULL,
                decision_time TSTZRANGE NOT NULL,
                transaction_time TSTZRANGE NOT NULL
            );
            CREATE TEMPORARY TABLE entity_editions (
                entity_edition_id UUID NOT NULL,
                archived BOOLEAN NOT NULL,
                confidence DOUBLE PRECISION
            );
            CREATE TEMPORARY TABLE entity_edition_cache (
                entity_edition_id UUID NOT NULL,
                labels TEXT[] NOT NULL,
                versioned_urls TEXT[] NOT NULL
            );
            CREATE TEMPORARY TABLE entity_edge (
                source_web_id UUID NOT NULL,
                source_entity_uuid UUID NOT NULL,
                target_web_id UUID NOT NULL,
                target_entity_uuid UUID NOT NULL,
                kind TEXT NOT NULL,
                direction TEXT NOT NULL,
                confidence DOUBLE PRECISION
            );
            CREATE TEMPORARY TABLE ontology_ids (
                ontology_id UUID NOT NULL,
                base_url TEXT NOT NULL,
                version BIGINT NOT NULL
            );
            CREATE TEMPORARY TABLE entity_is_of_type (
                entity_edition_id UUID NOT NULL,
                entity_type_ontology_id UUID NOT NULL,
                inheritance_depth INTEGER NOT NULL
            );
            CREATE TEMPORARY TABLE entity_type_inherits_from (
                source_entity_type_ontology_id UUID NOT NULL,
                target_entity_type_ontology_id UUID NOT NULL,
                depth INTEGER NOT NULL
            );
            CREATE TEMPORARY TABLE entity_types (
                ontology_id UUID NOT NULL,
                schema JSONB NOT NULL,
                closed_schema JSONB NOT NULL
            );
            CREATE TEMPORARY TABLE ontology_temporal_metadata (
                ontology_id UUID NOT NULL,
                transaction_time TSTZRANGE NOT NULL
            );",
        )
        .await
        .expect("live extraction fixture tables should be created");
}

async fn seed_live_snapshot(client: &Client, rows: usize) -> Vec<(Uuid, Uuid, Uuid)> {
    const RELATION_BASE: &str = "https://example.com/types/entity-type/relation/";
    const ENTITY_BASE: &str = "https://example.com/types/entity-type/thing/";
    client
        .batch_execute(&format!(
            "INSERT INTO ontology_ids VALUES
                ('00000000-0000-0000-0000-000000000001', '{RELATION_BASE}', 1),
                ('00000000-0000-0000-0000-000000000002', '{LINK_ROOT_BASE_URL}', 1),
                ('00000000-0000-0000-0000-000000000003', '{ENTITY_BASE}', 1);
             INSERT INTO entity_type_inherits_from VALUES
                ('00000000-0000-0000-0000-000000000001',
                 '00000000-0000-0000-0000-000000000002', 0);
             INSERT INTO entity_types VALUES
                ('00000000-0000-0000-0000-000000000001', '{{}}'::jsonb, '{{}}'::jsonb),
                ('00000000-0000-0000-0000-000000000002', '{{}}'::jsonb, '{{}}'::jsonb),
                ('00000000-0000-0000-0000-000000000003', '{{}}'::jsonb, '{{}}'::jsonb);
             INSERT INTO ontology_temporal_metadata VALUES
                ('00000000-0000-0000-0000-000000000001',
                 '[-infinity,infinity]'::tstzrange),
                ('00000000-0000-0000-0000-000000000002',
                 '[-infinity,infinity]'::tstzrange),
                ('00000000-0000-0000-0000-000000000003',
                 '[-infinity,infinity]'::tstzrange)"
        ))
        .await
        .expect("ontology fixture should be inserted");

    let web_id = Uuid::from_u128(1);
    let mut identities = Vec::with_capacity(rows);
    for index in 0..rows {
        let discriminator = u128::try_from(index).expect("fixture index should fit u128");
        let entity_uuid = Uuid::from_u128(100 + discriminator);
        let edition_id = Uuid::from_u128(1_000 + discriminator);
        let ontology_id = Uuid::from_u128(3);
        let versioned_url = format!("{ENTITY_BASE}v/1");
        client
            .execute(
                "INSERT INTO entity_embeddings (web_id, entity_uuid, embedding)
                    VALUES ($1, $2, $3::text::vector)",
                &[&web_id, &entity_uuid, &live_embedding(index)],
            )
            .await
            .expect("embedding fixture should be inserted");
        client
            .execute(
                "INSERT INTO entity_temporal_metadata VALUES
                    ($1, $2, NULL, $3, '[-infinity,infinity]'::tstzrange,
                     '[-infinity,infinity]'::tstzrange)",
                &[&web_id, &entity_uuid, &edition_id],
            )
            .await
            .expect("temporal fixture should be inserted");
        client
            .execute(
                "INSERT INTO entity_editions VALUES ($1, false, 0.75)",
                &[&edition_id],
            )
            .await
            .expect("edition fixture should be inserted");
        client
            .execute(
                "INSERT INTO entity_edition_cache VALUES ($1, ARRAY[$2], ARRAY[$3])",
                &[&edition_id, &format!("entity-{index}"), &versioned_url],
            )
            .await
            .expect("edition cache fixture should be inserted");
        client
            .execute(
                "INSERT INTO entity_is_of_type VALUES ($1, $2, 0)",
                &[&edition_id, &ontology_id],
            )
            .await
            .expect("type fixture should be inserted");
        identities.push((web_id, entity_uuid, edition_id));
    }
    let link_uuid = Uuid::from_u128(10_000);
    let link_edition_id = Uuid::from_u128(20_000);
    let relation_ontology_id = Uuid::from_u128(1);
    client
        .execute(
            "INSERT INTO entity_temporal_metadata VALUES
                ($1, $2, NULL, $3, '[-infinity,infinity]'::tstzrange,
                 '[-infinity,infinity]'::tstzrange)",
            &[&web_id, &link_uuid, &link_edition_id],
        )
        .await
        .expect("link temporal fixture should be inserted");
    client
        .execute(
            "INSERT INTO entity_editions VALUES ($1, false, 0.75)",
            &[&link_edition_id],
        )
        .await
        .expect("link edition fixture should be inserted");
    client
        .execute(
            "INSERT INTO entity_edition_cache VALUES
                ($1, ARRAY['link'], ARRAY[$2, $3])",
            &[
                &link_edition_id,
                &format!("{RELATION_BASE}v/1"),
                &format!("{LINK_ROOT_BASE_URL}v/1"),
            ],
        )
        .await
        .expect("link cache fixture should be inserted");
    client
        .execute(
            "INSERT INTO entity_is_of_type VALUES ($1, $2, 0)",
            &[&link_edition_id, &relation_ontology_id],
        )
        .await
        .expect("link type fixture should be inserted");
    client
        .execute(
            "INSERT INTO entity_edge VALUES
                ($1, $2, $1, $3, 'has-left-entity', 'outgoing', 0.8),
                ($1, $2, $1, $4, 'has-right-entity', 'outgoing', 0.9)",
            &[&web_id, &link_uuid, &identities[1].1, &identities[2].1],
        )
        .await
        .expect("link endpoint fixture should be inserted");
    identities
}

fn live_embedding(index: usize) -> String {
    let mut values = vec![0.0_f32; CANONICAL_DIMENSIONS];
    values[index % CANONICAL_DIMENSIONS] = 1.0;
    format!(
        "[{}]",
        values
            .into_iter()
            .map(|value| value.to_string())
            .collect::<Vec<_>>()
            .join(",")
    )
}
