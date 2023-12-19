use std::net::SocketAddrV4;

use bytes::Bytes;
use graph_types::account::{AccountGroupId, AccountId};
use hash_graph_rpc::{
    rpc::Encode,
    server::{ServerBuilder, ServiceBuilder},
    specification::account::{
        AccountService, AddAccountGroupMember, CheckAccountGroupPermission, CreateAccount,
        CreateAccountGroup, RemoveAccountGroupMember,
    },
};
use uuid::Uuid;

#[derive(Debug, Copy, Clone)]
struct Context;

impl hash_graph_rpc::rpc::Stateful for Context {
    type State = ();

    fn state(&self) -> &Self::State {
        &()
    }
}

impl<T> hash_graph_rpc::rpc::Encode<T> for Context
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

    let service = ServiceBuilder::<AccountService, Context, _>::new()
        .add_procedure(|_: CreateAccount, _| async move { AccountId::new(Uuid::new_v4()) })
        .add_procedure(
            |_: CreateAccountGroup, _| async move { AccountGroupId::new(Uuid::new_v4()) },
        )
        .add_procedure(|_: CheckAccountGroupPermission, _| async move { true })
        .add_procedure(|_: AddAccountGroupMember, _| async move { () })
        .add_procedure(|_: RemoveAccountGroupMember, _| async move { () })
        .build();

    let server = ServerBuilder::new().add_service(service).build(Context);

    server
        .serve(
            SocketAddrV4::new(std::net::Ipv4Addr::LOCALHOST, 4087),
            Default::default(),
        )
        .await;
}
