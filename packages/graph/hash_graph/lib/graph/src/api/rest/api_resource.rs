use axum::Router;

use crate::api::rest::{
    data_type::DataTypeBackend, entity::EntityBackend, entity_type::EntityTypeBackend,
    link_type::LinkTypeBackend, property_type::PropertyTypeBackend,
};

/// Specifies the requirements to a [`Store`] for the REST API.
///
/// [`Store`]: crate::store::Store
pub trait RestApiBackend =
    DataTypeBackend + PropertyTypeBackend + LinkTypeBackend + EntityTypeBackend + EntityBackend;

/// With REST, we define resources that can be acted on. These resources are defined through
/// routes and HTTP methods.
///
/// This trait encapsulates a way to define related resource operations
/// through a `Router`, making it explicitly clear we want to provide `OpenApi` specification as
/// documentation for the routes.
pub(super) trait RoutedResource: utoipa::OpenApi {
    fn routes<S: RestApiBackend>() -> Router;
    fn documentation() -> utoipa::openapi::OpenApi {
        Self::openapi()
    }
}
