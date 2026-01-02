mod administrative_reduction;
mod cfg_simplify;
mod copy_propagation;
mod dbe;
mod dle;
mod dse;
pub mod error;
mod forward_substitution;
mod inline;
mod inst_simplify;
mod pre_inlining;
mod ssa_repair;

pub use self::{
    administrative_reduction::AdministrativeReduction,
    cfg_simplify::CfgSimplify,
    copy_propagation::CopyPropagation,
    dbe::DeadBlockElimination,
    dle::DeadLocalElimination,
    dse::DeadStoreElimination,
    forward_substitution::ForwardSubstitution,
    inline::{Inline, InlineConfig, InlineCostEstimationConfig, InlineHeuristicsConfig},
    inst_simplify::InstSimplify,
    pre_inlining::PreInlining,
    ssa_repair::SsaRepair,
};
