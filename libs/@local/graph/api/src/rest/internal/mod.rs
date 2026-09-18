mod credentials;

use aide::{openapi::Info, transform::TransformOpenApi};

use self::credentials::Credentials;
use super::{Api, caller, documentation, openapi};

pub(super) fn api() -> Api {
    openapi::build::<Credentials>(
        "/internal",
        Info {
            title: "Internal".to_owned(),
            version: "unversioned".to_owned(),
            description: Some(documentation::OVERVIEW.to_owned()),
            ..Info::default()
        },
        caller::routes::<Credentials>,
        document,
    )
}

const fn document(document: TransformOpenApi<'_>) -> TransformOpenApi<'_> {
    document
}
