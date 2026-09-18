use aide::{
    axum::ApiRouter,
    openapi::{Info, MediaType, OpenApi, ReferenceOr, Response, SchemaObject, StatusCode},
    transform::TransformOpenApi,
    util::iter_operations_mut,
};
use convert_case::{Case, Casing as _};
use hash_middleware::rate_limit::PrincipalRateLimitConfig;
use indexmap::IndexMap;
use problematic::ProblemDetails;
use schemars::generate::SchemaSettings;

use super::{Api, Audience};

/// Builds the routes and their OpenAPI document.
///
/// The route factory keeps schema generation and document finalization in one call, because Aide
/// stores pending schemas in a thread-local context.
///
/// # Panics
///
/// Panics if `prefix` is not a valid nesting path.
pub(super) fn build(
    prefix: &'static str,
    audience: Audience,
    info: Info,
    create_routes: impl FnOnce() -> ApiRouter,
    transform: impl FnOnce(TransformOpenApi<'_>) -> TransformOpenApi<'_>,
    rate_limits: PrincipalRateLimitConfig,
) -> Api {
    let mut document = OpenApi {
        info,
        ..OpenApi::default()
    };
    let router = ApiRouter::new()
        .nest(prefix, create_routes())
        .finish_api_with(&mut document, |document| {
            let mut document = transform(document);
            add_response(
                document.inner_mut(),
                500,
                "InternalServerError",
                problem_response(
                    500,
                    "An internal error prevented the request from completing.",
                ),
            );
            document
        });
    Api {
        audience,
        rate_limits,
        prefix,
        router,
        document,
    }
}

pub(super) fn problem_response(status: u16, description: &str) -> Response {
    // Aide's shared generator uses the deserialization contract. Responses need the
    // serialization contract; inline subschemas keep this generator's references local.
    let mut generator = SchemaSettings::draft07()
        .for_serialize()
        .with(|settings| settings.inline_subschemas = true)
        .into_generator();
    let mut schema = generator.subschema_for::<ProblemDetails<'static>>();
    let status_schema = schema
        .pointer_mut("/properties/status")
        .and_then(serde_json::Value::as_object_mut)
        .expect("the problem schema should contain an object schema for status");
    status_schema
        .retain(|key, _| !matches!(key.as_str(), "examples" | "format" | "minimum" | "maximum"));
    status_schema.insert("const".to_owned(), status.into());
    status_schema.insert("examples".to_owned(), [status].into());

    if let Ok(status_code) = http::StatusCode::from_u16(status)
        && let Some(reason) = status_code.canonical_reason()
    {
        schema
            .pointer_mut("/properties/title")
            .and_then(serde_json::Value::as_object_mut)
            .expect("the problem schema should contain an object schema for title")
            .insert("examples".to_owned(), [reason].into());

        let slug = reason.replace('\'', "").to_case(Case::Kebab);
        let type_uri = format!("https://example.com/problems/{slug}");
        schema
            .pointer_mut("/properties/type")
            .and_then(serde_json::Value::as_object_mut)
            .expect("the problem schema should contain an object schema for type")
            .insert("examples".to_owned(), [type_uri].into());
    }

    Response {
        description: description.to_owned(),
        content: IndexMap::from_iter([(
            "application/problem+json".to_owned(),
            MediaType {
                schema: Some(SchemaObject {
                    json_schema: schema,
                    example: None,
                    external_docs: None,
                }),
                ..MediaType::default()
            },
        )]),
        ..Response::default()
    }
}

pub(super) fn add_response(api: &mut OpenApi, status: u16, name: &str, response: Response) {
    api.components
        .get_or_insert_with(Default::default)
        .responses
        .insert(name.to_owned(), ReferenceOr::Item(response));

    let Some(paths) = &mut api.paths else {
        return;
    };
    for path in paths.paths.values_mut() {
        let Some(path) = path.as_item_mut() else {
            continue;
        };
        for (_, operation) in iter_operations_mut(path) {
            operation
                .responses
                .get_or_insert_with(Default::default)
                .responses
                .entry(StatusCode::Code(status))
                .or_insert_with(|| ReferenceOr::ref_(&format!("#/components/responses/{name}")));
        }
    }
}
