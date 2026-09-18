use aide::openapi::{
    Header, HeaderStyle, OpenApi, ParameterSchemaOrContent, ReferenceOr, SchemaObject,
};
use hash_middleware::rate_limit::PrincipalRateLimitConfig;
use indexmap::IndexMap;
use schemars::json_schema;

use crate::rest::openapi::{add_response, problem_response};

pub(crate) struct RateLimits {
    pub public: PublicRateLimits,
    pub internal: PrincipalRateLimitConfig,
}

pub(crate) struct PublicRateLimits {
    pub entities: PrincipalRateLimitConfig,
    pub types: PrincipalRateLimitConfig,
}

impl From<PrincipalRateLimitConfig> for RateLimits {
    fn from(defaults: PrincipalRateLimitConfig) -> Self {
        Self {
            public: PublicRateLimits {
                entities: defaults,
                types: defaults,
            },
            internal: defaults,
        }
    }
}

pub(super) fn responses(api: &mut OpenApi) {
    let mut response = problem_response(429, "The request exceeds its rate limit.");
    response.headers.insert(
        "Retry-After".to_owned(),
        ReferenceOr::Item(Header {
            description: Some("Whole seconds before retrying.".to_owned()),
            style: HeaderStyle::Simple,
            required: true,
            deprecated: None,
            format: ParameterSchemaOrContent::Schema(SchemaObject {
                json_schema: json_schema!({ "type": "integer", "minimum": 1 }),
                example: None,
                external_docs: None,
            }),
            example: None,
            examples: IndexMap::default(),
            extensions: IndexMap::default(),
        }),
    );
    add_response(api, 429, "RateLimited", response);
}
