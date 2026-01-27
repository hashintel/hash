mod administrative_reduction;
mod canonicalization;
mod cfg_simplify;
mod copy_propagation;
mod dbe;
mod dle;
mod dse;
pub mod error;
mod forward_substitution;
mod inline;
mod inst_simplify;
mod post_inline;
mod pre_inline;
mod ssa_repair;
mod traversal_extraction;

pub use self::{
    administrative_reduction::AdministrativeReduction,
    canonicalization::{Canonicalization, CanonicalizationConfig},
    cfg_simplify::CfgSimplify,
    copy_propagation::CopyPropagation,
    dbe::DeadBlockElimination,
    dle::DeadLocalElimination,
    dse::DeadStoreElimination,
    forward_substitution::ForwardSubstitution,
    inline::{Inline, InlineConfig, InlineCostEstimationConfig, InlineHeuristicsConfig},
    inst_simplify::InstSimplify,
    post_inline::{PostInline, PostInlineResidual},
    pre_inline::PreInline,
    ssa_repair::SsaRepair,
    traversal_extraction::{TraversalExtraction, Traversals},
};
