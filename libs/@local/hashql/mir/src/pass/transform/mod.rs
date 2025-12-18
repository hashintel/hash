mod cfg_simplify;
mod dbe;
mod dle;
mod dse;
pub mod error;
mod inst_simplify;
mod sroa;
mod ssa_repair;

pub use self::{
    cfg_simplify::CfgSimplify, dbe::DeadBlockElimination, dle::DeadLocalElimination,
    dse::DeadStoreElimination, sroa::Sroa, ssa_repair::SsaRepair,
};
