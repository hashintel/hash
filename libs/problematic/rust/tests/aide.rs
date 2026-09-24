extern crate alloc;

use alloc::borrow::Cow;

use aide::{
    OperationOutput as _, generate,
    openapi::{
        Components, OpenApi, Operation, PathItem, Paths, ReferenceOr, Response,
        StatusCode as DocumentedStatus,
    },
    transform::TransformOpenApi,
};
use http::{HeaderMap, HeaderValue, StatusCode, header::RETRY_AFTER};
use problematic::{
    Header, Problem, ProblemDetails, ProblemType, ProblemVariant, Rejection, Variant, aide::finish,
};
use schemars::JsonSchema;
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
        Variant::INTERNAL,
    ];
}

struct CreateEntityType;

impl Problem for CreateEntityType {
    const VARIANTS: &'static [Variant] = &[
        Variant::of::<WebNotFound>(),
        Variant::of::<EntityTypeNotFound>(),
        Variant::of::<StoreMaintenance>(),
        Variant::INTERNAL,
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
    assert_eq!(
        media["schema"]["description"], "The store cannot take the request right now.",
        "the schema should be described by the variant's doc comment"
    );
    assert!(
        media["schema"]["allOf"]
            .as_array()
            .expect("the schema should combine the problem details with the variant")
            .contains(&json!({
                "properties": {
                    "type": { "const": "/problems/store/busy" },
                    "status": { "const": 503 }
                },
                "required": ["type"]
            })),
        "the schema should fix the type URI and status"
    );
    assert_eq!(
        response["headers"]["Retry-After"]["required"], true,
        "a header the only variant sends should be required"
    );
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
    assert_eq!(
        not_found["description"],
        "- Entity not found: The entity named in the request does not exist.\n- Web not found: \
         The web named in the request does not exist.\n- Entity type not found: The entity type \
         of the entity does not exist.",
        "the description should list every variant by title"
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
    let retry_after = &response(&operation, 503)["headers"]["Retry-After"];
    assert!(
        retry_after.is_object(),
        "a header some variants send should be documented"
    );
    assert_ne!(
        retry_after["required"], true,
        "a header only some variants send should not be required"
    );
}

/// Documented differently than [`WebNotFound`], under the same problem type.
#[derive(Serialize, JsonSchema, derive_more::Display)]
#[display("The web does not exist.")]
struct WebMissing;

impl ProblemVariant for WebMissing {
    const TYPE: ProblemType = WebNotFound::TYPE;
}

struct ArchiveWeb;

impl Problem for ArchiveWeb {
    const VARIANTS: &'static [Variant] = &[Variant::of::<WebMissing>()];
}

#[test]
#[should_panic(
    expected = "`/problems/web/not-found` at 404 should be documented the same by every source of \
                the operation"
)]
fn document_conflict() {
    let mut operation = Operation::default();
    document::<CreateEntity>(&mut operation);
    document::<ArchiveWeb>(&mut operation);
}

#[test]
fn document_non_problem_response() {
    let mut operation = Operation::default();
    operation
        .responses
        .get_or_insert_default()
        .responses
        .insert(
            DocumentedStatus::Code(404),
            ReferenceOr::Item(Response {
                description: String::from("The entity is archived."),
                ..Response::default()
            }),
        );
    document::<CreateEntity>(&mut operation);
    let not_found = response(&operation, 404);

    assert_eq!(
        not_found["description"], "The entity is archived.",
        "the response should stay as it was"
    );
    assert!(
        not_found["content"]
            .get("application/problem+json")
            .is_none(),
        "the variants should not be added to the response"
    );
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
fn document_internal() {
    let mut operation = Operation::default();
    document::<CreateEntity>(&mut operation);
    document::<CreateEntityType>(&mut operation);
    let internal = response(&operation, 500);

    assert_eq!(
        internal["description"], "An internal error prevented the request from completing.",
        "the internal error should be documented"
    );
    assert_eq!(
        internal["content"]["application/problem+json"]["example"],
        json!({"type": "about:blank", "title": "Internal Server Error", "status": 500}),
        "the internal error listed by both sets should be documented once"
    );
}

struct GetWeb;

impl Problem for GetWeb {
    const VARIANTS: &'static [Variant] = &[Variant::of::<WebNotFound>()];
}

#[test]
fn document_without_internal() {
    let mut operation = Operation::default();
    document::<GetWeb>(&mut operation);

    assert!(
        operation
            .responses
            .as_ref()
            .and_then(|responses| responses.responses.get(&DocumentedStatus::Code(500)))
            .is_none(),
        "a set without the internal error should document no 500"
    );
}

#[test]
fn finish_removes_merge_state() {
    let mut operation = Operation::default();
    document::<CreateEntity>(&mut operation);
    let hoisted = operation
        .responses
        .as_mut()
        .and_then(|responses| {
            responses
                .responses
                .shift_remove(&DocumentedStatus::Code(503))
        })
        .expect("the status should be documented");
    let mut api = OpenApi {
        paths: Some(Paths {
            paths: [(
                String::from("/entities"),
                ReferenceOr::Item(PathItem {
                    post: Some(operation),
                    ..PathItem::default()
                }),
            )]
            .into(),
            ..Paths::default()
        }),
        components: Some(Components {
            responses: [(String::from("StoreBusy"), hoisted)].into(),
            ..Components::default()
        }),
        ..OpenApi::default()
    };
    let _: TransformOpenApi<'_> = finish(TransformOpenApi::new(&mut api));

    assert!(
        !serde_json::to_string(&api)
            .expect("the document should serialize")
            .contains("x-problem-variants"),
        "neither operation nor component responses should keep the merge state"
    );
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
