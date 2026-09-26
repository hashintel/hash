#[cfg(test)]
mod tests;

use alloc::collections::BTreeSet;
use std::collections::HashSet;

use aide::{
    Error,
    axum::ApiRouter,
    generate,
    openapi::{
        Info, OpenApi, Operation, Parameter, ParameterData, ParameterSchemaOrContent, ReferenceOr,
        Response, SchemaObject, StatusCode,
    },
    transform::TransformOpenApi,
    util::iter_operations_mut,
};
use convert_case::{Case, Casing as _};
use indexmap::IndexMap;
use serde_json::Value;

use super::{Api, credentials::Credentials, extract::RequestPart, middleware};

/// Builds an API from its routes and generates the document describing them.
///
/// Aide resets its error handler together with its schema context when the document is finished,
/// so `build_routes` runs inside this call, after the handler is registered.
///
/// # Panics
///
/// Panics if `prefix` is not a valid nesting path, if Aide reports a documentation defect such as
/// two handlers documenting the same operation, if an operation requires a security scheme the
/// document does not declare, if the path parameters of an operation are not the placeholders of
/// its path or one of them is optional, a sequence or a map, if a query parameter is a map or a
/// sequence of anything but single values, if an operation reads a path parameter, a query
/// parameter or its body through anything but the extractors of [`rest::extract`] or documents a
/// header or cookie parameter, or if the problem variants of an operation cannot be documented,
/// such as when the status of a variant already has a response that documents none.
///
/// [`rest::extract`]: crate::rest::extract
pub(super) fn build<C: Credentials>(
    prefix: &'static str,
    info: Info,
    build_routes: impl FnOnce() -> ApiRouter,
    transform: impl FnOnce(TransformOpenApi<'_>) -> TransformOpenApi<'_>,
) -> Api {
    #[expect(
        clippy::wildcard_enum_match_arm,
        reason = "Every documentation error apart from the inferred-response conflicts is a \
                  defect in the routes."
    )]
    generate::on_error(|error| match error {
        Error::InferredResponseConflict(_) | Error::InferredDefaultResponseConflict => {
            tracing::warn!(%error, "an inferred response yielded to the one the handler documents");
        }
        error => panic!("the OpenAPI document should generate without errors: {error}"),
    });
    let mut document = OpenApi {
        info,
        ..OpenApi::default()
    };
    let router = ApiRouter::new()
        .nest(prefix, build_routes())
        .finish_api_with(&mut document, |mut document| {
            for (name, scheme) in C::schemes() {
                document = document.security_scheme(name, scheme);
            }
            document
                .with(transform)
                .with(middleware::document)
                .with(reference_responses)
        });
    assert_security_schemes_declared(&mut document);
    assert_parameters_readable(&mut document);
    assert_read_through_extractors(&mut document);
    Api {
        audience: C::AUDIENCE,
        prefix,
        router,
        document,
    }
}

/// Checks that every security scheme an operation requires is declared in the document.
fn assert_security_schemes_declared(document: &mut OpenApi) {
    let declared = document
        .components
        .as_ref()
        .map_or_else(HashSet::new, |components| {
            components
                .security_schemes
                .keys()
                .cloned()
                .collect::<HashSet<_>>()
        });
    let Some(paths) = &mut document.paths else {
        return;
    };
    for (path, item) in &mut paths.paths {
        let Some(item) = item.as_item_mut() else {
            continue;
        };
        for (method, operation) in iter_operations_mut(item) {
            for scheme in operation
                .security
                .iter()
                .flat_map(|requirement| requirement.keys())
            {
                assert!(
                    declared.contains(scheme),
                    "{method} {path} should only require declared security schemes, `{scheme}` is \
                     not declared"
                );
            }
        }
    }
}

/// Checks that axum can read every path and query parameter an operation documents.
///
/// Aide documents these parameters from the fields of the struct a handler reads them into. Axum
/// fills each field of a path struct from the placeholder of the same name, as a single value. A
/// tuple or a single value documents no parameter. A field without a placeholder is a client error
/// to axum on every request, and a sequence or a map a server error. The path always carries every
/// placeholder, so an optional field documents a parameter a client cannot leave out. A query
/// struct reads single values and, from repeated keys, sequences of them, but no map.
fn assert_parameters_readable(document: &mut OpenApi) {
    let schemas = document
        .components
        .as_ref()
        .map(|components| &components.schemas);
    let Some(paths) = &mut document.paths else {
        return;
    };
    for (path, item) in &mut paths.paths {
        let Some(item) = item.as_item_mut() else {
            continue;
        };
        let placeholders = path
            .split('{')
            .skip(1)
            .filter_map(|rest| rest.split_once('}'))
            .map(|(name, _)| name)
            .collect::<BTreeSet<_>>();
        let shared = item
            .parameters
            .iter()
            .filter_map(ReferenceOr::as_item)
            .cloned()
            .collect::<Vec<_>>();
        for (method, operation) in iter_operations_mut(item) {
            let parameters = shared
                .iter()
                .chain(operation.parameters.iter().filter_map(ReferenceOr::as_item))
                .collect::<Vec<_>>();
            let documented = parameters
                .iter()
                .filter_map(|parameter| match parameter {
                    Parameter::Path { parameter_data, .. } => Some(parameter_data.name.as_str()),
                    Parameter::Query { .. }
                    | Parameter::Header { .. }
                    | Parameter::Cookie { .. } => None,
                })
                .collect::<BTreeSet<_>>();
            assert!(
                documented == placeholders,
                "{method} {path} should document one path parameter per placeholder, read into a \
                 struct with a field named after each: the path has {placeholders:?}, the \
                 operation documents {documented:?}"
            );
            for parameter in parameters {
                match parameter {
                    Parameter::Path { parameter_data, .. } => {
                        let name = &parameter_data.name;
                        assert!(
                            parameter_data.required,
                            "{method} {path} should require its path parameter `{name}`, as the \
                             path always carries it: read it into a field that is not an `Option`"
                        );
                        assert!(
                            parameter_schema(parameter_data)
                                .is_none_or(|schema| is_single_value(schema, schemas)),
                            "{method} {path} should read its path parameter `{name}` as a single \
                             value, as axum reads no sequence or map from a path segment"
                        );
                    }
                    Parameter::Query { parameter_data, .. } => {
                        let name = &parameter_data.name;
                        assert!(
                            parameter_schema(parameter_data)
                                .is_none_or(|schema| is_value_or_sequence(schema, schemas)),
                            "{method} {path} should read its query parameter `{name}` as a single \
                             value or a sequence of single values, as axum reads no map from a \
                             query string"
                        );
                    }
                    Parameter::Header { .. } | Parameter::Cookie { .. } => {}
                }
            }
        }
    }
}

/// Checks that the extractors of [`rest::extract`] read every parameter and request body an
/// operation documents, and removes the marks they leave on it.
///
/// Axum's own extractors answer a rejection with plain text, and no extractor reads a header or a
/// cookie with problem details yet.
///
/// [`rest::extract`]: crate::rest::extract
fn assert_read_through_extractors(document: &mut OpenApi) {
    let Some(paths) = &mut document.paths else {
        return;
    };
    for (path, item) in &mut paths.paths {
        let Some(item) = item.as_item_mut() else {
            continue;
        };
        let shared = item
            .parameters
            .iter()
            .filter_map(ReferenceOr::as_item)
            .cloned()
            .collect::<Vec<_>>();
        for (method, operation) in iter_operations_mut(item) {
            let mut marked = |part: RequestPart| {
                operation
                    .extensions
                    .shift_remove(part.extension())
                    .is_some()
            };
            let path_read = marked(RequestPart::Path);
            let query_read = marked(RequestPart::Query);
            let body_read = marked(RequestPart::Body);
            for parameter in shared
                .iter()
                .chain(operation.parameters.iter().filter_map(ReferenceOr::as_item))
            {
                match parameter {
                    Parameter::Path { parameter_data, .. } => assert!(
                        path_read,
                        "{method} {path} should read its path parameter `{}` through \
                         `rest::extract::Path`, whose rejections are problem details",
                        parameter_data.name
                    ),
                    Parameter::Query { parameter_data, .. } => assert!(
                        query_read,
                        "{method} {path} should read its query parameter `{}` through \
                         `rest::extract::Query`, whose rejections are problem details",
                        parameter_data.name
                    ),
                    Parameter::Header { parameter_data, .. } => panic!(
                        "{method} {path} should read no header parameter such as `{}`, as no \
                         extractor answers a malformed header with problem details",
                        parameter_data.name
                    ),
                    Parameter::Cookie { parameter_data, .. } => panic!(
                        "{method} {path} should read no cookie parameter such as `{}`, as no \
                         extractor answers a malformed cookie with problem details",
                        parameter_data.name
                    ),
                }
            }
            assert!(
                operation.request_body.is_none() || body_read,
                "{method} {path} should read its request body through `rest::extract::Json`, \
                 whose rejections are problem details"
            );
        }
    }
}

/// The schema of `parameter`, unless it describes its value by media type instead.
fn parameter_schema(parameter: &ParameterData) -> Option<&Value> {
    if let ParameterSchemaOrContent::Schema(schema) = &parameter.format {
        Some(schema.json_schema.as_value())
    } else {
        None
    }
}

/// `schema`, or the one of `schemas` it references.
fn resolved<'schema>(
    schema: &'schema Value,
    schemas: Option<&'schema IndexMap<String, SchemaObject>>,
) -> &'schema Value {
    schema
        .get("$ref")
        .and_then(Value::as_str)
        .and_then(|reference| reference.strip_prefix("#/components/schemas/"))
        .and_then(|name| schemas?.get(name))
        .map_or(schema, |component| component.json_schema.as_value())
}

/// Whether `schema`, and every branch of its `anyOf` or `oneOf`, is the schema of a single value.
///
/// The branches of an enum with fields are objects, so each branch counts.
fn is_single_value(schema: &Value, schemas: Option<&IndexMap<String, SchemaObject>>) -> bool {
    let schema = resolved(schema, schemas);
    !matches!(
        schema.get("type").and_then(Value::as_str),
        Some("array" | "object")
    ) && branches(schema).all(|branch| is_single_value(branch, schemas))
}

/// Whether `schema` is the schema of a single value or of a sequence of single values.
fn is_value_or_sequence(schema: &Value, schemas: Option<&IndexMap<String, SchemaObject>>) -> bool {
    let schema = resolved(schema, schemas);
    if schema.get("type").and_then(Value::as_str) == Some("array") {
        schema
            .get("items")
            .is_none_or(|items| is_single_value(items, schemas))
    } else {
        is_single_value(schema, schemas)
    }
}

/// The branches of the `anyOf` and `oneOf` of `schema`.
fn branches(schema: &Value) -> impl Iterator<Item = &Value> {
    ["anyOf", "oneOf"]
        .into_iter()
        .filter_map(|keyword| schema.get(keyword)?.as_array())
        .flatten()
}

/// Hoists the problem responses that operations share into `components/responses`.
///
/// Aide extracts schemas but leaves responses inline. For each status, the response most
/// operations document becomes the component, named after the status' canonical reason. Every
/// operation documenting that exact response references it; an operation documenting a different
/// response for the status keeps its own inline.
fn reference_responses(mut transform: TransformOpenApi<'_>) -> TransformOpenApi<'_> {
    let document = transform.inner_mut();
    let Some(paths) = &mut document.paths else {
        return transform;
    };
    let components = document.components.get_or_insert_with(Default::default);

    let mut candidates: Vec<(u16, Response, usize)> = Vec::new();
    for path in paths
        .paths
        .values_mut()
        .filter_map(ReferenceOr::as_item_mut)
    {
        for (_, operation) in iter_operations_mut(path) {
            for (status, response) in problem_responses(operation) {
                match candidates
                    .iter_mut()
                    .find(|(candidate_status, candidate, _)| {
                        *candidate_status == status && candidate == response
                    }) {
                    Some((_, _, occurrences)) => *occurrences += 1,
                    None => candidates.push((status, response.clone(), 1)),
                }
            }
        }
    }
    let mut shared: IndexMap<u16, (Response, usize)> = IndexMap::new();
    for (status, response, occurrences) in candidates {
        if shared
            .get(&status)
            .is_none_or(|(_, existing)| occurrences > *existing)
        {
            shared.insert(status, (response, occurrences));
        }
    }

    let mut references: IndexMap<u16, (String, Response)> = IndexMap::new();
    for (status, (response, _)) in shared {
        let Some(name) = component_name(status) else {
            continue;
        };
        components
            .responses
            .insert(name.clone(), ReferenceOr::Item(response.clone()));
        references.insert(status, (format!("#/components/responses/{name}"), response));
    }

    for path in paths
        .paths
        .values_mut()
        .filter_map(ReferenceOr::as_item_mut)
    {
        for (_, operation) in iter_operations_mut(path) {
            let Some(responses) = &mut operation.responses else {
                continue;
            };
            for (status, reference) in &mut responses.responses {
                let &StatusCode::Code(status) = status else {
                    continue;
                };
                let Some((component_reference, component)) = references.get(&status) else {
                    continue;
                };
                if reference.as_item() == Some(component) {
                    *reference = ReferenceOr::ref_(component_reference);
                }
            }
        }
    }
    transform
}

fn problem_responses(operation: &Operation) -> impl Iterator<Item = (u16, &Response)> {
    operation
        .responses
        .iter()
        .flat_map(|responses| &responses.responses)
        .filter_map(|(status, response)| {
            let &StatusCode::Code(status) = status else {
                return None;
            };
            let response = response.as_item()?;
            response
                .content
                .contains_key("application/problem+json")
                .then_some((status, response))
        })
}

fn component_name(status: u16) -> Option<String> {
    let reason = http::StatusCode::from_u16(status)
        .ok()?
        .canonical_reason()?;
    Some(
        reason
            .to_case(Case::Pascal)
            .chars()
            .filter(char::is_ascii_alphanumeric)
            .collect(),
    )
}
