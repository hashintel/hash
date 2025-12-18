mod cfg_simplify;
mod dbe;
mod dse;
pub mod error;
mod sroa;
mod ssa_repair;
#[cfg(test)]
mod tests;

pub use self::{
    cfg_simplify::CfgSimplify, dbe::DeadBlockElimination, dse::DeadStoreElimination, sroa::Sroa,
    ssa_repair::SsaRepair,
};
