use serde_json::Value;
use stateful::{field::UUID_V4_LEN, message::MessageReader, state::MessageReference};
use thiserror::Error as ThisError;

use crate::{
    package::simulation::context::api_requests::{handlers, ApiResponseMap},
    Error, Result,
};

pub const ACTIVE_REQUESTS: usize = 10;

type Request = ([u8; UUID_V4_LEN], Value);

pub struct Requests {
    inner: Vec<Request>,
}

pub fn gather_requests(
    reader: &MessageReader<'_>,
    messages: &[MessageReference],
) -> Result<Requests> {
    let inner = (0..messages.len())
        .into_iter()
        .map(|i| {
            let message = &messages[i];
            let loader = reader.get_loader(message.batch_index)?;
            let message = loader.get_raw_message(message.agent_index, message.message_index);
            let data = serde_json::from_str::<Value>(message.data)?;
            let from = *message.from;
            Ok((from, data))
        })
        .collect::<Result<_>>()?;

    Ok(Requests { inner })
}

pub async fn run_custom_message_handler(name: &str, requests: Requests) -> Result<ApiResponseMap> {
    match name {
        "mapbox" => handlers::mapbox::get(requests).await,
        _ => Err(CustomApiMessageError::InvalidCustomMessageHandler(name.to_string()).into()),
    }
}

#[derive(ThisError, Debug)]
pub enum CustomApiMessageError {
    #[error("Mapbox error: {0}")]
    Mapbox(#[from] mapbox::MapboxError),

    #[error("Unknown custom message handler: {0}")]
    InvalidCustomMessageHandler(String),
}

impl From<CustomApiMessageError> for Error {
    fn from(error: CustomApiMessageError) -> Self {
        Self::from(error.to_string())
    }
}

trait CustomError: Into<CustomApiMessageError> {
    fn conv(self) -> Error {
        self.into().into()
    }
}

pub mod mapbox {
    use std::collections::{hash_map, HashMap};

    use futures::StreamExt;
    use stateful::field::UUID_V4_LEN;
    use thiserror::Error as ThisError;

    use crate::package::simulation::context::api_requests::{
        handlers::{CustomError, Request, Requests, ACTIVE_REQUESTS},
        ApiResponseMap, Result,
    };

    #[derive(ThisError, Debug)]
    pub enum MapboxError {
        #[error(
            "`transporation_method` expected string field for Mapbox directions request: {0:?}"
        )]
        TransporationMethod(serde_json::Value),
        #[error("`request_route` expected string field for Mapbox directions request: {0:?}")]
        RequestRoute(serde_json::Value),
    }

    impl CustomError for MapboxError {}

    async fn get_<'a>(request: Request) -> Result<([u8; UUID_V4_LEN], String)> {
        let (_from, data) = request;
        let _transportation_method = data
            .get("transportation_method")
            .and_then(|v| v.as_str())
            .ok_or_else(|| MapboxError::TransporationMethod(data.clone()).conv())?;

        let _request_route = data
            .get("request_route")
            .and_then(|v| v.as_str())
            .ok_or_else(|| MapboxError::RequestRoute(data.clone()).conv())?;

        todo!()
        // TODO: OS handle mapbox token
        // let request = surf::get(request_url).recv_string().await;
        // request
        //     .map_err(|e| Error::Surf(e.status()))
        //     .map(|s| (from, s))
    }

    pub async fn get<'a>(requests: Requests) -> Result<ApiResponseMap> {
        let responses = futures::stream::iter(requests.inner.into_iter().map(get_))
            .buffer_unordered(ACTIVE_REQUESTS)
            .collect::<Vec<_>>()
            .await
            .into_iter()
            .collect::<Result<Vec<_>>>()?;

        let mut map = HashMap::<[u8; UUID_V4_LEN], Vec<String>>::new();
        responses.into_iter().for_each(|(to, content)| {
            if let hash_map::Entry::Vacant(e) = map.entry(to) {
                e.insert(vec![content]);
            } else {
                map.get_mut(&to).unwrap().push(content)
            }
        });

        Ok(ApiResponseMap {
            from: "mapbox",
            r#type: "mapbox_response",
            map,
        })
    }
}
