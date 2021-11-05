use crate::datastore::{
    table::{pool::message::MessageReader, references::AgentMessageReference},
    UUID_V4_LEN,
};

use super::*;
use serde_json::Value;

use thiserror::Error as ThisError;

pub const ACTIVE_REQUESTS: usize = 10;

type Request = ([u8; UUID_V4_LEN], serde_json::Value);

pub struct Requests {
    inner: Vec<Request>,
}

pub fn gather_requests<'a>(
    name: &str,
    reader: &MessageReader<'a>,
    messages: &[AgentMessageReference],
) -> Result<Requests> {
    let inner = (0..messages.len())
        .into_iter()
        .map(|i| {
            let message = &messages[i];
            let loader = reader.get_loader(message.batch_index)?;
            let message = loader.get_raw_message(message.agent_index, message.message_index);
            let data = serde_json::from_str::<Value>(message.data)?;
            let from = message.from.clone();
            Ok((from, data))
        })
        .collect::<Result<_>>()?;

    Ok(Requests { inner })
}

pub async fn run_custom_message_handler(name: &str, requests: Requests) -> Result<APIResponseMap> {
    match name {
        "mapbox" => handlers::mapbox::get(requests).await,
        _ => Err(CustomAPIMessageError::InvalidCustomMessageHandler(name.to_string()).into()),
    }
}

#[derive(ThisError, Debug)]
pub enum CustomAPIMessageError {
    #[error("Mapbox error: {0}")]
    Mapbox(#[from] mapbox::MapboxError),

    #[error("Unknown custom message handler: {0}")]
    InvalidCustomMessageHandler(String),
}

trait CustomError: Into<CustomAPIMessageError> {
    fn conv(self) -> Error {
        self.into().into()
    }
}

pub mod mapbox {
    use std::collections::HashMap;

    use futures::StreamExt;

    use crate::datastore::UUID_V4_LEN;

    use super::*;

    #[derive(ThisError, Debug)]
    pub enum MapboxError {
        #[error(
            "`transporation_method` expected string field for Mapbox directions request: {0:?}"
        )]
        TransporationMethod(Value),
        #[error("`request_route` expected string field for Mapbox directions request: {0:?}")]
        RequestRoute(Value),
    }

    impl CustomError for MapboxError {}

    async fn get_<'a>(request: Request) -> Result<([u8; UUID_V4_LEN], String)> {
        let (from, data) = request;
        let transportation_method = data
            .get("transportation_method")
            .and_then(|v| v.as_str())
            .ok_or_else(|| MapboxError::TransporationMethod(data.clone()).conv())?;

        let request_route = data
            .get("request_route")
            .and_then(|v| v.as_str())
            .ok_or_else(|| MapboxError::RequestRoute(data.clone()).conv())?;

        todo!()
        // TODO OS handle mapbox token
        // let request = surf::get(request_url).recv_string().await;
        // request
        //     .map_err(|e| Error::Surf(e.status()))
        //     .map(|s| (from, s))
    }

    pub async fn get<'a>(requests: Requests) -> Result<APIResponseMap> {
        let responses =
            futures::stream::iter(requests.inner.into_iter().map(|request| get_(request)))
                .buffer_unordered(ACTIVE_REQUESTS)
                .collect::<Vec<_>>()
                .await
                .into_iter()
                .collect::<Result<Vec<_>>>()?;

        let mut map = HashMap::<[u8; UUID_V4_LEN], Vec<String>>::new();
        responses.into_iter().for_each(|(to, content)| {
            if map.contains_key(&to) {
                map.get_mut(&to).unwrap().push(content)
            } else {
                map.insert(to, vec![content]);
            }
        });

        return Ok(APIResponseMap {
            from: "mapbox",
            r#type: "mapbox_response",
            map,
        });
    }
}
