#![expect(
    clippy::large_futures,
    reason = "Test verification futures are large due to filter complexity; acceptable for tests"
)]
#![expect(
    clippy::print_stderr,
    reason = "eprintln! used for debug output on test failures"
)]

//! Integration tests for email filter protection on User entities.
//!
//! These tests verify the protection algorithm documented in
//! [`hash_graph_store::filter::protection`]. See that module for the complete
//! derivation of the algorithm, security goals, threat model, and truth tables.
//!
//! # Test Cases
//!
//! The tests below verify each case from the truth tables in the protection module.

use alloc::borrow::Cow;
use std::collections::HashSet;

use hash_graph_postgres_store::store::PostgresStoreSettings;
use hash_graph_store::{
    entity::{CountEntitiesParams, CreateEntityParams, EntityQuerySorting, EntityStore as _},
    filter::{
        Filter, FilterExpression, JsonPath, Parameter, PathToken,
        protection::FilterProtectionConfig,
    },
    subgraph::temporal_axes::{
        PinnedTemporalAxisUnresolved, QueryTemporalAxesUnresolved, VariableTemporalAxisUnresolved,
    },
};
use hash_graph_temporal_versioning::TemporalBound;
use hash_graph_test_data::data_type;
use type_system::{
    knowledge::{
        entity::provenance::ProvidedEntityEditionProvenance,
        property::{PropertyObject, PropertyObjectWithMetadata},
    },
    ontology::id::{BaseUrl, OntologyTypeVersion, VersionedUrl},
    principal::{actor::ActorType, actor_group::WebId},
    provenance::{OriginProvenance, OriginType},
};

use crate::{DatabaseApi, DatabaseTestWrapper};

/// The email property base URL used in production.
const EMAIL_PROPERTY_BASE_URL: &str = "https://hash.ai/@h/types/property-type/email/";

/// The shortname property base URL for testing non-email filters.
const SHORTNAME_PROPERTY_BASE_URL: &str = "https://hash.ai/@h/types/property-type/shortname/";

/// The User entity type base URL that should be protected.
const USER_ENTITY_TYPE_BASE_URL: &str = "https://hash.ai/@h/types/entity-type/user/";

/// A non-User entity type base URL for testing that non-User entities are not affected.
const INVITATION_ENTITY_TYPE_BASE_URL: &str =
    "https://blockprotocol.org/@test/types/entity-type/invitation/";

/// Email property type JSON for seeding.
const EMAIL_PROPERTY_TYPE: &str = r#"{
    "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
    "kind": "propertyType",
    "$id": "https://hash.ai/@h/types/property-type/email/v/1",
    "title": "Email",
    "description": "An email address.",
    "oneOf": [
        {
            "$ref": "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1"
        }
    ]
}"#;

/// Shortname property type JSON for seeding (non-protected property for testing).
const SHORTNAME_PROPERTY_TYPE: &str = r#"{
    "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
    "kind": "propertyType",
    "$id": "https://hash.ai/@h/types/property-type/shortname/v/1",
    "title": "Shortname",
    "description": "A shortname.",
    "oneOf": [
        {
            "$ref": "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1"
        }
    ]
}"#;

/// User entity type JSON for seeding.
const USER_ENTITY_TYPE: &str = r#"{
    "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/entity-type",
    "kind": "entityType",
    "$id": "https://hash.ai/@h/types/entity-type/user/v/1",
    "type": "object",
    "title": "User",
    "description": "A user entity that should be protected from email filtering.",
    "properties": {
        "https://hash.ai/@h/types/property-type/email/": {
            "$ref": "https://hash.ai/@h/types/property-type/email/v/1"
        },
        "https://hash.ai/@h/types/property-type/shortname/": {
            "$ref": "https://hash.ai/@h/types/property-type/shortname/v/1"
        }
    }
}"#;

/// Invitation entity type JSON for seeding (non-User, should NOT be protected).
const INVITATION_ENTITY_TYPE: &str = r#"{
    "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/entity-type",
    "kind": "entityType",
    "$id": "https://blockprotocol.org/@test/types/entity-type/invitation/v/1",
    "type": "object",
    "title": "Invitation",
    "description": "An invitation entity that can be filtered by email.",
    "properties": {
        "https://hash.ai/@h/types/property-type/email/": {
            "$ref": "https://hash.ai/@h/types/property-type/email/v/1"
        },
        "https://hash.ai/@h/types/property-type/shortname/": {
            "$ref": "https://hash.ai/@h/types/property-type/shortname/v/1"
        }
    }
}"#;

/// Helper to create a properties object with email and shortname.
fn properties_with(email: &str, shortname: &str) -> PropertyObject {
    serde_json::from_value(serde_json::json!({
        "https://hash.ai/@h/types/property-type/email/": email,
        "https://hash.ai/@h/types/property-type/shortname/": shortname
    }))
    .expect("could not create properties")
}

/// Helper to create a filter that matches entities by email.
fn email_filter(email: &str) -> Filter<'static, type_system::knowledge::entity::Entity> {
    Filter::Equal(
        FilterExpression::Path {
            path: hash_graph_store::entity::EntityQueryPath::Properties(Some(
                JsonPath::from_path_tokens(vec![PathToken::Field(Cow::Owned(
                    EMAIL_PROPERTY_BASE_URL.to_owned(),
                ))]),
            )),
        },
        FilterExpression::Parameter {
            parameter: Parameter::Text(Cow::Owned(email.to_owned())),
            convert: None,
        },
    )
}

/// Helper to create an "exists" filter for the email property.
/// Helper to create a filter that matches entities where email property exists (is NOT NULL).
///
/// Note: In this codebase, `Filter::Exists` transpiles to `IS NULL` (checking for absence),
/// so to check for existence we use `Not(Exists { ... })` which transpiles to `IS NOT NULL`.
fn email_exists_filter() -> Filter<'static, type_system::knowledge::entity::Entity> {
    Filter::Not(Box::new(Filter::Exists {
        path: hash_graph_store::entity::EntityQueryPath::Properties(Some(
            JsonPath::from_path_tokens(vec![PathToken::Field(Cow::Owned(
                EMAIL_PROPERTY_BASE_URL.to_owned(),
            ))]),
        )),
    }))
}

/// Helper to create a "startsWith" filter for the email property.
fn email_starts_with_filter(
    prefix: &str,
) -> Filter<'static, type_system::knowledge::entity::Entity> {
    Filter::StartsWith(
        FilterExpression::Path {
            path: hash_graph_store::entity::EntityQueryPath::Properties(Some(
                JsonPath::from_path_tokens(vec![PathToken::Field(Cow::Owned(
                    EMAIL_PROPERTY_BASE_URL.to_owned(),
                ))]),
            )),
        },
        FilterExpression::Parameter {
            parameter: Parameter::Text(Cow::Owned(prefix.to_owned())),
            convert: None,
        },
    )
}

/// Helper to create a filter that matches entities by shortname.
fn shortname_filter(shortname: &str) -> Filter<'static, type_system::knowledge::entity::Entity> {
    Filter::Equal(
        FilterExpression::Path {
            path: hash_graph_store::entity::EntityQueryPath::Properties(Some(
                JsonPath::from_path_tokens(vec![PathToken::Field(Cow::Owned(
                    SHORTNAME_PROPERTY_BASE_URL.to_owned(),
                ))]),
            )),
        },
        FilterExpression::Parameter {
            parameter: Parameter::Text(Cow::Owned(shortname.to_owned())),
            convert: None,
        },
    )
}

/// Helper to get standard temporal axes for queries.
fn standard_temporal_axes() -> QueryTemporalAxesUnresolved {
    QueryTemporalAxesUnresolved::DecisionTime {
        pinned: PinnedTemporalAxisUnresolved::new(None),
        variable: VariableTemporalAxisUnresolved::new(Some(TemporalBound::Unbounded), None),
    }
}

/// Seeds the database with User and Invitation entity types (with email and shortname properties).
async fn seed(database: &mut DatabaseTestWrapper) -> DatabaseApi<'_> {
    database
        .seed(
            [data_type::VALUE_V1, data_type::TEXT_V1],
            [EMAIL_PROPERTY_TYPE, SHORTNAME_PROPERTY_TYPE],
            [USER_ENTITY_TYPE, INVITATION_ENTITY_TYPE],
        )
        .await
        .expect("could not seed database")
}

/// Seeds the database with only User entity type.
async fn seed_with_user_only(database: &mut DatabaseTestWrapper) -> DatabaseApi<'_> {
    database
        .seed(
            [data_type::VALUE_V1, data_type::TEXT_V1],
            [EMAIL_PROPERTY_TYPE, SHORTNAME_PROPERTY_TYPE],
            [USER_ENTITY_TYPE],
        )
        .await
        .expect("could not seed database")
}

/// Seeds the database with only Invitation entity type.
async fn seed_with_invitation_only(database: &mut DatabaseTestWrapper) -> DatabaseApi<'_> {
    database
        .seed(
            [data_type::VALUE_V1, data_type::TEXT_V1],
            [EMAIL_PROPERTY_TYPE, SHORTNAME_PROPERTY_TYPE],
            [INVITATION_ENTITY_TYPE],
        )
        .await
        .expect("could not seed database")
}

/// Alias for seed - seeds both User and Invitation entity types.
async fn seed_with_email_types(database: &mut DatabaseTestWrapper) -> DatabaseApi<'_> {
    seed(database).await
}

// =============================================================================
// Compact Test Helpers
// =============================================================================

type Entity = type_system::knowledge::entity::Entity;
type EntityId = type_system::knowledge::entity::EntityId;

impl DatabaseApi<'_> {
    async fn create_user(&mut self, email: &str, shortname: &str) -> Entity {
        self.create_entity(
            self.account_id,
            CreateEntityParams {
                web_id: WebId::new(self.account_id),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([VersionedUrl {
                    base_url: BaseUrl::new(USER_ENTITY_TYPE_BASE_URL.to_owned()).unwrap(),
                    version: OntologyTypeVersion {
                        major: 1,
                        pre_release: None,
                    },
                }]),
                properties: PropertyObjectWithMetadata::from_parts(
                    properties_with(email, shortname),
                    None,
                )
                .unwrap(),
                confidence: None,
                link_data: None,
                draft: false,
                policies: Vec::new(),
                provenance: ProvidedEntityEditionProvenance {
                    actor_type: ActorType::User,
                    origin: OriginProvenance::from_empty_type(OriginType::Api),
                    sources: Vec::new(),
                },
            },
        )
        .await
        .expect("could not create user entity")
    }

    async fn create_invitation(&mut self, email: &str, shortname: &str) -> Entity {
        self.create_entity(
            self.account_id,
            CreateEntityParams {
                web_id: WebId::new(self.account_id),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([VersionedUrl {
                    base_url: BaseUrl::new(INVITATION_ENTITY_TYPE_BASE_URL.to_owned()).unwrap(),
                    version: OntologyTypeVersion {
                        major: 1,
                        pre_release: None,
                    },
                }]),
                properties: PropertyObjectWithMetadata::from_parts(
                    properties_with(email, shortname),
                    None,
                )
                .unwrap(),
                confidence: None,
                link_data: None,
                draft: false,
                policies: Vec::new(),
                provenance: ProvidedEntityEditionProvenance {
                    actor_type: ActorType::User,
                    origin: OriginProvenance::from_empty_type(OriginType::Api),
                    sources: Vec::new(),
                },
            },
        )
        .await
        .expect("could not create invitation entity")
    }

    /// Creates an entity with BOTH User and Invitation types.
    /// This tests that NOT(type = User) works correctly for multi-type entities.
    async fn create_user_and_invitation(&mut self, email: &str, shortname: &str) -> Entity {
        self.create_entity(
            self.account_id,
            CreateEntityParams {
                web_id: WebId::new(self.account_id),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([
                    VersionedUrl {
                        base_url: BaseUrl::new(USER_ENTITY_TYPE_BASE_URL.to_owned()).unwrap(),
                        version: OntologyTypeVersion {
                            major: 1,
                            pre_release: None,
                        },
                    },
                    VersionedUrl {
                        base_url: BaseUrl::new(INVITATION_ENTITY_TYPE_BASE_URL.to_owned()).unwrap(),
                        version: OntologyTypeVersion {
                            major: 1,
                            pre_release: None,
                        },
                    },
                ]),
                properties: PropertyObjectWithMetadata::from_parts(
                    properties_with(email, shortname),
                    None,
                )
                .unwrap(),
                confidence: None,
                link_data: None,
                draft: false,
                policies: Vec::new(),
                provenance: ProvidedEntityEditionProvenance {
                    actor_type: ActorType::User,
                    origin: OriginProvenance::from_empty_type(OriginType::Api),
                    sources: Vec::new(),
                },
            },
        )
        .await
        .expect("could not create multi-type entity")
    }

    async fn query(
        &self,
        filter: Filter<'_, Entity>,
        sorting: EntityQuerySorting<'static>,
    ) -> Vec<Entity> {
        self.query_entities(
            self.account_id,
            hash_graph_store::entity::QueryEntitiesParams {
                filter,
                temporal_axes: standard_temporal_axes(),
                sorting,
                limit: None,
                conversions: Vec::new(),
                include_count: false,
                include_entity_types: None,
                include_drafts: false,
                include_web_ids: false,
                include_created_by_ids: false,
                include_edition_created_by_ids: false,
                include_type_ids: false,
                include_type_titles: false,
                include_permissions: false,
            },
        )
        .await
        .expect("query failed")
        .entities
    }

    async fn count(&self, filter: Filter<'_, Entity>) -> usize {
        self.count_entities(
            self.account_id,
            CountEntitiesParams {
                filter,
                temporal_axes: standard_temporal_axes(),
                include_drafts: false,
            },
        )
        .await
        .expect("count failed")
    }
}

fn entity_ids(entities: &[Entity]) -> HashSet<EntityId> {
    entities
        .iter()
        .map(|entity| entity.metadata.record_id.entity_id)
        .collect()
}

const fn no_sorting() -> EntityQuerySorting<'static> {
    EntityQuerySorting {
        paths: Vec::new(),
        cursor: None,
    }
}

// =============================================================================
// Tests - Basic Protection
// =============================================================================

/// email = X → User NOT returned
#[tokio::test]
async fn email_eq_excludes_user() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed_with_user_only(&mut database).await;
    api.create_user("user@example.com", "alice").await;

    let results = api
        .query(email_filter("user@example.com"), no_sorting())
        .await;
    assert!(results.is_empty(), "User should NOT be returned");
}

/// email = X → Invitation IS returned (only User protected)
#[tokio::test]
async fn email_eq_returns_invitation() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed_with_invitation_only(&mut database).await;
    let inv = api.create_invitation("invite@example.com", "bob").await;

    let results = api
        .query(email_filter("invite@example.com"), no_sorting())
        .await;
    assert_eq!(results.len(), 1);
    assert_eq!(
        results[0].metadata.record_id.entity_id,
        inv.metadata.record_id.entity_id
    );
}

/// Same email on User + Invitation → only Invitation returned
#[tokio::test]
async fn email_eq_mixed_only_returns_invitation() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed_with_email_types(&mut database).await;
    api.create_user("shared@example.com", "alice").await;
    let inv = api.create_invitation("shared@example.com", "bob").await;

    let results = api
        .query(email_filter("shared@example.com"), no_sorting())
        .await;
    assert_eq!(results.len(), 1);
    assert_eq!(
        results[0].metadata.record_id.entity_id,
        inv.metadata.record_id.entity_id
    );
}

/// Multi-type entity with BOTH User and Invitation types → NOT returned when filtering by email.
///
/// This test verifies that our protection uses NOT(type = User) rather than type != User.
/// With multi-type entities:
/// - NOT(type = User) correctly excludes entities that have User as ANY of their types
/// - type != User would incorrectly match because the Invitation type row satisfies != User
///
/// An entity with types [User, Invitation] should be excluded because it IS a User.
#[tokio::test]
async fn multi_type_entity_with_user_excluded_by_email_filter() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed_with_email_types(&mut database).await;

    // Create a multi-type entity that is BOTH User and Invitation
    api.create_user_and_invitation("multi@example.com", "multi")
        .await;

    // Also create a pure Invitation for comparison
    let pure_inv = api
        .create_invitation("pure_invite@example.com", "pure")
        .await;

    // Filter by the multi-type entity's email - should NOT be returned
    let results = api
        .query(email_filter("multi@example.com"), no_sorting())
        .await;
    assert!(
        results.is_empty(),
        "Multi-type entity with User type should NOT be returned when filtering by email"
    );

    // Filter by the pure invitation's email - should be returned
    let results = api
        .query(email_filter("pure_invite@example.com"), no_sorting())
        .await;
    assert_eq!(results.len(), 1);
    assert_eq!(
        results[0].metadata.record_id.entity_id,
        pure_inv.metadata.record_id.entity_id
    );
}

/// email exists → User NOT returned, Invitation IS returned
#[tokio::test]
async fn email_exists_excludes_user() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed_with_email_types(&mut database).await;
    api.create_user("user@example.com", "alice").await;
    let inv = api.create_invitation("invite@example.com", "bob").await;

    let results = api.query(email_exists_filter(), no_sorting()).await;
    assert_eq!(results.len(), 1);
    assert_eq!(
        results[0].metadata.record_id.entity_id,
        inv.metadata.record_id.entity_id
    );
}

/// email startsWith X → User NOT returned, Invitation IS returned
#[tokio::test]
async fn email_starts_with_excludes_user() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed_with_email_types(&mut database).await;
    api.create_user("test_user@example.com", "alice").await;
    let inv = api
        .create_invitation("test_invite@example.com", "bob")
        .await;

    let results = api
        .query(email_starts_with_filter("test_"), no_sorting())
        .await;
    assert_eq!(results.len(), 1);
    assert_eq!(
        results[0].metadata.record_id.entity_id,
        inv.metadata.record_id.entity_id
    );
}

/// count(email = X) excludes User
#[tokio::test]
async fn count_by_email_excludes_user() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed_with_email_types(&mut database).await;
    api.create_user("count@example.com", "alice").await;
    api.create_invitation("count@example.com", "bob").await;

    let count = api.count(email_filter("count@example.com")).await;
    assert_eq!(count, 1, "Only Invitation counted, not User");
}

/// Any([email = X, email = Y]) → User NOT returned
#[tokio::test]
async fn email_nested_in_any_excludes_user() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed_with_user_only(&mut database).await;
    api.create_user("nested@example.com", "alice").await;

    let filter = Filter::Any(vec![
        email_filter("nested@example.com"),
        email_filter("nonexistent@example.com"),
    ]);
    let results = api.query(filter, no_sorting()).await;
    assert!(results.is_empty(), "User should NOT be returned");
}

// =============================================================================
// Table-Driven Tests for Truth Tables
// =============================================================================
//
// These tests verify ALL rows of the truth tables documented above.
// Each test case creates all combinations of entity types and property values,
// then verifies the filter returns exactly the expected entities.

/// Test input row for truth table verification.
#[derive(Debug, Clone, Copy)]
#[expect(clippy::struct_excessive_bools, reason = "test data structure")]
struct Row {
    /// Entity type: true = User, false = Invitation.
    is_user: bool,
    /// Email matches the filter target (X).
    email_match: bool,
    /// Shortname matches the filter target (A).
    shortname_match: bool,
    /// Should this entity be returned by the protected filter?
    expected_returned: bool,
}

/// Email and shortname values used in tests.
const TARGET_EMAIL: &str = "target@example.com";
const OTHER_EMAIL: &str = "other@example.com";
const TARGET_SHORTNAME: &str = "alice";
const OTHER_SHORTNAME: &str = "bob";

impl Row {
    const fn email(self) -> &'static str {
        if self.email_match {
            TARGET_EMAIL
        } else {
            OTHER_EMAIL
        }
    }

    const fn shortname(self) -> &'static str {
        if self.shortname_match {
            TARGET_SHORTNAME
        } else {
            OTHER_SHORTNAME
        }
    }
}

/// Creates entities for all rows and verifies the filter returns exactly the expected ones.
async fn verify_truth_table(
    api: &mut DatabaseApi<'_>,
    rows: &[Row],
    filter: Filter<'_, Entity>,
    case_name: &str,
) {
    // Create all entities and track which should be returned
    let mut expected_ids: HashSet<EntityId> = HashSet::new();

    for (i, row) in rows.iter().enumerate() {
        let entity = if row.is_user {
            api.create_user(row.email(), row.shortname()).await
        } else {
            api.create_invitation(row.email(), row.shortname()).await
        };

        if row.expected_returned {
            expected_ids.insert(entity.metadata.record_id.entity_id);
        }

        // Debug output for test failures
        eprintln!(
            "[{case_name}] Row {i}: {} email={} shortname={} → expected={}",
            if row.is_user { "User" } else { "Invitation" },
            if row.email_match {
                "\u{2713}"
            } else {
                "\u{2717}"
            },
            if row.shortname_match {
                "\u{2713}"
            } else {
                "\u{2717}"
            },
            if row.expected_returned { "ret" } else { "excl" }
        );
    }

    // Run the query
    let results = api.query(filter, no_sorting()).await;
    let actual_ids = entity_ids(&results);

    // Verify results
    assert_eq!(
        actual_ids,
        expected_ids,
        "[{case_name}] Mismatch: expected {} entities, got {}",
        expected_ids.len(),
        actual_ids.len()
    );
}

// -----------------------------------------------------------------------------
// Case 1: email = X
// -----------------------------------------------------------------------------

#[tokio::test]
async fn truth_table_case_1_email_eq() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    // Truth table from docs:
    // | Type | email=X | Original | Protected | Correct? |
    // | U    | ✓       | ret      | excl      | ✓        |
    // | U    | ✗       | excl     | excl      | ✓        |
    // | I    | ✓       | ret      | ret       | ✓        |
    // | I    | ✗       | excl     | excl      | ✓        |
    let rows = [
        Row {
            is_user: true,
            email_match: true,
            shortname_match: false,
            expected_returned: false, // User excluded
        },
        Row {
            is_user: true,
            email_match: false,
            shortname_match: false,
            expected_returned: false, // No email match
        },
        Row {
            is_user: false,
            email_match: true,
            shortname_match: false,
            expected_returned: true, // Invitation returned
        },
        Row {
            is_user: false,
            email_match: false,
            shortname_match: false,
            expected_returned: false, // No email match
        },
    ];

    verify_truth_table(
        &mut api,
        &rows,
        email_filter(TARGET_EMAIL),
        "Case 1: email = X",
    )
    .await;
}

// -----------------------------------------------------------------------------
// Case 2: email = X AND shortname = A
// -----------------------------------------------------------------------------

#[tokio::test]
async fn truth_table_case_2_email_and_shortname() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    // Truth table from docs (8 rows - all combinations)
    let rows = [
        // Users - all excluded due to email protection
        Row {
            is_user: true,
            email_match: true,
            shortname_match: true,
            expected_returned: false,
        },
        Row {
            is_user: true,
            email_match: true,
            shortname_match: false,
            expected_returned: false,
        },
        Row {
            is_user: true,
            email_match: false,
            shortname_match: true,
            expected_returned: false,
        },
        Row {
            is_user: true,
            email_match: false,
            shortname_match: false,
            expected_returned: false,
        },
        // Invitations - returned only if BOTH match
        Row {
            is_user: false,
            email_match: true,
            shortname_match: true,
            expected_returned: true,
        },
        Row {
            is_user: false,
            email_match: true,
            shortname_match: false,
            expected_returned: false,
        },
        Row {
            is_user: false,
            email_match: false,
            shortname_match: true,
            expected_returned: false,
        },
        Row {
            is_user: false,
            email_match: false,
            shortname_match: false,
            expected_returned: false,
        },
    ];

    let filter = Filter::All(vec![
        email_filter(TARGET_EMAIL),
        shortname_filter(TARGET_SHORTNAME),
    ]);

    verify_truth_table(
        &mut api,
        &rows,
        filter,
        "Case 2: email = X AND shortname = A",
    )
    .await;
}

// -----------------------------------------------------------------------------
// Case 3: email = X OR shortname = A
// -----------------------------------------------------------------------------

#[tokio::test]
async fn truth_table_case_3_email_or_shortname() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    // Truth table from docs:
    // Users returned via shortname, but NOT via email
    let rows = [
        Row {
            is_user: true,
            email_match: true,
            shortname_match: true,
            expected_returned: true, // via shortname
        },
        Row {
            is_user: true,
            email_match: true,
            shortname_match: false,
            expected_returned: false, // email protected
        },
        Row {
            is_user: true,
            email_match: false,
            shortname_match: true,
            expected_returned: true, // via shortname
        },
        Row {
            is_user: true,
            email_match: false,
            shortname_match: false,
            expected_returned: false, // no match
        },
        // Invitations - returned if EITHER matches
        Row {
            is_user: false,
            email_match: true,
            shortname_match: true,
            expected_returned: true,
        },
        Row {
            is_user: false,
            email_match: true,
            shortname_match: false,
            expected_returned: true,
        },
        Row {
            is_user: false,
            email_match: false,
            shortname_match: true,
            expected_returned: true,
        },
        Row {
            is_user: false,
            email_match: false,
            shortname_match: false,
            expected_returned: false,
        },
    ];

    let filter = Filter::Any(vec![
        email_filter(TARGET_EMAIL),
        shortname_filter(TARGET_SHORTNAME),
    ]);

    verify_truth_table(
        &mut api,
        &rows,
        filter,
        "Case 3: email = X OR shortname = A",
    )
    .await;
}

// -----------------------------------------------------------------------------
// Case 4: NOT(email = X)
// -----------------------------------------------------------------------------

#[tokio::test]
async fn truth_table_case_4_not_email() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    // Truth table from docs:
    // Users always excluded (enumeration protection)
    let rows = [
        Row {
            is_user: true,
            email_match: true,
            shortname_match: false,
            expected_returned: false, // User excluded
        },
        Row {
            is_user: true,
            email_match: false,
            shortname_match: false,
            expected_returned: false, // User excluded (enumeration protection)
        },
        Row {
            is_user: false,
            email_match: true,
            shortname_match: false,
            expected_returned: false, // NOT(email=X) fails when email=X
        },
        Row {
            is_user: false,
            email_match: false,
            shortname_match: false,
            expected_returned: true, // email != X
        },
    ];

    let filter = Filter::Not(Box::new(email_filter(TARGET_EMAIL)));

    verify_truth_table(&mut api, &rows, filter, "Case 4: NOT(email = X)").await;
}

// -----------------------------------------------------------------------------
// Case 5: NOT(email = X OR shortname = A)
// -----------------------------------------------------------------------------

#[tokio::test]
async fn truth_table_case_5_not_email_or_shortname() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    // Truth table from docs:
    // Returns entities matching NEITHER condition
    // Users always excluded
    let rows = [
        // Users - all excluded
        Row {
            is_user: true,
            email_match: true,
            shortname_match: true,
            expected_returned: false,
        },
        Row {
            is_user: true,
            email_match: true,
            shortname_match: false,
            expected_returned: false,
        },
        Row {
            is_user: true,
            email_match: false,
            shortname_match: true,
            expected_returned: false,
        },
        Row {
            is_user: true,
            email_match: false,
            shortname_match: false,
            expected_returned: false, // enumeration protection
        },
        // Invitations - returned only if NEITHER matches
        Row {
            is_user: false,
            email_match: true,
            shortname_match: true,
            expected_returned: false,
        },
        Row {
            is_user: false,
            email_match: true,
            shortname_match: false,
            expected_returned: false,
        },
        Row {
            is_user: false,
            email_match: false,
            shortname_match: true,
            expected_returned: false,
        },
        Row {
            is_user: false,
            email_match: false,
            shortname_match: false,
            expected_returned: true, // neither matches
        },
    ];

    let filter = Filter::Not(Box::new(Filter::Any(vec![
        email_filter(TARGET_EMAIL),
        shortname_filter(TARGET_SHORTNAME),
    ])));

    verify_truth_table(
        &mut api,
        &rows,
        filter,
        "Case 5: NOT(email = X OR shortname = A)",
    )
    .await;
}

// -----------------------------------------------------------------------------
// Case 6: NOT(email = X AND shortname = A)
// -----------------------------------------------------------------------------

#[tokio::test]
async fn truth_table_case_6_not_email_and_shortname() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    // Truth table from docs:
    // Returns entities where NOT(email=X AND shortname=A)
    // = NOT(email=X) OR NOT(shortname=A) (De Morgan)
    // Protected: (NOT(email=X) AND NOT(type=User)) OR NOT(shortname=A)
    let rows = [
        // Users
        Row {
            is_user: true,
            email_match: true,
            shortname_match: true,
            expected_returned: false, // both match → excluded
        },
        Row {
            is_user: true,
            email_match: true,
            shortname_match: false,
            expected_returned: true, // via shortname≠A
        },
        Row {
            is_user: true,
            email_match: false,
            shortname_match: true,
            expected_returned: false, // would be via email≠X, blocked
        },
        Row {
            is_user: true,
            email_match: false,
            shortname_match: false,
            expected_returned: true, // via shortname≠A
        },
        // Invitations
        Row {
            is_user: false,
            email_match: true,
            shortname_match: true,
            expected_returned: false, // both match
        },
        Row {
            is_user: false,
            email_match: true,
            shortname_match: false,
            expected_returned: true,
        },
        Row {
            is_user: false,
            email_match: false,
            shortname_match: true,
            expected_returned: true,
        },
        Row {
            is_user: false,
            email_match: false,
            shortname_match: false,
            expected_returned: true,
        },
    ];

    let filter = Filter::Not(Box::new(Filter::All(vec![
        email_filter(TARGET_EMAIL),
        shortname_filter(TARGET_SHORTNAME),
    ])));

    verify_truth_table(
        &mut api,
        &rows,
        filter,
        "Case 6: NOT(email = X AND shortname = A)",
    )
    .await;
}

// -----------------------------------------------------------------------------
// Case 7: NOT(NOT(email = X))
// -----------------------------------------------------------------------------

#[tokio::test]
async fn truth_table_case_7_double_not_email() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    // Double negation = email = X
    // Same as Case 1
    let rows = [
        Row {
            is_user: true,
            email_match: true,
            shortname_match: false,
            expected_returned: false,
        },
        Row {
            is_user: true,
            email_match: false,
            shortname_match: false,
            expected_returned: false,
        },
        Row {
            is_user: false,
            email_match: true,
            shortname_match: false,
            expected_returned: true,
        },
        Row {
            is_user: false,
            email_match: false,
            shortname_match: false,
            expected_returned: false,
        },
    ];

    let filter = Filter::Not(Box::new(Filter::Not(Box::new(email_filter(TARGET_EMAIL)))));

    verify_truth_table(&mut api, &rows, filter, "Case 7: NOT(NOT(email = X))").await;
}

// -----------------------------------------------------------------------------
// Case 8: NOT(NOT(NOT(email = X)))
// -----------------------------------------------------------------------------

#[tokio::test]
async fn truth_table_case_8_triple_not_email() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    // Triple negation = NOT(email = X)
    // Same as Case 4
    let rows = [
        Row {
            is_user: true,
            email_match: true,
            shortname_match: false,
            expected_returned: false,
        },
        Row {
            is_user: true,
            email_match: false,
            shortname_match: false,
            expected_returned: false,
        },
        Row {
            is_user: false,
            email_match: true,
            shortname_match: false,
            expected_returned: false,
        },
        Row {
            is_user: false,
            email_match: false,
            shortname_match: false,
            expected_returned: true,
        },
    ];

    let filter = Filter::Not(Box::new(Filter::Not(Box::new(Filter::Not(Box::new(
        email_filter(TARGET_EMAIL),
    ))))));

    verify_truth_table(&mut api, &rows, filter, "Case 8: NOT(NOT(NOT(email = X)))").await;
}

// -----------------------------------------------------------------------------
// Case 9: NOT(shortname = A OR NOT(email = X))
// -----------------------------------------------------------------------------

#[tokio::test]
async fn truth_table_case_9_complex_nested() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    // Original: NOT(shortname = A OR NOT(email = X))
    // = shortname ≠ A AND email = X
    // Protected: shortname ≠ A AND email = X AND NOT(type = User)
    let rows = [
        // Users - all excluded
        Row {
            is_user: true,
            email_match: true,
            shortname_match: true,
            expected_returned: false,
        },
        Row {
            is_user: true,
            email_match: true,
            shortname_match: false,
            expected_returned: false, // User excluded
        },
        Row {
            is_user: true,
            email_match: false,
            shortname_match: true,
            expected_returned: false,
        },
        Row {
            is_user: true,
            email_match: false,
            shortname_match: false,
            expected_returned: false,
        },
        // Invitations
        Row {
            is_user: false,
            email_match: true,
            shortname_match: true,
            expected_returned: false, // shortname = A fails
        },
        Row {
            is_user: false,
            email_match: true,
            shortname_match: false,
            expected_returned: true, // email = X AND shortname ≠ A
        },
        Row {
            is_user: false,
            email_match: false,
            shortname_match: true,
            expected_returned: false, // email ≠ X fails
        },
        Row {
            is_user: false,
            email_match: false,
            shortname_match: false,
            expected_returned: false, // email ≠ X fails
        },
    ];

    let filter = Filter::Not(Box::new(Filter::Any(vec![
        shortname_filter(TARGET_SHORTNAME),
        Filter::Not(Box::new(email_filter(TARGET_EMAIL))),
    ])));

    verify_truth_table(
        &mut api,
        &rows,
        filter,
        "Case 9: NOT(shortname = A OR NOT(email = X))",
    )
    .await;
}

// =============================================================================
// Multi-Property Protection Tests (2 properties / 1 type)
// =============================================================================
//
// These tests verify that protection works correctly when multiple properties
// are protected for the same entity type.
//
// Config: email → {User}, phone → {User}
//
// Truth Tables:
//
// Case MP-1: email = X
// ┌──────┬─────────┬──────────┐
// │ Type │ email=X │ Result   │
// ├──────┼─────────┼──────────┤
// │ U    │ ✓       │ excluded │  ← email protected for User
// │ U    │ ✗       │ excluded │  ← no match
// │ I    │ ✓       │ returned │
// │ I    │ ✗       │ excluded │  ← no match
// └──────┴─────────┴──────────┘
//
// Case MP-2: phone = Y
// ┌──────┬─────────┬──────────┐
// │ Type │ phone=Y │ Result   │
// ├──────┼─────────┼──────────┤
// │ U    │ ✓       │ excluded │  ← phone protected for User
// │ U    │ ✗       │ excluded │  ← no match
// │ I    │ ✓       │ returned │
// │ I    │ ✗       │ excluded │  ← no match
// └──────┴─────────┴──────────┘
//
// Case MP-3: email = X AND phone = Y
// ┌──────┬─────────┬─────────┬──────────┐
// │ Type │ email=X │ phone=Y │ Result   │
// ├──────┼─────────┼─────────┼──────────┤
// │ U    │ ✓       │ ✓       │ excluded │  ← both properties protected
// │ U    │ ✓       │ ✗       │ excluded │  ← no phone match
// │ U    │ ✗       │ ✓       │ excluded │  ← no email match
// │ U    │ ✗       │ ✗       │ excluded │  ← no match
// │ I    │ ✓       │ ✓       │ returned │
// │ I    │ ✓       │ ✗       │ excluded │  ← no phone match
// │ I    │ ✗       │ ✓       │ excluded │  ← no email match
// │ I    │ ✗       │ ✗       │ excluded │  ← no match
// └──────┴─────────┴─────────┴──────────┘
//
// Case MP-4: email = X OR phone = Y
// ┌──────┬─────────┬─────────┬──────────┐
// │ Type │ email=X │ phone=Y │ Result   │
// ├──────┼─────────┼─────────┼──────────┤
// │ U    │ ✓       │ ✓       │ excluded │  ← both branches blocked
// │ U    │ ✓       │ ✗       │ excluded │  ← email blocked, no phone
// │ U    │ ✗       │ ✓       │ excluded │  ← phone blocked, no email
// │ U    │ ✗       │ ✗       │ excluded │  ← no match
// │ I    │ ✓       │ ✓       │ returned │  ← either branch
// │ I    │ ✓       │ ✗       │ returned │  ← via email
// │ I    │ ✗       │ ✓       │ returned │  ← via phone
// │ I    │ ✗       │ ✗       │ excluded │  ← no match
// └──────┴─────────┴─────────┴──────────┘

/// Phone property base URL for multi-property tests.
const PHONE_PROPERTY_BASE_URL: &str = "https://hash.ai/@h/types/property-type/phone/";

/// Phone property type JSON for seeding.
const PHONE_PROPERTY_TYPE: &str = r#"{
    "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
    "kind": "propertyType",
    "$id": "https://hash.ai/@h/types/property-type/phone/v/1",
    "title": "Phone",
    "description": "A phone number.",
    "oneOf": [
        {
            "$ref": "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1"
        }
    ]
}"#;

/// User entity type with email, shortname, AND phone properties.
const USER_WITH_PHONE_ENTITY_TYPE: &str = r#"{
    "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/entity-type",
    "kind": "entityType",
    "$id": "https://hash.ai/@h/types/entity-type/user/v/1",
    "type": "object",
    "title": "User",
    "description": "A user entity with email and phone protection.",
    "properties": {
        "https://hash.ai/@h/types/property-type/email/": {
            "$ref": "https://hash.ai/@h/types/property-type/email/v/1"
        },
        "https://hash.ai/@h/types/property-type/shortname/": {
            "$ref": "https://hash.ai/@h/types/property-type/shortname/v/1"
        },
        "https://hash.ai/@h/types/property-type/phone/": {
            "$ref": "https://hash.ai/@h/types/property-type/phone/v/1"
        }
    }
}"#;

/// Invitation entity type with email, shortname, AND phone properties.
const INVITATION_WITH_PHONE_ENTITY_TYPE: &str = r#"{
    "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/entity-type",
    "kind": "entityType",
    "$id": "https://blockprotocol.org/@test/types/entity-type/invitation/v/1",
    "type": "object",
    "title": "Invitation",
    "description": "An invitation entity with email and phone (not protected).",
    "properties": {
        "https://hash.ai/@h/types/property-type/email/": {
            "$ref": "https://hash.ai/@h/types/property-type/email/v/1"
        },
        "https://hash.ai/@h/types/property-type/shortname/": {
            "$ref": "https://hash.ai/@h/types/property-type/shortname/v/1"
        },
        "https://hash.ai/@h/types/property-type/phone/": {
            "$ref": "https://hash.ai/@h/types/property-type/phone/v/1"
        }
    }
}"#;

/// Helper to create a properties object with email, shortname, and phone.
fn properties_with_phone(email: &str, shortname: &str, phone: &str) -> PropertyObject {
    serde_json::from_value(serde_json::json!({
        "https://hash.ai/@h/types/property-type/email/": email,
        "https://hash.ai/@h/types/property-type/shortname/": shortname,
        "https://hash.ai/@h/types/property-type/phone/": phone
    }))
    .expect("could not create properties")
}

/// Helper to create a filter that matches entities by phone.
fn phone_filter(phone: &str) -> Filter<'static, type_system::knowledge::entity::Entity> {
    Filter::Equal(
        FilterExpression::Path {
            path: hash_graph_store::entity::EntityQueryPath::Properties(Some(
                JsonPath::from_path_tokens(vec![PathToken::Field(Cow::Owned(
                    PHONE_PROPERTY_BASE_URL.to_owned(),
                ))]),
            )),
        },
        FilterExpression::Parameter {
            parameter: Parameter::Text(Cow::Owned(phone.to_owned())),
            convert: None,
        },
    )
}

/// Creates a FilterProtectionConfig that protects both email AND phone for User.
fn multi_property_config() -> FilterProtectionConfig {
    let email_url = BaseUrl::new(EMAIL_PROPERTY_BASE_URL.to_owned()).expect("valid email base URL");
    let phone_url = BaseUrl::new(PHONE_PROPERTY_BASE_URL.to_owned()).expect("valid phone base URL");
    let user_url = BaseUrl::new(USER_ENTITY_TYPE_BASE_URL.to_owned()).expect("valid user base URL");

    FilterProtectionConfig::new()
        .protect_property(email_url, HashSet::from([user_url.clone()]))
        .protect_property(phone_url, HashSet::from([user_url]))
}

/// Seeds the database with multi-property protection config.
async fn seed_multi_property(database: &mut DatabaseTestWrapper) -> DatabaseApi<'_> {
    database
        .seed(
            [data_type::VALUE_V1, data_type::TEXT_V1],
            [
                EMAIL_PROPERTY_TYPE,
                SHORTNAME_PROPERTY_TYPE,
                PHONE_PROPERTY_TYPE,
            ],
            [
                USER_WITH_PHONE_ENTITY_TYPE,
                INVITATION_WITH_PHONE_ENTITY_TYPE,
            ],
        )
        .await
        .expect("could not seed database")
}

impl DatabaseApi<'_> {
    async fn create_user_with_phone(
        &mut self,
        email: &str,
        shortname: &str,
        phone: &str,
    ) -> Entity {
        self.create_entity(
            self.account_id,
            CreateEntityParams {
                web_id: WebId::new(self.account_id),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([VersionedUrl {
                    base_url: BaseUrl::new(USER_ENTITY_TYPE_BASE_URL.to_owned()).unwrap(),
                    version: OntologyTypeVersion {
                        major: 1,
                        pre_release: None,
                    },
                }]),
                properties: PropertyObjectWithMetadata::from_parts(
                    properties_with_phone(email, shortname, phone),
                    None,
                )
                .unwrap(),
                confidence: None,
                link_data: None,
                draft: false,
                policies: Vec::new(),
                provenance: ProvidedEntityEditionProvenance {
                    actor_type: ActorType::User,
                    origin: OriginProvenance::from_empty_type(OriginType::Api),
                    sources: Vec::new(),
                },
            },
        )
        .await
        .expect("could not create user entity with phone")
    }

    async fn create_invitation_with_phone(
        &mut self,
        email: &str,
        shortname: &str,
        phone: &str,
    ) -> Entity {
        self.create_entity(
            self.account_id,
            CreateEntityParams {
                web_id: WebId::new(self.account_id),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([VersionedUrl {
                    base_url: BaseUrl::new(INVITATION_ENTITY_TYPE_BASE_URL.to_owned()).unwrap(),
                    version: OntologyTypeVersion {
                        major: 1,
                        pre_release: None,
                    },
                }]),
                properties: PropertyObjectWithMetadata::from_parts(
                    properties_with_phone(email, shortname, phone),
                    None,
                )
                .unwrap(),
                confidence: None,
                link_data: None,
                draft: false,
                policies: Vec::new(),
                provenance: ProvidedEntityEditionProvenance {
                    actor_type: ActorType::User,
                    origin: OriginProvenance::from_empty_type(OriginType::Api),
                    sources: Vec::new(),
                },
            },
        )
        .await
        .expect("could not create invitation entity with phone")
    }
}

const TARGET_PHONE: &str = "+1234567890";
const OTHER_PHONE: &str = "+0987654321";

/// Test input row for multi-property truth table verification.
#[derive(Debug, Clone, Copy)]
#[expect(clippy::struct_excessive_bools, reason = "test data structure")]
struct MultiPropertyRow {
    is_user: bool,
    email_match: bool,
    phone_match: bool,
    expected_returned: bool,
}

impl MultiPropertyRow {
    const fn email(self) -> &'static str {
        if self.email_match {
            TARGET_EMAIL
        } else {
            OTHER_EMAIL
        }
    }

    const fn phone(self) -> &'static str {
        if self.phone_match {
            TARGET_PHONE
        } else {
            OTHER_PHONE
        }
    }
}

/// Verifies multi-property truth table.
async fn verify_multi_property_truth_table(
    api: &mut DatabaseApi<'_>,
    rows: &[MultiPropertyRow],
    filter: Filter<'_, Entity>,
    case_name: &str,
) {
    let mut expected_ids: HashSet<EntityId> = HashSet::new();

    for (i, row) in rows.iter().enumerate() {
        let entity = if row.is_user {
            api.create_user_with_phone(row.email(), "test", row.phone())
                .await
        } else {
            api.create_invitation_with_phone(row.email(), "test", row.phone())
                .await
        };

        if row.expected_returned {
            expected_ids.insert(entity.metadata.record_id.entity_id);
        }

        eprintln!(
            "[{case_name}] Row {i}: {} email={} phone={} → expected={}",
            if row.is_user { "User" } else { "Invitation" },
            if row.email_match { "✓" } else { "✗" },
            if row.phone_match { "✓" } else { "✗" },
            if row.expected_returned { "ret" } else { "excl" }
        );
    }

    let results = api.query(filter, no_sorting()).await;
    let actual_ids = entity_ids(&results);

    assert_eq!(
        actual_ids,
        expected_ids,
        "[{case_name}] Mismatch: expected {} entities, got {}",
        expected_ids.len(),
        actual_ids.len()
    );
}

// -----------------------------------------------------------------------------
// Multi-Property Case 1: email = X (with multi-property config)
// -----------------------------------------------------------------------------

#[tokio::test]
async fn multi_property_email_filter_excludes_user() {
    let settings = PostgresStoreSettings {
        filter_protection: multi_property_config(),
        ..PostgresStoreSettings::default()
    };
    let mut database = DatabaseTestWrapper::new_with_settings(settings).await;
    let mut api = seed_multi_property(&mut database).await;

    let rows = [
        MultiPropertyRow {
            is_user: true,
            email_match: true,
            phone_match: false,
            expected_returned: false, // User excluded via email
        },
        MultiPropertyRow {
            is_user: true,
            email_match: false,
            phone_match: false,
            expected_returned: false, // No email match
        },
        MultiPropertyRow {
            is_user: false,
            email_match: true,
            phone_match: false,
            expected_returned: true, // Invitation returned
        },
        MultiPropertyRow {
            is_user: false,
            email_match: false,
            phone_match: false,
            expected_returned: false, // No email match
        },
    ];

    verify_multi_property_truth_table(
        &mut api,
        &rows,
        email_filter(TARGET_EMAIL),
        "Multi-prop: email = X",
    )
    .await;
}

// -----------------------------------------------------------------------------
// Multi-Property Case 2: phone = Y (with multi-property config)
// -----------------------------------------------------------------------------

#[tokio::test]
async fn multi_property_phone_filter_excludes_user() {
    let settings = PostgresStoreSettings {
        filter_protection: multi_property_config(),
        ..PostgresStoreSettings::default()
    };
    let mut database = DatabaseTestWrapper::new_with_settings(settings).await;
    let mut api = seed_multi_property(&mut database).await;

    let rows = [
        MultiPropertyRow {
            is_user: true,
            email_match: false,
            phone_match: true,
            expected_returned: false, // User excluded via phone
        },
        MultiPropertyRow {
            is_user: true,
            email_match: false,
            phone_match: false,
            expected_returned: false, // No phone match
        },
        MultiPropertyRow {
            is_user: false,
            email_match: false,
            phone_match: true,
            expected_returned: true, // Invitation returned
        },
        MultiPropertyRow {
            is_user: false,
            email_match: false,
            phone_match: false,
            expected_returned: false, // No phone match
        },
    ];

    verify_multi_property_truth_table(
        &mut api,
        &rows,
        phone_filter(TARGET_PHONE),
        "Multi-prop: phone = Y",
    )
    .await;
}

// -----------------------------------------------------------------------------
// Multi-Property Case 3: email = X AND phone = Y
// -----------------------------------------------------------------------------

#[tokio::test]
async fn multi_property_email_and_phone_filter() {
    let settings = PostgresStoreSettings {
        filter_protection: multi_property_config(),
        ..PostgresStoreSettings::default()
    };
    let mut database = DatabaseTestWrapper::new_with_settings(settings).await;
    let mut api = seed_multi_property(&mut database).await;

    // Both email and phone protected for User
    // Filter: email = X AND phone = Y
    // Users excluded regardless of match (both properties protected)
    let rows = [
        MultiPropertyRow {
            is_user: true,
            email_match: true,
            phone_match: true,
            expected_returned: false, // User excluded
        },
        MultiPropertyRow {
            is_user: true,
            email_match: true,
            phone_match: false,
            expected_returned: false, // User excluded
        },
        MultiPropertyRow {
            is_user: true,
            email_match: false,
            phone_match: true,
            expected_returned: false, // User excluded
        },
        MultiPropertyRow {
            is_user: true,
            email_match: false,
            phone_match: false,
            expected_returned: false, // No match
        },
        MultiPropertyRow {
            is_user: false,
            email_match: true,
            phone_match: true,
            expected_returned: true, // Invitation with both matches
        },
        MultiPropertyRow {
            is_user: false,
            email_match: true,
            phone_match: false,
            expected_returned: false, // No phone match
        },
        MultiPropertyRow {
            is_user: false,
            email_match: false,
            phone_match: true,
            expected_returned: false, // No email match
        },
        MultiPropertyRow {
            is_user: false,
            email_match: false,
            phone_match: false,
            expected_returned: false, // No match
        },
    ];

    let filter = Filter::All(vec![email_filter(TARGET_EMAIL), phone_filter(TARGET_PHONE)]);

    verify_multi_property_truth_table(
        &mut api,
        &rows,
        filter,
        "Multi-prop: email = X AND phone = Y",
    )
    .await;
}

// -----------------------------------------------------------------------------
// Multi-Property Case 4: email = X OR phone = Y
// -----------------------------------------------------------------------------

#[tokio::test]
async fn multi_property_email_or_phone_filter() {
    let settings = PostgresStoreSettings {
        filter_protection: multi_property_config(),
        ..PostgresStoreSettings::default()
    };
    let mut database = DatabaseTestWrapper::new_with_settings(settings).await;
    let mut api = seed_multi_property(&mut database).await;

    // Both email and phone protected for User
    // Filter: email = X OR phone = Y
    // User excluded from BOTH branches independently
    let rows = [
        MultiPropertyRow {
            is_user: true,
            email_match: true,
            phone_match: true,
            expected_returned: false, // Both branches blocked
        },
        MultiPropertyRow {
            is_user: true,
            email_match: true,
            phone_match: false,
            expected_returned: false, // Email branch blocked
        },
        MultiPropertyRow {
            is_user: true,
            email_match: false,
            phone_match: true,
            expected_returned: false, // Phone branch blocked
        },
        MultiPropertyRow {
            is_user: true,
            email_match: false,
            phone_match: false,
            expected_returned: false, // No match
        },
        MultiPropertyRow {
            is_user: false,
            email_match: true,
            phone_match: true,
            expected_returned: true, // Either branch works
        },
        MultiPropertyRow {
            is_user: false,
            email_match: true,
            phone_match: false,
            expected_returned: true, // Email branch
        },
        MultiPropertyRow {
            is_user: false,
            email_match: false,
            phone_match: true,
            expected_returned: true, // Phone branch
        },
        MultiPropertyRow {
            is_user: false,
            email_match: false,
            phone_match: false,
            expected_returned: false, // No match
        },
    ];

    let filter = Filter::Any(vec![email_filter(TARGET_EMAIL), phone_filter(TARGET_PHONE)]);

    verify_multi_property_truth_table(
        &mut api,
        &rows,
        filter,
        "Multi-prop: email = X OR phone = Y",
    )
    .await;
}

// =============================================================================
// Multi-Type Protection Tests (2 types / 1 property each)
// =============================================================================
//
// These tests verify that protection works correctly when different properties
// are protected for different entity types.
//
// Config: email → {User}, secret_code → {SecretEntity}
//
// Truth Tables:
//
// Case MT-1: email = X (only User excluded)
// ┌────────┬─────────┬──────────┐
// │ Type   │ email=X │ Result   │
// ├────────┼─────────┼──────────┤
// │ User   │ ✓       │ excluded │  ← email protected for User
// │ User   │ ✗       │ excluded │  ← no match
// │ Secret │ ✓       │ returned │  ← email NOT protected for Secret
// │ Secret │ ✗       │ excluded │  ← no match
// └────────┴─────────┴──────────┘
//
// Case MT-2: secret_code = S (only SecretEntity excluded)
// ┌────────┬──────────┬──────────┐
// │ Type   │ secret=S │ Result   │
// ├────────┼──────────┼──────────┤
// │ User   │ ✓        │ returned │  ← secret NOT protected for User
// │ User   │ ✗        │ excluded │  ← no match
// │ Secret │ ✓        │ excluded │  ← secret protected for Secret
// │ Secret │ ✗        │ excluded │  ← no match
// └────────┴──────────┴──────────┘
//
// Case MT-3: email = X AND secret_code = S
// ┌────────┬─────────┬──────────┬──────────┐
// │ Type   │ email=X │ secret=S │ Result   │
// ├────────┼─────────┼──────────┼──────────┤
// │ User   │ ✓       │ ✓        │ excluded │  ← email protected for User
// │ User   │ ✓       │ ✗        │ excluded │  ← no secret match
// │ User   │ ✗       │ ✓        │ excluded │  ← no email match
// │ User   │ ✗       │ ✗        │ excluded │  ← no match
// │ Secret │ ✓       │ ✓        │ excluded │  ← secret protected for Secret
// │ Secret │ ✓       │ ✗        │ excluded │  ← no secret match
// │ Secret │ ✗       │ ✓        │ excluded │  ← no email match
// │ Secret │ ✗       │ ✗        │ excluded │  ← no match
// └────────┴─────────┴──────────┴──────────┘
//
// Case MT-4: email = X OR secret_code = S
// ┌────────┬─────────┬──────────┬──────────┐
// │ Type   │ email=X │ secret=S │ Result   │
// ├────────┼─────────┼──────────┼──────────┤
// │ User   │ ✓       │ ✓        │ returned │  ← via secret (not protected)
// │ User   │ ✓       │ ✗        │ excluded │  ← email blocked, no secret
// │ User   │ ✗       │ ✓        │ returned │  ← via secret
// │ User   │ ✗       │ ✗        │ excluded │  ← no match
// │ Secret │ ✓       │ ✓        │ returned │  ← via email (not protected)
// │ Secret │ ✓       │ ✗        │ returned │  ← via email
// │ Secret │ ✗       │ ✓        │ excluded │  ← secret blocked, no email
// │ Secret │ ✗       │ ✗        │ excluded │  ← no match
// └────────┴─────────┴──────────┴──────────┘

/// Secret code property base URL for multi-type tests.
const SECRET_CODE_PROPERTY_BASE_URL: &str =
    "https://blockprotocol.org/@test/types/property-type/secret-code/";

/// SecretEntity type base URL.
const SECRET_ENTITY_TYPE_BASE_URL: &str =
    "https://blockprotocol.org/@test/types/entity-type/secret-entity/";

/// Secret code property type JSON for seeding.
const SECRET_CODE_PROPERTY_TYPE: &str = r#"{
    "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
    "kind": "propertyType",
    "$id": "https://blockprotocol.org/@test/types/property-type/secret-code/v/1",
    "title": "Secret Code",
    "description": "A secret code that should be protected.",
    "oneOf": [
        {
            "$ref": "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1"
        }
    ]
}"#;

/// User entity type with email AND secret_code for multi-type tests.
const USER_WITH_SECRET_ENTITY_TYPE: &str = r#"{
    "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/entity-type",
    "kind": "entityType",
    "$id": "https://hash.ai/@h/types/entity-type/user/v/1",
    "type": "object",
    "title": "User",
    "description": "A user entity (email protected, secret_code NOT protected).",
    "properties": {
        "https://hash.ai/@h/types/property-type/email/": {
            "$ref": "https://hash.ai/@h/types/property-type/email/v/1"
        },
        "https://hash.ai/@h/types/property-type/shortname/": {
            "$ref": "https://hash.ai/@h/types/property-type/shortname/v/1"
        },
        "https://blockprotocol.org/@test/types/property-type/secret-code/": {
            "$ref": "https://blockprotocol.org/@test/types/property-type/secret-code/v/1"
        }
    }
}"#;

/// SecretEntity type with email AND secret_code (secret_code protected).
const SECRET_ENTITY_TYPE: &str = r#"{
    "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/entity-type",
    "kind": "entityType",
    "$id": "https://blockprotocol.org/@test/types/entity-type/secret-entity/v/1",
    "type": "object",
    "title": "SecretEntity",
    "description": "An entity where secret_code is protected.",
    "properties": {
        "https://hash.ai/@h/types/property-type/email/": {
            "$ref": "https://hash.ai/@h/types/property-type/email/v/1"
        },
        "https://hash.ai/@h/types/property-type/shortname/": {
            "$ref": "https://hash.ai/@h/types/property-type/shortname/v/1"
        },
        "https://blockprotocol.org/@test/types/property-type/secret-code/": {
            "$ref": "https://blockprotocol.org/@test/types/property-type/secret-code/v/1"
        }
    }
}"#;

/// Helper to create a properties object with email, shortname, and secret_code.
fn properties_with_secret(email: &str, shortname: &str, secret_code: &str) -> PropertyObject {
    serde_json::from_value(serde_json::json!({
        "https://hash.ai/@h/types/property-type/email/": email,
        "https://hash.ai/@h/types/property-type/shortname/": shortname,
        "https://blockprotocol.org/@test/types/property-type/secret-code/": secret_code
    }))
    .expect("could not create properties")
}

/// Helper to create a filter that matches entities by secret_code.
fn secret_code_filter(
    secret_code: &str,
) -> Filter<'static, type_system::knowledge::entity::Entity> {
    Filter::Equal(
        FilterExpression::Path {
            path: hash_graph_store::entity::EntityQueryPath::Properties(Some(
                JsonPath::from_path_tokens(vec![PathToken::Field(Cow::Owned(
                    SECRET_CODE_PROPERTY_BASE_URL.to_owned(),
                ))]),
            )),
        },
        FilterExpression::Parameter {
            parameter: Parameter::Text(Cow::Owned(secret_code.to_owned())),
            convert: None,
        },
    )
}

/// Creates a FilterProtectionConfig for multi-type testing:
/// - email protected for User
/// - secret_code protected for SecretEntity
fn multi_type_config() -> FilterProtectionConfig {
    let email_url = BaseUrl::new(EMAIL_PROPERTY_BASE_URL.to_owned()).expect("valid email base URL");
    let secret_code_url =
        BaseUrl::new(SECRET_CODE_PROPERTY_BASE_URL.to_owned()).expect("valid secret_code base URL");
    let user_url = BaseUrl::new(USER_ENTITY_TYPE_BASE_URL.to_owned()).expect("valid user base URL");
    let secret_entity_url =
        BaseUrl::new(SECRET_ENTITY_TYPE_BASE_URL.to_owned()).expect("valid secret_entity base URL");

    FilterProtectionConfig::new()
        .protect_property(email_url, HashSet::from([user_url]))
        .protect_property(secret_code_url, HashSet::from([secret_entity_url]))
}

/// Seeds the database with multi-type protection config.
async fn seed_multi_type(database: &mut DatabaseTestWrapper) -> DatabaseApi<'_> {
    database
        .seed(
            [data_type::VALUE_V1, data_type::TEXT_V1],
            [
                EMAIL_PROPERTY_TYPE,
                SHORTNAME_PROPERTY_TYPE,
                SECRET_CODE_PROPERTY_TYPE,
            ],
            [USER_WITH_SECRET_ENTITY_TYPE, SECRET_ENTITY_TYPE],
        )
        .await
        .expect("could not seed database")
}

impl DatabaseApi<'_> {
    async fn create_user_with_secret(
        &mut self,
        email: &str,
        shortname: &str,
        secret_code: &str,
    ) -> Entity {
        self.create_entity(
            self.account_id,
            CreateEntityParams {
                web_id: WebId::new(self.account_id),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([VersionedUrl {
                    base_url: BaseUrl::new(USER_ENTITY_TYPE_BASE_URL.to_owned()).unwrap(),
                    version: OntologyTypeVersion {
                        major: 1,
                        pre_release: None,
                    },
                }]),
                properties: PropertyObjectWithMetadata::from_parts(
                    properties_with_secret(email, shortname, secret_code),
                    None,
                )
                .unwrap(),
                confidence: None,
                link_data: None,
                draft: false,
                policies: Vec::new(),
                provenance: ProvidedEntityEditionProvenance {
                    actor_type: ActorType::User,
                    origin: OriginProvenance::from_empty_type(OriginType::Api),
                    sources: Vec::new(),
                },
            },
        )
        .await
        .expect("could not create user entity with secret")
    }

    async fn create_secret_entity(
        &mut self,
        email: &str,
        shortname: &str,
        secret_code: &str,
    ) -> Entity {
        self.create_entity(
            self.account_id,
            CreateEntityParams {
                web_id: WebId::new(self.account_id),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([VersionedUrl {
                    base_url: BaseUrl::new(SECRET_ENTITY_TYPE_BASE_URL.to_owned()).unwrap(),
                    version: OntologyTypeVersion {
                        major: 1,
                        pre_release: None,
                    },
                }]),
                properties: PropertyObjectWithMetadata::from_parts(
                    properties_with_secret(email, shortname, secret_code),
                    None,
                )
                .unwrap(),
                confidence: None,
                link_data: None,
                draft: false,
                policies: Vec::new(),
                provenance: ProvidedEntityEditionProvenance {
                    actor_type: ActorType::User,
                    origin: OriginProvenance::from_empty_type(OriginType::Api),
                    sources: Vec::new(),
                },
            },
        )
        .await
        .expect("could not create secret entity")
    }
}

const TARGET_SECRET: &str = "SECRET123";
const OTHER_SECRET: &str = "OTHER456";

/// Entity type for multi-type tests.
#[derive(Debug, Clone, Copy)]
enum MultiTypeEntityKind {
    User,
    SecretEntity,
}

/// Test input row for multi-type truth table verification.
#[derive(Debug, Clone, Copy)]
#[expect(clippy::struct_excessive_bools, reason = "test data structure")]
struct MultiTypeRow {
    entity_kind: MultiTypeEntityKind,
    email_match: bool,
    secret_code_match: bool,
    expected_returned: bool,
}

impl MultiTypeRow {
    const fn email(self) -> &'static str {
        if self.email_match {
            TARGET_EMAIL
        } else {
            OTHER_EMAIL
        }
    }

    const fn secret_code(self) -> &'static str {
        if self.secret_code_match {
            TARGET_SECRET
        } else {
            OTHER_SECRET
        }
    }
}

/// Verifies multi-type truth table.
async fn verify_multi_type_truth_table(
    api: &mut DatabaseApi<'_>,
    rows: &[MultiTypeRow],
    filter: Filter<'_, Entity>,
    case_name: &str,
) {
    let mut expected_ids: HashSet<EntityId> = HashSet::new();

    for (i, row) in rows.iter().enumerate() {
        let entity = match row.entity_kind {
            MultiTypeEntityKind::User => {
                api.create_user_with_secret(row.email(), "test", row.secret_code())
                    .await
            }
            MultiTypeEntityKind::SecretEntity => {
                api.create_secret_entity(row.email(), "test", row.secret_code())
                    .await
            }
        };

        if row.expected_returned {
            expected_ids.insert(entity.metadata.record_id.entity_id);
        }

        eprintln!(
            "[{case_name}] Row {i}: {:?} email={} secret={} → expected={}",
            row.entity_kind,
            if row.email_match { "✓" } else { "✗" },
            if row.secret_code_match { "✓" } else { "✗" },
            if row.expected_returned { "ret" } else { "excl" }
        );
    }

    let results = api.query(filter, no_sorting()).await;
    let actual_ids = entity_ids(&results);

    assert_eq!(
        actual_ids,
        expected_ids,
        "[{case_name}] Mismatch: expected {} entities, got {}",
        expected_ids.len(),
        actual_ids.len()
    );
}

// -----------------------------------------------------------------------------
// Multi-Type Case 1: email = X (only User excluded)
// -----------------------------------------------------------------------------

#[tokio::test]
async fn multi_type_email_filter_excludes_only_user() {
    let settings = PostgresStoreSettings {
        filter_protection: multi_type_config(),
        ..PostgresStoreSettings::default()
    };
    let mut database = DatabaseTestWrapper::new_with_settings(settings).await;
    let mut api = seed_multi_type(&mut database).await;

    // email protected for User only, NOT for SecretEntity
    let rows = [
        MultiTypeRow {
            entity_kind: MultiTypeEntityKind::User,
            email_match: true,
            secret_code_match: false,
            expected_returned: false, // User excluded via email
        },
        MultiTypeRow {
            entity_kind: MultiTypeEntityKind::User,
            email_match: false,
            secret_code_match: false,
            expected_returned: false, // No email match
        },
        MultiTypeRow {
            entity_kind: MultiTypeEntityKind::SecretEntity,
            email_match: true,
            secret_code_match: false,
            expected_returned: true, // SecretEntity NOT protected by email
        },
        MultiTypeRow {
            entity_kind: MultiTypeEntityKind::SecretEntity,
            email_match: false,
            secret_code_match: false,
            expected_returned: false, // No email match
        },
    ];

    verify_multi_type_truth_table(
        &mut api,
        &rows,
        email_filter(TARGET_EMAIL),
        "Multi-type: email = X (User excluded, SecretEntity allowed)",
    )
    .await;
}

// -----------------------------------------------------------------------------
// Multi-Type Case 2: secret_code = S (only SecretEntity excluded)
// -----------------------------------------------------------------------------

#[tokio::test]
async fn multi_type_secret_filter_excludes_only_secret_entity() {
    let settings = PostgresStoreSettings {
        filter_protection: multi_type_config(),
        ..PostgresStoreSettings::default()
    };
    let mut database = DatabaseTestWrapper::new_with_settings(settings).await;
    let mut api = seed_multi_type(&mut database).await;

    // secret_code protected for SecretEntity only, NOT for User
    let rows = [
        MultiTypeRow {
            entity_kind: MultiTypeEntityKind::User,
            email_match: false,
            secret_code_match: true,
            expected_returned: true, // User NOT protected by secret_code
        },
        MultiTypeRow {
            entity_kind: MultiTypeEntityKind::User,
            email_match: false,
            secret_code_match: false,
            expected_returned: false, // No secret_code match
        },
        MultiTypeRow {
            entity_kind: MultiTypeEntityKind::SecretEntity,
            email_match: false,
            secret_code_match: true,
            expected_returned: false, // SecretEntity excluded via secret_code
        },
        MultiTypeRow {
            entity_kind: MultiTypeEntityKind::SecretEntity,
            email_match: false,
            secret_code_match: false,
            expected_returned: false, // No secret_code match
        },
    ];

    verify_multi_type_truth_table(
        &mut api,
        &rows,
        secret_code_filter(TARGET_SECRET),
        "Multi-type: secret_code = S (SecretEntity excluded, User allowed)",
    )
    .await;
}

// -----------------------------------------------------------------------------
// Multi-Type Case 3: email = X AND secret_code = S
// -----------------------------------------------------------------------------

#[tokio::test]
async fn multi_type_email_and_secret_filter() {
    let settings = PostgresStoreSettings {
        filter_protection: multi_type_config(),
        ..PostgresStoreSettings::default()
    };
    let mut database = DatabaseTestWrapper::new_with_settings(settings).await;
    let mut api = seed_multi_type(&mut database).await;

    // email protected for User, secret_code protected for SecretEntity
    // Filter: email = X AND secret_code = S
    // User excluded via email, SecretEntity excluded via secret_code
    // → NO entities should match with protection applied
    let rows = [
        MultiTypeRow {
            entity_kind: MultiTypeEntityKind::User,
            email_match: true,
            secret_code_match: true,
            expected_returned: false, // User excluded via email
        },
        MultiTypeRow {
            entity_kind: MultiTypeEntityKind::User,
            email_match: true,
            secret_code_match: false,
            expected_returned: false, // No secret match
        },
        MultiTypeRow {
            entity_kind: MultiTypeEntityKind::User,
            email_match: false,
            secret_code_match: true,
            expected_returned: false, // No email match
        },
        MultiTypeRow {
            entity_kind: MultiTypeEntityKind::User,
            email_match: false,
            secret_code_match: false,
            expected_returned: false, // No match
        },
        MultiTypeRow {
            entity_kind: MultiTypeEntityKind::SecretEntity,
            email_match: true,
            secret_code_match: true,
            expected_returned: false, // SecretEntity excluded via secret_code
        },
        MultiTypeRow {
            entity_kind: MultiTypeEntityKind::SecretEntity,
            email_match: true,
            secret_code_match: false,
            expected_returned: false, // No secret match
        },
        MultiTypeRow {
            entity_kind: MultiTypeEntityKind::SecretEntity,
            email_match: false,
            secret_code_match: true,
            expected_returned: false, // No email match
        },
        MultiTypeRow {
            entity_kind: MultiTypeEntityKind::SecretEntity,
            email_match: false,
            secret_code_match: false,
            expected_returned: false, // No match
        },
    ];

    let filter = Filter::All(vec![
        email_filter(TARGET_EMAIL),
        secret_code_filter(TARGET_SECRET),
    ]);

    verify_multi_type_truth_table(
        &mut api,
        &rows,
        filter,
        "Multi-type: email = X AND secret_code = S (both types excluded)",
    )
    .await;
}

// -----------------------------------------------------------------------------
// Multi-Type Case 4: email = X OR secret_code = S
// -----------------------------------------------------------------------------

#[tokio::test]
async fn multi_type_email_or_secret_filter() {
    let settings = PostgresStoreSettings {
        filter_protection: multi_type_config(),
        ..PostgresStoreSettings::default()
    };
    let mut database = DatabaseTestWrapper::new_with_settings(settings).await;
    let mut api = seed_multi_type(&mut database).await;

    // email protected for User, secret_code protected for SecretEntity
    // Filter: email = X OR secret_code = S
    // User: can match via secret_code branch (not protected for them)
    // SecretEntity: can match via email branch (not protected for them)
    let rows = [
        // User: email branch blocked, secret_code branch allowed
        MultiTypeRow {
            entity_kind: MultiTypeEntityKind::User,
            email_match: true,
            secret_code_match: true,
            expected_returned: true, // Via secret_code (User not protected)
        },
        MultiTypeRow {
            entity_kind: MultiTypeEntityKind::User,
            email_match: true,
            secret_code_match: false,
            expected_returned: false, // Email branch blocked, no secret
        },
        MultiTypeRow {
            entity_kind: MultiTypeEntityKind::User,
            email_match: false,
            secret_code_match: true,
            expected_returned: true, // Via secret_code
        },
        MultiTypeRow {
            entity_kind: MultiTypeEntityKind::User,
            email_match: false,
            secret_code_match: false,
            expected_returned: false, // No match
        },
        // SecretEntity: secret_code branch blocked, email branch allowed
        MultiTypeRow {
            entity_kind: MultiTypeEntityKind::SecretEntity,
            email_match: true,
            secret_code_match: true,
            expected_returned: true, // Via email (SecretEntity not protected)
        },
        MultiTypeRow {
            entity_kind: MultiTypeEntityKind::SecretEntity,
            email_match: true,
            secret_code_match: false,
            expected_returned: true, // Via email
        },
        MultiTypeRow {
            entity_kind: MultiTypeEntityKind::SecretEntity,
            email_match: false,
            secret_code_match: true,
            expected_returned: false, // Secret branch blocked, no email
        },
        MultiTypeRow {
            entity_kind: MultiTypeEntityKind::SecretEntity,
            email_match: false,
            secret_code_match: false,
            expected_returned: false, // No match
        },
    ];

    let filter = Filter::Any(vec![
        email_filter(TARGET_EMAIL),
        secret_code_filter(TARGET_SECRET),
    ]);

    verify_multi_type_truth_table(
        &mut api,
        &rows,
        filter,
        "Multi-type: email = X OR secret_code = S",
    )
    .await;
}
