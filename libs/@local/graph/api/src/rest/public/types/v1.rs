use aide::openapi::Info;

use crate::rest::{Api, caller, documentation, openapi, public};

pub(super) fn api<T: Clone + Send + Sync + 'static>() -> Api<T> {
    openapi::build::<public::Credentials, _>(
        "/types/v1",
        Info {
            title: "Types".to_owned(),
            version: "1".to_owned(),
            description: Some(documentation::OVERVIEW.to_owned()),
            ..Info::default()
        },
        caller::authenticated_routes::<public::Credentials, T>,
        public::document,
    )
}
