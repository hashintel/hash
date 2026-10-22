mod credentials;

use aide::{openapi::Info, transform::TransformOpenApi};

use self::credentials::Credentials;
use super::{Api, caller, documentation, openapi};

/// The path the internal API, its documentation and the legacy document are served under.
pub(super) const PREFIX: &str = "/_api";

pub(super) fn api<T: Clone + Send + Sync + 'static>() -> Api<T> {
    openapi::build::<Credentials, _>(
        PREFIX,
        Info {
            title: "Internal".to_owned(),
            version: "unversioned".to_owned(),
            description: Some(documentation::OVERVIEW.to_owned()),
            ..Info::default()
        },
        caller::routes::<Credentials, T>,
        document,
    )
}

const fn document(document: TransformOpenApi<'_>) -> TransformOpenApi<'_> {
    document
}
