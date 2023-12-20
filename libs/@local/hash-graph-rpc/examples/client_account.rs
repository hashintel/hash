mod common;

use std::net::{Ipv4Addr, SocketAddrV4};

use hash_graph_rpc::{
    specification::account::{AccountService, CreateAccount},
    Client, TransportConfig,
};

use crate::common::JsonContext;

#[tokio::main]
pub async fn main() {
    tracing_subscriber::fmt::init();

    let client = Client::<AccountService, _>::new(
        JsonContext,
        SocketAddrV4::new(Ipv4Addr::LOCALHOST, 4087),
        TransportConfig::default(),
    )
    .expect("client created");

    let now = std::time::Instant::now();
    let response = client.call(CreateAccount).await;
    println!("elapsed: {:?}", now.elapsed());
    println!("response: {:?}", response);
}
