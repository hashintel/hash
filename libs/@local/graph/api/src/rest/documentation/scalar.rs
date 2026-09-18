use std::sync::LazyLock;

use axum::{Router, body::Bytes, http::header::CONTENT_TYPE, response::Html, routing::get};
use scalar_api_reference::{get_asset, render_scalar};
use serde::Serialize;
use serde_json::{Map, Value};

use crate::rest::Api;

/// One document the Scalar reference lists.
#[derive(Serialize)]
pub(super) struct Source {
    pub title: String,
    pub slug: String,
    pub url: String,
}

impl From<&Api> for Source {
    fn from(api: &Api) -> Self {
        Self {
            title: api.document().info.title.clone(),
            slug: api.slug(),
            url: format!("{}/openapi.json", api.prefix()),
        }
    }
}

fn render(configuration: &str, sources: Value) -> Result<Bytes, serde_json::Error> {
    let mut configuration: Map<String, Value> = serde_json::from_str(configuration)?;
    configuration.insert("sources".to_owned(), sources);
    configuration.insert(
        "persistAuth".to_owned(),
        Value::Bool(cfg!(debug_assertions)),
    );
    let configuration = Value::Object(configuration)
        .to_string()
        .replace('<', "\\u003c");
    Ok(Bytes::from(render_scalar(
        &configuration,
        Some("/openapi/scalar.js"),
    )))
}

/// The Scalar bundle with the optional-authentication correction applied.
static JAVASCRIPT: LazyLock<Bytes> = LazyLock::new(|| {
    let mut javascript =
        String::from_utf8(get_asset("scalar.js").expect("the Scalar bundle should exist"))
            .expect("the Scalar bundle should be UTF-8");

    // @scalar/api-reference 1.49.2 incorrectly makes an empty security alternative mandatory when
    // another alternative combines schemes.
    for (original, corrected) in [
        (
            "!t.some((e=>Object.keys(e).length>1))&&e.length<t.length",
            "e.length<t.length",
        ),
        (
            "return e.some((e=>0===Object.keys(e).length))&&!t",
            "return e.some((e=>0===Object.keys(e).length))",
        ),
    ] {
        assert_eq!(
            javascript.matches(original).count(),
            1,
            "the Scalar optional-auth correction should match exactly once"
        );
        javascript = javascript.replacen(original, corrected, 1);
    }

    Bytes::from(javascript)
});

pub(super) fn routes(sources: &[Source]) -> Router {
    let sources = serde_json::to_value(sources).expect("the document sources should serialize");
    LazyLock::force(&JAVASCRIPT);

    let reference = {
        let html = render(include_str!("scalar.json"), sources)
            .expect("the Scalar configuration should be a JSON object");
        get(move || core::future::ready(Html(html.clone())))
    };

    Router::new().route("/", reference).route(
        "/openapi/scalar.js",
        get(|| {
            core::future::ready((
                [(CONTENT_TYPE, "application/javascript")],
                JAVASCRIPT.clone(),
            ))
        }),
    )
}
