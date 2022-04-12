// TODO: DOC: Add module level docs for describing the high level concept of datasets, what they are
//   and why they exist

mod segment;
mod shared;

pub use self::{segment::Dataset, shared::SharedDataset};
