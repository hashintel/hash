use alloc::vec::Vec;

use axum_core::{
    body::Body,
    response::{IntoResponse, Response},
};

use crate::Rejection;

impl<K> IntoResponse for Rejection<K> {
    fn into_response(self) -> Response {
        http::Response::<Vec<u8>>::from(self).map(Body::from)
    }
}
