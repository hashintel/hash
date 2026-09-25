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

use super::{Api, credentials::Credentials, middleware};

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
/// its path or one of them is optional, a sequence or a map, or if the problem variants of an
/// operation cannot be documented, such as when the status of a variant already has a response that
/// documents none.
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
    assert_path_parameters_filled(&mut document);
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

/// Checks that the path parameters of every operation are the ones axum fills in.
///
/// Aide documents path parameters from the fields of the struct a handler reads them into, and axum
/// fills each field from the placeholder of the same name, as a single value. A tuple or a single
/// value documents no parameter. A field without a placeholder is a client error to axum on every
/// request, and a sequence or a map a server error. The path always carries every placeholder, so
/// an optional field documents a parameter a client cannot leave out.
fn assert_path_parameters_filled(document: &mut OpenApi) {
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
        let shared = path_parameters(&item.parameters)
            .cloned()
            .collect::<Vec<_>>();
        for (method, operation) in iter_operations_mut(item) {
            let parameters = shared
                .iter()
                .chain(path_parameters(&operation.parameters))
                .collect::<Vec<_>>();
            let documented = parameters
                .iter()
                .map(|parameter| parameter.name.as_str())
                .collect::<BTreeSet<_>>();
            assert!(
                documented == placeholders,
                "{method} {path} should document one path parameter per placeholder, read into a \
                 struct with a field named after each: the path has {placeholders:?}, the \
                 operation documents {documented:?}"
            );
            for parameter in parameters {
                let name = &parameter.name;
                assert!(
                    parameter.required,
                    "{method} {path} should require its path parameter `{name}`, as the path \
                     always carries it: read it into a field that is not an `Option`"
                );
                assert!(
                    is_single_value(parameter, schemas),
                    "{method} {path} should read its path parameter `{name}` as a single value, \
                     as axum reads no sequence or map from a path segment"
                );
            }
        }
    }
}

/// The path parameters among `parameters`.
fn path_parameters(parameters: &[ReferenceOr<Parameter>]) -> impl Iterator<Item = &ParameterData> {
    parameters.iter().filter_map(|parameter| {
        if let Some(Parameter::Path { parameter_data, .. }) = parameter.as_item() {
            Some(parameter_data)
        } else {
            None
        }
    })
}

/// Whether the schema of `parameter` is neither an array nor an object, following a reference to
/// one of `schemas`.
fn is_single_value(
    parameter: &ParameterData,
    schemas: Option<&IndexMap<String, SchemaObject>>,
) -> bool {
    let ParameterSchemaOrContent::Schema(schema) = &parameter.format else {
        return true;
    };
    let schema = schema
        .json_schema
        .get("$ref")
        .and_then(Value::as_str)
        .and_then(|reference| reference.strip_prefix("#/components/schemas/"))
        .and_then(|name| schemas?.get(name))
        .unwrap_or(schema);
    !matches!(
        schema.json_schema.get("type").and_then(Value::as_str),
        Some("array" | "object")
    )
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
