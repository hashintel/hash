use axum::Router;

use crate::store::StorePool;

/// With REST, we define resources that can be acted on. These resources are defined through
/// routes and HTTP methods.
///
/// This trait encapsulates a way to define related resource operations
/// through a `Router`, making it explicitly clear we want to provide `OpenApi` specification as
/// documentation for the routes.
pub(super) trait RoutedResource: utoipa::OpenApi {
    fn routes<P: StorePool + Send + 'static>() -> Router;
    fn documentation() -> utoipa::openapi::OpenApi {
        Self::openapi()
    }
}
