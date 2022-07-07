use axum::Router;

use crate::datastore::Datastore;

pub(super) trait RoutedResource: utoipa::OpenApi {
    fn routes<D: Datastore>() -> Router;
    fn documentation() -> utoipa::openapi::OpenApi {
        Self::openapi()
    }
}
