mod administrative_reduction;
mod cfg_simplify;
mod cp;
mod dbe;
mod dle;
mod dse;
pub mod error;
mod inst_simplify;
mod sroa;
mod ssa_repair;

pub use self::{
    administrative_reduction::AdministrativeReduction, cfg_simplify::CfgSimplify,
    cp::CopyPropagation, dbe::DeadBlockElimination, dle::DeadLocalElimination,
    dse::DeadStoreElimination, inst_simplify::InstSimplify, sroa::Sroa, ssa_repair::SsaRepair,
};
