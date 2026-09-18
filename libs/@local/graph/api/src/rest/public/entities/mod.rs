mod v1;

use hash_middleware::rate_limit::PrincipalRateLimitConfig;

use crate::rest::Api;

pub(super) fn api(rate_limits: PrincipalRateLimitConfig) -> [Api; 1] {
    [v1::api(rate_limits)]
}
