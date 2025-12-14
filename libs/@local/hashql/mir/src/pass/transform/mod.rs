mod cfg_simplify;
mod dbe;
mod dse;
pub mod error;
mod sroa;
mod ssa_repair;

pub use self::{
    cfg_simplify::CfgSimplify, dbe::DeadBlockElimination, sroa::Sroa, ssa_repair::SsaRepair,
};
