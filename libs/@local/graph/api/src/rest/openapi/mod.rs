#[cfg(test)]
mod tests;

use std::collections::HashSet;

use aide::{
    Error,
    axum::ApiRouter,
    generate,
    openapi::{Info, OpenApi, Operation, ReferenceOr, Response, StatusCode},
    transform::TransformOpenApi,
    util::iter_operations_mut,
};
use convert_case::{Case, Casing as _};
use indexmap::IndexMap;

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
/// document does not declare, or if a middleware rejection does not document its problem schema.
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
