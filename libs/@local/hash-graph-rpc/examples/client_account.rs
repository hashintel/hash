use std::net::{Ipv4Addr, SocketAddrV4};

use bytes::Bytes;
use hash_graph_rpc::{
    client::Client,
    rpc::Encode,
    specification::account::{AccountService, CreateAccount},
};

#[derive(Debug, Copy, Clone)]
struct Context;

impl hash_graph_rpc::rpc::Stateful for Context {
    type State = ();

    fn state(&self) -> &Self::State {
        &()
    }
}

impl<T> Encode<T> for Context
where
    T: serde::Serialize,
{
    fn encode(&self, value: T) -> Bytes {
        serde_json::to_vec(&value).unwrap().into()
    }
}

impl<T> hash_graph_rpc::rpc::Decode<T> for Context
where
    T: serde::de::DeserializeOwned,
{
    fn decode(&self, bytes: Bytes) -> T {
        serde_json::from_slice(&bytes).unwrap()
    }
}

impl hash_graph_rpc::rpc::Context for Context {
    fn finish<T>(&self, response: T) -> hash_graph_rpc::rpc::Response
    where
        Self: Encode<T>,
    {
        let body = self.encode(response);
        hash_graph_rpc::rpc::Response::new(body)
    }
}

#[tokio::main]
pub async fn main() {
    tracing_subscriber::fmt::init();

    let client = Client::<AccountService, _>::new(
        Context,
        SocketAddrV4::new(Ipv4Addr::LOCALHOST, 4087),
        Default::default(),
    );

    let response = client.call(CreateAccount).await;
    println!("response: {:?}", response);
}
