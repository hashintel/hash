#![feature(impl_trait_in_assoc_type, return_type_notation)]
#![expect(clippy::future_not_send)]

extern crate alloc;

pub mod embedded;

pub use self::{
    context::ContextProvider,
    info::{Digest, InvalidMigrationFile, MigrationInfo},
    list::{MigrationError, MigrationList},
    migration::{Migration, MigrationDefinition},
    plan::{MigrationDirection, MigrationPlanBuilder, MigrationRunner, Plan, Runner},
    state::{MigrationState, StateStore},
};

mod context;
mod info;
mod list;
mod migration;
mod plan;
mod postgres;
mod state;

#[doc(hidden)]
pub mod __export {
    pub use error_stack::Report;
}
