mod v1;

use crate::rest::Api;

pub(super) fn api<T: Clone + Send + Sync + 'static>() -> [Api<T>; 1] {
    [v1::api()]
}
