mod common;

use std::net::SocketAddrV4;

use graph_types::account::{AccountGroupId, AccountId};
use hash_graph_rpc::{
    specification::account::{
        AccountService, AddAccountGroupMember, CheckAccountGroupPermission, CreateAccount,
        CreateAccountGroup, RemoveAccountGroupMember,
    },
    ServerBuilder, ServiceBuilder, TransportConfig,
};
use uuid::Uuid;

use crate::common::JsonContext;

#[tokio::main]
pub async fn main() {
    tracing_subscriber::fmt::init();

    let service = ServiceBuilder::<AccountService, JsonContext, _>::new()
        .add_procedure(|_: CreateAccount| async move { AccountId::new(Uuid::new_v4()) })
        .add_procedure(|_: CreateAccountGroup| async move { AccountGroupId::new(Uuid::new_v4()) })
        .add_procedure(|_: CheckAccountGroupPermission| async move { true })
        .add_procedure(|_: AddAccountGroupMember| async move {})
        .add_procedure(|_: RemoveAccountGroupMember| async move {})
        .build();

    let server = ServerBuilder::new().add_service(service).build(JsonContext);

    server
        .serve(
            SocketAddrV4::new(std::net::Ipv4Addr::LOCALHOST, 4087),
            TransportConfig::default(),
        )
        .expect("transport layer created")
        .await;
}
