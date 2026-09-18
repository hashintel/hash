use aide::openapi::Info;

use crate::rest::{Api, caller, documentation, openapi, public};

pub(super) fn api() -> Api {
    openapi::build::<public::Credentials>(
        "/entities/v1",
        Info {
            title: "Entities".to_owned(),
            version: "1".to_owned(),
            description: Some(documentation::OVERVIEW.to_owned()),
            ..Info::default()
        },
        caller::routes::<public::Credentials>,
        public::document,
    )
}
