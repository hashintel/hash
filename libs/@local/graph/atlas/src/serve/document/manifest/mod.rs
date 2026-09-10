//! Bootstrap metadata for a captured generation and its resolved delivery schedule.
//!
//! Route limits come from request configuration. Scope metadata comes from the bound schedule that
//! supplies document rows.

use alloc::alloc::Allocator;
use core::fmt;

use error_stack::Report;
use hash_graph_temporal_versioning::{DecisionTime, Timestamp};
use serde::{Serialize, Serializer};

use super::{
    Document, DocumentLimits, VARIANTS,
    codec::{Envelope, WIRE_VERSION},
};
use crate::{
    file::generation::GenerationId,
    math::Log2,
    morton::Zoom,
    serve::{scene::Scene, visibility::cache::VisibilityLimits},
};

#[cfg(test)]
mod tests;

#[derive(schemars::JsonSchema)]
#[schemars(with = "String")]
struct BucketCut(Log2);

impl fmt::Display for BucketCut {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "z+{}", self.0.get())
    }
}

impl Serialize for BucketCut {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.collect_str(self)
    }
}

#[derive(serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
struct BucketDescription {
    span: u64,
    cut: BucketCut,
    max_zoom: Zoom,
}

#[derive(serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
struct ScopeDescription {
    #[serde(rename = "k")]
    offset: Zoom,
    cut: BucketCut,
    max_zoom: Zoom,
}

#[derive(serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
struct ManifestLimits<'limits> {
    #[serde(flatten)]
    documents: &'limits DocumentLimits,
    authority_refresh_seconds: u64,
    authority_hard_seconds: u64,
}

/// Generation metadata and the delivery cut resolved for one request.
#[derive(serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ManifestDocument<'limits> {
    generation: GenerationId,
    wire_version: u16,
    variants: [&'static str; VARIANTS.len()],
    bucket_schedule: BucketDescription,
    scope_schedule: ScopeDescription,
    limits: ManifestLimits<'limits>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schemars(with = "Option<String>")]
    created_at: Option<Timestamp<DecisionTime>>,
}

impl<'limits> ManifestDocument<'limits> {
    pub(crate) fn new(
        Scene {
            world, delivery, ..
        }: Scene<'_>,
        limits: &'limits DocumentLimits,
        VisibilityLimits { soft, hard, .. }: VisibilityLimits,
    ) -> Self {
        let buckets = world.schedule();
        let scoped = delivery.buckets();

        Self {
            generation: world.generation().id(),
            wire_version: WIRE_VERSION,
            variants: VARIANTS,
            bucket_schedule: BucketDescription {
                span: 1_u64 << buckets.span().get(),
                cut: BucketCut(buckets.span()),
                max_zoom: buckets.max_tile_depth(),
            },
            scope_schedule: ScopeDescription {
                offset: delivery.offset(),
                cut: BucketCut(scoped.span()),
                max_zoom: scoped.first_zoom(delivery.min_resolution()),
            },
            limits: ManifestLimits {
                documents: limits,
                authority_refresh_seconds: soft.as_secs(),
                authority_hard_seconds: hard.as_secs(),
            },
            created_at: world
                .generation()
                .repository()
                .metadata
                .snapshot
                .axes
                .map(|axes| axes.decision_time),
        }
    }
}

impl Document for ManifestDocument<'_> {
    type Error = Report<serde_json::Error>;

    fn encode<A: Allocator>(&self, buffer: &mut Vec<u8, A>) -> Result<Envelope, Self::Error> {
        Envelope::encode_json(self, buffer)
    }
}
