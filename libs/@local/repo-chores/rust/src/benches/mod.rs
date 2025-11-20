use std::path::PathBuf;

pub(crate) mod analyze;
pub(crate) mod fmt;
pub(crate) mod report;
pub(crate) mod storage;

#[must_use]
pub fn generate_path(
    group_id: &str,
    function_id: Option<&str>,
    value_str: Option<&str>,
) -> PathBuf {
    let mut path = PathBuf::from(make_filename_safe(group_id));
    if let Some(function_id) = function_id {
        path = path.join(make_filename_safe(function_id));
    }
    if let Some(value_str) = value_str {
        path = path.join(make_filename_safe(value_str));
    }
    path
}

fn make_filename_safe(string: &str) -> String {
    string
        .replace(['?', '"', '/', '\\', '*', '<', '>', ':', '|', '^'], "_")
        .trim()
        .to_lowercase()
}
