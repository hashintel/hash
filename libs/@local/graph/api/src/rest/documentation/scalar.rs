use axum::{Router, body::Bytes, http::header::CONTENT_TYPE, response::Html, routing::get};
use scalar_api_reference::{get_asset, render_scalar};
use serde::Serialize;
use serde_json::{Map, Value};

#[derive(Serialize)]
pub(crate) struct Source {
    pub title: String,
    pub slug: String,
    pub url: String,
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

fn javascript() -> Bytes {
    let mut javascript =
        String::from_utf8(get_asset("scalar.js").expect("the Scalar bundle should exist"))
            .expect("the Scalar bundle should be UTF-8");

    // Scalar 1.49.2 incorrectly makes an empty security alternative mandatory when another
    // alternative combines schemes.
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
            "the Scalar optional-auth correction should match exactly once; recheck it after \
             updating scalar_api_reference"
        );
        javascript = javascript.replacen(original, corrected, 1);
    }

    Bytes::from(javascript)
}

pub(super) fn routes(sources: &[Source]) -> Router {
    let sources = serde_json::to_value(sources).expect("the document sources should serialize");

    let reference = {
        let html = render(include_str!("scalar.json"), sources)
            .expect("the Scalar configuration should be a JSON object");
        get(move || core::future::ready(Html(html.clone())))
    };

    let javascript = javascript();
    Router::new().route("/", reference).route(
        "/openapi/scalar.js",
        get(move || {
            core::future::ready((
                [(CONTENT_TYPE, "application/javascript")],
                javascript.clone(),
            ))
        }),
    )
}
