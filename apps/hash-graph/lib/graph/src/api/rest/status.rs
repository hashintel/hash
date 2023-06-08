use std::fmt::Debug;

use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use hash_status::Status;
use serde::{Deserialize, Serialize};

pub fn status_to_response<T>(status: Status<T>) -> Response
where
    T: Serialize + for<'de> Deserialize<'de> + Send + Sync + Debug,
{
    let status_code = StatusCode::from_u16(status.code().to_http_code())
        .expect("HASH Status code should map to a valid HTTP status code");
    let mut response = Json(status).into_response();
    *response.status_mut() = status_code;
    response
}
