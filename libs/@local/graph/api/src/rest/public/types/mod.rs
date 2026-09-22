mod v1;

use crate::rest::Api;

pub(super) fn api() -> [Api; 1] {
    [v1::api()]
}
