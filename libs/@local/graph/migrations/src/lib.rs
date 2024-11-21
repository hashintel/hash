#![feature(
    impl_trait_in_assoc_type,
    return_type_notation,
    async_closure,
    never_type
)]
#![expect(clippy::future_not_send)]

extern crate alloc;

#[cfg(feature = "macros")]
pub use ::hash_graph_migrations_macros::embed_migrations;

pub use self::{
    context::{Context, ContextProvider, Transaction},
    info::{Digest, InvalidMigrationFile, MigrationInfo},
    list::{MigrationError, MigrationList},
    migration::Migration,
    plan::{MigrationDirection, MigrationPlanBuilder, MigrationRunner, Plan, Runner},
    postgres::PostgresMigration,
    state::{MigrationState, StateStore},
};

mod context;
mod info;
mod list;
mod migration;
mod plan;
mod postgres;
mod state;

#[cfg(feature = "macros")]
#[doc(hidden)]
pub mod __export {
    pub extern crate alloc;
    // `Error-stack` is required for the return value of the `up` and `down` methods in the
    // `Migration` trait.
    pub use error_stack::Report;
    // To enforce rerunning the proc-macro on changes to the migration files, we need to
    // include the `include_dir` macro.
    pub use include_dir::{Dir, include_dir};
}
