use super::{EdgesLimits, LocateLimits, TileLimits, TranslateLimits};

/// Route limits shared by request assembly and bootstrap metadata.
#[derive(Copy, Clone, serde::Serialize, schemars::JsonSchema)]
pub(crate) struct DocumentLimits {
    pub tile: TileLimits = TileLimits { .. },
    pub edges: EdgesLimits = EdgesLimits { .. },
    pub locate: LocateLimits = LocateLimits { .. },
    pub translate: TranslateLimits = TranslateLimits { .. },
}
