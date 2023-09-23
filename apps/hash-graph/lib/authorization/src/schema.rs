mod account;
mod account_group;
mod entity;
mod web;

pub use self::{
    account_group::{AccountGroupPermission, AccountGroupRelation},
    entity::{EntityPermission, EntityRelation},
    web::{OwnerId, WebPermission, WebRelation},
};
