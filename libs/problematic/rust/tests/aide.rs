extern crate alloc;

use alloc::borrow::Cow;

use aide::{
    OperationOutput as _, generate,
    openapi::{
        Components, Info, OpenApi, Operation, PathItem, Paths, ReferenceOr, SchemaObject,
        StatusCode as DocumentedStatus,
    },
    transform::TransformOperation,
};
use http::{HeaderMap, HeaderValue, StatusCode, header::RETRY_AFTER};
use problematic::{
    Header, Problem, ProblemDetails, ProblemType, ProblemVariant, Rejection, Variant,
};
use schemars::{JsonSchema, Schema};
use serde::Serialize;
use serde_json::{Value, json};

/// The entity named in the request does not exist.
#[derive(Serialize, JsonSchema, derive_more::Display)]
#[display("The entity `{id}` does not exist.")]
struct EntityNotFound {
    /// The ID of the missing entity.
    id: u64,
}

impl ProblemVariant for EntityNotFound {
    const TYPE: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("/problems/entity/not-found"),
        title: Cow::Borrowed("Entity not found"),
        status: StatusCode::NOT_FOUND,
    };

    fn example() -> Option<Self> {
        Some(Self { id: 42 })
    }
}

/// The web named in the request does not exist.
#[derive(Serialize, JsonSchema, derive_more::Display)]
#[display("The web does not exist.")]
struct WebNotFound;

impl ProblemVariant for WebNotFound {
    const TYPE: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("/problems/web/not-found"),
        title: Cow::Borrowed("Web not found"),
        status: StatusCode::NOT_FOUND,
    };
}

/// The entity type of the entity does not exist.
///
/// Its URL names the missing type.
#[derive(Serialize, JsonSchema, derive_more::Display)]
#[display("The entity type `{url}` does not exist.")]
struct EntityTypeNotFound {
    /// The URL of the missing entity type.
    url: String,
}

impl ProblemVariant for EntityTypeNotFound {
    const TYPE: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("/problems/entity-type/not-found"),
        title: Cow::Borrowed("Entity type not found"),
        status: StatusCode::NOT_FOUND,
    };
}

/// The store cannot take the request right now.
#[derive(Serialize, JsonSchema, derive_more::Display)]
#[display("The store is busy.")]
struct StoreBusy {
    #[serde(skip)]
    retry_after: u64,
}

impl ProblemVariant for StoreBusy {
    const HEADERS: &'static [Header] = &[Header::new::<u64>(
        "Retry-After",
        "Seconds before retrying the request.",
    )];
    const TYPE: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("/problems/store/busy"),
        title: Cow::Borrowed("Store busy"),
        status: StatusCode::SERVICE_UNAVAILABLE,
    };

    fn headers(&self, headers: &mut HeaderMap) {
        headers.insert(RETRY_AFTER, HeaderValue::from(self.retry_after));
    }

    fn example() -> Option<Self> {
        Some(Self { retry_after: 30 })
    }
}

/// The store is down for maintenance.
#[derive(Serialize, JsonSchema, derive_more::Display)]
#[display("The store is down for maintenance.")]
struct StoreMaintenance;

impl ProblemVariant for StoreMaintenance {
    const TYPE: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("/problems/store/maintenance"),
        title: Cow::Borrowed("Store maintenance"),
        status: StatusCode::SERVICE_UNAVAILABLE,
    };
}

struct CreateEntity;

impl Problem for CreateEntity {
    const VARIANTS: &'static [Variant] = &[
        Variant::of::<EntityNotFound>(),
        Variant::of::<WebNotFound>(),
        Variant::of::<StoreBusy>(),
    ];
}

struct CreateEntityType;

impl Problem for CreateEntityType {
    const VARIANTS: &'static [Variant] = &[
        Variant::of::<WebNotFound>(),
        Variant::of::<EntityTypeNotFound>(),
        Variant::of::<StoreMaintenance>(),
    ];
}

/// Documents `P` on `operation` as a handler returning `Rejection<P>` does.
fn document<P: Problem>(operation: &mut Operation) {
    generate::in_context(|context| {
        assert!(
            Rejection::<P>::inferred_responses(context, operation).is_empty(),
            "a rejection should document on the operation instead of inferring responses"
        );
    });
}

fn response(operation: &Operation, status: u16) -> Value {
    let response = operation
        .responses
        .as_ref()
        .and_then(|responses| responses.responses.get(&DocumentedStatus::Code(status)))
        .and_then(ReferenceOr::as_item)
        .expect("the status should be documented");
    serde_json::to_value(response).expect("the response should serialize")
}

/// The OpenAPI document of `operation` at `/{name}`, with the schemas it references, so a
/// documentation viewer such as Scalar can open its snapshot.
fn openapi_document(name: &str, operation: Operation) -> Vec<u8> {
    let schemas = generate::in_context(|context| context.schema.definitions().clone())
        .into_iter()
        .map(|(name, schema)| {
            let json_schema = Schema::try_from(schema).expect("a definition should be a schema");
            (
                name,
                SchemaObject {
                    json_schema,
                    external_docs: None,
                    example: None,
                },
            )
        })
        .collect();
    let document = OpenApi {
        info: Info {
            title: name.to_owned(),
            ..Info::default()
        },
        paths: Some(Paths {
            paths: [(
                format!("/{name}"),
                ReferenceOr::Item(PathItem {
                    get: Some(operation),
                    ..PathItem::default()
                }),
            )]
            .into(),
            ..Paths::default()
        }),
        components: Some(Components {
            schemas,
            ..Components::default()
        }),
        ..OpenApi::default()
    };
    serde_json::to_vec_pretty(&document).expect("the document should serialize")
}

#[test]
fn document_variant() {
    let mut operation = Operation::default();
    document::<CreateEntity>(&mut operation);
    let response = response(&operation, 503);
    let media = &response["content"]["application/problem+json"];

    assert_eq!(
        response["description"], "The store cannot take the request right now.",
        "the response should be described by the variant's doc comment"
    );
    assert_eq!(
        media["example"],
        json!({
            "type": "/problems/store/busy",
            "title": "Store busy",
            "status": 503,
            "detail": "The store is busy."
        }),
        "the example should be the variant's example occurrence"
    );
    assert_eq!(
        media["schema"]["title"], "Store busy",
        "the schema should be titled with the problem type"
    );
    assert!(
        media["schema"].get("description").is_none(),
        "the schema should leave the description to the response"
    );
    assert!(
        media["schema"]["allOf"]
            .as_array()
            .expect("the schema should combine the problem details with the variant")
            .contains(&json!({
                "properties": {
                    "type": { "const": "/problems/store/busy" },
                    "title": { "const": "Store busy" },
                    "status": { "const": 503 }
                },
                "required": ["type"]
            })),
        "the schema should fix the type URI, title and status"
    );
    assert_eq!(
        response["headers"]["Retry-After"]["required"], true,
        "a header the only variant lists should be required"
    );
    insta::assert_binary_snapshot!(".json", openapi_document("document_variant", operation));
}

#[test]
fn document_variants_merged() {
    let mut operation = Operation::default();
    document::<CreateEntity>(&mut operation);
    document::<CreateEntityType>(&mut operation);
    let not_found = response(&operation, 404);
    let media = &not_found["content"]["application/problem+json"];

    let titles = media["schema"]["oneOf"]
        .as_array()
        .expect("the schema should be one of the variants")
        .iter()
        .map(|variant| variant["title"].clone())
        .collect::<Vec<_>>();
    assert_eq!(
        titles,
        ["Entity not found", "Web not found", "Entity type not found"],
        "every variant should be documented once, in the order of its first source"
    );
    assert!(
        media["schema"]["oneOf"][0]["allOf"]
            .as_array()
            .expect("the schema should combine the problem details with the variant")
            .iter()
            .any(|part| part["properties"]["id"]["description"] == "The ID of the missing entity."),
        "the schema of a variant should document its extension members"
    );
    assert!(
        media["schema"]["oneOf"]
            .as_array()
            .expect("the schema should be one of the variants")
            .iter()
            .all(|variant| {
                variant.get("description").is_none()
                    && variant["allOf"]
                        .as_array()
                        .expect("the schema should combine the problem details with the variant")
                        .iter()
                        .all(|part| part.get("description").is_none())
            }),
        "no schema of a variant should repeat the description the response lists"
    );
    assert_eq!(
        not_found["description"],
        "- Entity not found: The entity named in the request does not exist.\n- Web not found: \
         The web named in the request does not exist.\n- Entity type not found: The entity type \
         of the entity does not exist.\n  \n  Its URL names the missing type.",
        "the description should list every variant by title, indenting its further paragraphs"
    );
    assert_eq!(
        media["examples"],
        json!({
            "/problems/entity/not-found": {
                "summary": "Entity not found",
                "value": {
                    "type": "/problems/entity/not-found",
                    "title": "Entity not found",
                    "status": 404,
                    "detail": "The entity `42` does not exist.",
                    "id": 42
                }
            },
            "/problems/web/not-found": {
                "summary": "Web not found",
                "value": {
                    "type": "/problems/web/not-found",
                    "title": "Web not found",
                    "status": 404
                }
            }
        }),
        "a variant without members should be exemplified by its bare problem type, and one with \
         members but no example not at all"
    );
    insta::assert_binary_snapshot!(
        ".json",
        openapi_document("document_variants_merged", operation)
    );
}

/// The store no longer takes requests.
#[derive(Serialize, JsonSchema, derive_more::Display)]
#[display("The store is draining.")]
struct StoreDraining;

impl ProblemVariant for StoreDraining {
    const HEADERS: &'static [Header] = &[Header::new::<u64>(
        "retry-after",
        "Seconds before retrying the request.",
    )];
    const TYPE: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("/problems/store/draining"),
        title: Cow::Borrowed("Store draining"),
        status: StatusCode::SERVICE_UNAVAILABLE,
    };

    fn headers(&self, headers: &mut HeaderMap) {
        headers.insert(RETRY_AFTER, HeaderValue::from(60));
    }
}

struct DrainStore;

impl Problem for DrainStore {
    const VARIANTS: &'static [Variant] = &[Variant::of::<StoreDraining>()];
}

#[test]
fn document_headers_shared() {
    let mut operation = Operation::default();
    document::<CreateEntity>(&mut operation);
    document::<DrainStore>(&mut operation);
    let headers = response(&operation, 503)["headers"].clone();

    assert_eq!(
        headers
            .as_object()
            .expect("the response should document its headers")
            .len(),
        1,
        "the header should be documented once, whatever the case of its name"
    );
    assert_eq!(
        headers["Retry-After"]["required"], true,
        "a header every variant lists should be required"
    );
    assert!(
        headers["Retry-After"]["schema"].get("anyOf").is_none(),
        "a header every variant gives the same schema should keep that schema"
    );
    insta::assert_binary_snapshot!(
        ".json",
        openapi_document("document_headers_shared", operation)
    );
}

/// The store is closed until a given date.
#[derive(Serialize, JsonSchema, derive_more::Display)]
#[display("The store is closed.")]
struct StoreClosed;

impl ProblemVariant for StoreClosed {
    const HEADERS: &'static [Header] = &[Header::new::<String>(
        "Retry-After",
        "The date after which to retry the request.",
    )];
    const TYPE: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("/problems/store/closed"),
        title: Cow::Borrowed("Store closed"),
        status: StatusCode::SERVICE_UNAVAILABLE,
    };

    fn headers(&self, headers: &mut HeaderMap) {
        headers.insert(
            RETRY_AFTER,
            HeaderValue::from_static("Wed, 21 Oct 2026 07:28:00 GMT"),
        );
    }
}

struct CloseStore;

impl Problem for CloseStore {
    const VARIANTS: &'static [Variant] = &[Variant::of::<StoreClosed>()];
}

#[test]
fn document_header_schemas() {
    let mut operation = Operation::default();
    document::<CreateEntity>(&mut operation);
    document::<CloseStore>(&mut operation);
    // Gives `retry-after` a schema that is documented already, after the response has been read
    // back with an `anyOf`.
    document::<DrainStore>(&mut operation);
    let retry_after = &response(&operation, 503)["headers"]["Retry-After"];

    let types = retry_after["schema"]["anyOf"]
        .as_array()
        .expect("a header the variants give different schemas should document an `anyOf` of them")
        .iter()
        .map(|schema| schema["type"].clone())
        .collect::<Vec<_>>();
    assert_eq!(
        types,
        ["integer", "string"],
        "every schema of the header should be documented once"
    );
    assert_eq!(
        retry_after["description"], "Seconds before retrying the request.",
        "the header should be described like the first variant that lists it"
    );
    insta::assert_binary_snapshot!(
        ".json",
        openapi_document("document_header_schemas", operation)
    );
}

#[test]
fn document_headers_optional_kept() {
    let mut operation = Operation::default();
    document::<CreateEntity>(&mut operation);
    document::<CreateEntityType>(&mut operation);
    document::<DrainStore>(&mut operation);
    let retry_after = &response(&operation, 503)["headers"]["Retry-After"];

    assert!(
        retry_after.is_object(),
        "a header only some variants list should stay documented"
    );
    assert_ne!(
        retry_after["required"], true,
        "a header only some variants list should stay optional"
    );
}

#[test]
fn document_headers_listed_later() {
    let mut operation = Operation::default();
    document::<CreateEntityType>(&mut operation);
    document::<CreateEntity>(&mut operation);
    let retry_after = &response(&operation, 503)["headers"]["Retry-After"];

    assert!(
        retry_after.is_object(),
        "a header only a later variant lists should be documented"
    );
    assert_ne!(
        retry_after["required"], true,
        "a header only a later variant lists should be optional"
    );
}

/// The web named in the request was deleted, and its name stays reserved until the retention
/// period ends.
///
/// Its entities are kept for the retention period.
#[derive(Serialize, JsonSchema, derive_more::Display)]
#[display("The web was deleted.")]
struct WebDeleted;

impl ProblemVariant for WebDeleted {
    const TYPE: ProblemType = WebNotFound::TYPE;

    fn example() -> Option<Self> {
        Some(Self)
    }
}

struct ArchiveWeb;

impl Problem for ArchiveWeb {
    const VARIANTS: &'static [Variant] = &[Variant::of::<WebDeleted>()];
}

#[test]
fn document_same_problem_type() {
    let mut operation = Operation::default();
    document::<CreateEntity>(&mut operation);
    document::<ArchiveWeb>(&mut operation);
    // Documents `WebNotFound` again, after the response has been read back with labels.
    document::<CreateEntityType>(&mut operation);
    let media = response(&operation, 404)["content"]["application/problem+json"].clone();

    let labels = media["schema"]["anyOf"]
        .as_array()
        .expect("variants with the same type URI and status should be documented in an `anyOf`")
        .iter()
        .map(|variant| variant["title"].clone())
        .collect::<Vec<_>>();
    assert_eq!(
        labels,
        [
            "Entity not found",
            "Web not found: The web named in the request does not exist.",
            "Web not found: The web named in the request was deleted, and its name stays reserved \
             until the retention period ends.",
            "Entity type not found",
        ],
        "every schema should be documented once, labelled by the first paragraph of its \
         description where its type URI is shared"
    );
    let example = &media["examples"]["/problems/web/not-found (2)"];
    assert_eq!(
        example["summary"],
        "Web not found: The web named in the request was deleted, and its name stays reserved \
         until the retention period ends.",
        "the example of the second variant of a type URI should be named apart"
    );
    assert_eq!(
        example["value"]["detail"], "The web was deleted.",
        "the example of the second variant of a type URI should stay its own after reading back"
    );
    insta::assert_binary_snapshot!(
        ".json",
        openapi_document("document_same_problem_type", operation)
    );
}

// Without a doc comment, the documentation describes it by its title alone.
#[derive(Serialize, JsonSchema, derive_more::Display)]
#[display("The web is locked.")]
struct WebLocked;

impl ProblemVariant for WebLocked {
    const TYPE: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("/problems/web/locked"),
        title: Cow::Borrowed("Web locked"),
        status: StatusCode::LOCKED,
    };
}

// Its description repeats its title.
#[derive(Serialize, JsonSchema, derive_more::Display)]
#[schemars(description = "Web frozen")]
#[display("The web is frozen.")]
struct WebFrozen;

impl ProblemVariant for WebFrozen {
    const TYPE: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("/problems/web/frozen"),
        title: Cow::Borrowed("Web frozen"),
        status: StatusCode::CONFLICT,
    };
}

/// The web named in the request is sealed by its owner.
#[derive(Serialize, JsonSchema, derive_more::Display)]
#[display("The web is sealed.")]
struct WebSealed;

impl ProblemVariant for WebSealed {
    const TYPE: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("/problems/web/sealed"),
        title: Cow::Borrowed("Web sealed"),
        status: StatusCode::LOCKED,
    };
}

struct LockWeb;

impl Problem for LockWeb {
    const VARIANTS: &'static [Variant] = &[
        Variant::of::<WebDeleted>(),
        Variant::of::<WebLocked>(),
        Variant::of::<WebFrozen>(),
    ];
}

struct SealWeb;

impl Problem for SealWeb {
    const VARIANTS: &'static [Variant] = &[Variant::of::<WebSealed>()];
}

#[test]
fn document_variants_repeated() {
    let mut operation = Operation::default();
    document::<LockWeb>(&mut operation);
    // Joins `WebSealed` to `WebLocked`, whose response is described by its title.
    document::<SealWeb>(&mut operation);
    // Documents every variant again, after the responses have been read back.
    document::<LockWeb>(&mut operation);

    for (status, description) in [
        (
            404,
            "The web named in the request was deleted, and its name stays reserved until the \
             retention\nperiod ends.\n\nIts entities are kept for the retention period.",
        ),
        (409, "Web frozen"),
    ] {
        let response = response(&operation, status);
        assert!(
            response["content"]["application/problem+json"]["schema"]
                .get("anyOf")
                .is_none(),
            "the variant documented again at {status} should stay the only one there"
        );
        assert_eq!(
            response["description"], description,
            "the variant documented again at {status} should keep its description"
        );
    }

    let locked = response(&operation, 423);
    let titles = locked["content"]["application/problem+json"]["schema"]["oneOf"]
        .as_array()
        .expect("the schema should be one of the variants")
        .iter()
        .map(|variant| variant["title"].clone())
        .collect::<Vec<_>>();
    assert_eq!(
        titles,
        ["Web locked", "Web sealed"],
        "a variant documented again should not join the variants a second time"
    );
    assert_eq!(
        locked["description"],
        "- Web locked\n- Web sealed: The web named in the request is sealed by its owner.",
        "the description should list the variant without a description by its title alone"
    );
    insta::assert_binary_snapshot!(
        ".json",
        openapi_document("document_variants_repeated", operation)
    );
}

#[test]
fn document_explicit_response() {
    let mut operation = Operation::default();
    let _: TransformOperation<'_> =
        TransformOperation::new(&mut operation).response::<400, Rejection<ArchiveWeb>>();

    assert!(
        response(&operation, 404).is_object(),
        "an explicit response should document the variants of the rejection"
    );
    assert!(
        operation
            .responses
            .as_ref()
            .and_then(|responses| responses.responses.get(&DocumentedStatus::Code(400)))
            .is_none(),
        "the status of an explicit response should be ignored"
    );
}

#[test]
#[should_panic(
    expected = "the response at 404 should document only problem variants, so \
                `/problems/entity/not-found`, `/problems/web/not-found` can join it, but its \
                schema documents something other than problem variants"
)]
fn document_response_without_variants() {
    let mut operation = Operation::default();
    generate::in_context(|context| {
        let foreign =
            ProblemDetails::<'_, ()>::operation_response(context, &mut Operation::default())
                .expect("problem details should document a response");
        operation
            .responses
            .get_or_insert_default()
            .responses
            .insert(DocumentedStatus::Code(404), ReferenceOr::Item(foreign));
    });
    document::<CreateEntity>(&mut operation);
}

#[test]
#[should_panic(expected = "but it is a reference to a component")]
fn document_response_reference() {
    let mut operation = Operation::default();
    operation
        .responses
        .get_or_insert_default()
        .responses
        .insert(
            DocumentedStatus::Code(404),
            ReferenceOr::ref_("#/components/responses/NotFound"),
        );
    document::<CreateEntity>(&mut operation);
}

#[test]
#[should_panic(
    expected = "but it holds more than problem variants, or another transform changed it"
)]
fn document_response_changed() {
    let mut operation = Operation::default();
    document::<CreateEntity>(&mut operation);
    operation
        .responses
        .as_mut()
        .and_then(|responses| responses.responses.get_mut(&DocumentedStatus::Code(404)))
        .and_then(ReferenceOr::as_item_mut)
        .expect("the status should be documented")
        .description = String::from("The entity or its web does not exist.");
    document::<ArchiveWeb>(&mut operation);
}

/// Names a standard member.
#[derive(Serialize, JsonSchema, derive_more::Display)]
#[display("The entity is titled.")]
struct Titled {
    title: String,
}

impl ProblemVariant for Titled {
    const TYPE: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("/problems/entity/titled"),
        title: Cow::Borrowed("Entity titled"),
        status: StatusCode::BAD_REQUEST,
    };
}

struct RenameEntity;

impl Problem for RenameEntity {
    const VARIANTS: &'static [Variant] = &[Variant::of::<Titled>()];
}

#[test]
#[should_panic(
    expected = "the extension members of `/problems/entity/titled` should not name the standard \
                member `title`"
)]
fn document_standard_member() {
    document::<RenameEntity>(&mut Operation::default());
}

/// Names a standard member in one of its variants.
#[derive(Serialize, JsonSchema, derive_more::Display)]
#[serde(tag = "reason", rename_all = "snake_case")]
#[expect(
    dead_code,
    reason = "The test generates the schema without constructing an occurrence."
)]
enum Revoked {
    #[display("The token expired.")]
    Expired { at: u64 },
    #[display("The token was revoked.")]
    Withdrawn { detail: String },
}

impl ProblemVariant for Revoked {
    const TYPE: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("/problems/token/revoked"),
        title: Cow::Borrowed("Token revoked"),
        status: StatusCode::UNAUTHORIZED,
    };
}

struct RefreshToken;

impl Problem for RefreshToken {
    const VARIANTS: &'static [Variant] = &[Variant::of::<Revoked>()];
}

#[test]
#[should_panic(
    expected = "the extension members of `/problems/token/revoked` should not name the standard \
                member `detail`"
)]
fn document_standard_member_in_branch() {
    document::<RefreshToken>(&mut Operation::default());
}

/// Names a standard member in one of its untagged variants.
#[derive(Serialize, JsonSchema, derive_more::Display)]
#[serde(untagged)]
#[expect(
    dead_code,
    reason = "The test generates the schema without constructing an occurrence."
)]
enum Superseded {
    #[display("The token was replaced.")]
    Replaced { by: String },
    #[display("The token was withdrawn.")]
    Withdrawn { instance: String },
}

impl ProblemVariant for Superseded {
    const TYPE: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("/problems/token/superseded"),
        title: Cow::Borrowed("Token superseded"),
        status: StatusCode::UNAUTHORIZED,
    };
}

struct RotateToken;

impl Problem for RotateToken {
    const VARIANTS: &'static [Variant] = &[Variant::of::<Superseded>()];
}

#[test]
#[should_panic(
    expected = "the extension members of `/problems/token/superseded` should not name the \
                standard member `instance`"
)]
fn document_standard_member_in_untagged() {
    document::<RotateToken>(&mut Operation::default());
}

/// An externally tagged enum, whose variants schemars closes to other members.
#[derive(Serialize, JsonSchema, derive_more::Display)]
#[expect(
    dead_code,
    reason = "The test generates the schema without constructing an occurrence."
)]
enum TokenRejected {
    #[display("The token expired.")]
    Expired { at: u64 },
}

impl ProblemVariant for TokenRejected {
    const TYPE: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("/problems/token/rejected"),
        title: Cow::Borrowed("Token rejected"),
        status: StatusCode::UNAUTHORIZED,
    };
}

struct CheckToken;

impl Problem for CheckToken {
    const VARIANTS: &'static [Variant] = &[Variant::of::<TokenRejected>()];
}

#[test]
fn document_members_open() {
    let mut operation = Operation::default();
    document::<CheckToken>(&mut operation);
    let rejected =
        serde_json::to_string(&response(&operation, 401)).expect("the response should serialize");

    assert!(
        rejected.contains("Expired"),
        "the schema should document the members of the enum"
    );
    assert!(
        !rejected.contains("additionalProperties"),
        "the members should not close the problem details to its standard members"
    );
    insta::assert_binary_snapshot!(
        ".json",
        openapi_document("document_members_open", operation)
    );
}

/// Serializes as a number.
#[derive(Serialize, JsonSchema, derive_more::Display)]
#[display("The entity has too many links.")]
struct TooManyLinks(u32);

impl ProblemVariant for TooManyLinks {
    const TYPE: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("/problems/entity/too-many-links"),
        title: Cow::Borrowed("Too many links"),
        status: StatusCode::UNPROCESSABLE_ENTITY,
    };
}

struct LinkEntity;

impl Problem for LinkEntity {
    const VARIANTS: &'static [Variant] = &[Variant::of::<TooManyLinks>()];
}

#[test]
#[should_panic(
    expected = "the extension members of `/problems/entity/too-many-links` should serialize as an \
                object, not as `integer`"
)]
fn document_non_object_members() {
    document::<LinkEntity>(&mut Operation::default());
}

#[test]
fn problem_details_default_response() {
    #[derive(JsonSchema)]
    #[expect(
        dead_code,
        reason = "The test generates schemas without constructing extension values."
    )]
    struct Extensions {
        parameter: String,
    }

    generate::in_context(|context| {
        let responses = ProblemDetails::<'_, Extensions>::inferred_responses(
            context,
            &mut Operation::default(),
        );
        let [(status, response)] = responses.as_slice() else {
            panic!("should infer one response");
        };
        assert_eq!(*status, None, "should infer the default response");

        let schema = &response
            .content
            .get("application/problem+json")
            .expect("should advertise the problem media type")
            .schema
            .as_ref()
            .expect("should document a problem details schema")
            .json_schema;
        let schema = context.resolve_schema(schema).as_value();
        for member in ["status", "parameter"] {
            assert!(
                schema["properties"].get(member).is_some(),
                "should document {member}"
            );
        }
    });
}
