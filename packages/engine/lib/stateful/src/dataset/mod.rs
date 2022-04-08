// TODO: DOC: Add module level docs for describing the high level concept of datasets, what they are
//   and why they exist

pub type Dataset = serde_json::Value;
pub type DatasetMap = serde_json::Map<String, Dataset>;
