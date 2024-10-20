mod account;
pub mod auth;
mod session;

mod role {
    use harpc_server::session::Session;
    pub use harpc_service::role::Role;

    use super::session::User;

    pub type Server = harpc_service::role::Server<Session<User>>;
}
