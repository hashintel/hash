#![cfg_attr(doc, doc = include_str!("../README.md"))]
//! ## Workspace dependencies
#![doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd")]
#![feature(mut_restriction)]
#![cfg_attr(test, feature(variant_count))]

extern crate alloc;

mod action;
mod actor;
mod context;
mod event;
mod target;

#[cfg(test)]
mod tests;

pub use self::{
    action::{AuditAction, AuditActionName},
    actor::AuditActor,
    context::{AuditContext, TraceId},
    event::{AuditEvent, AuditEventId, Outcome},
    target::{Target, TargetId, TargetKind},
};
