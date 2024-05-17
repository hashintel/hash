use std::path::PathBuf;

pub mod analyze;
pub mod fmt;
pub mod report;
pub mod storage;

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
    let mut string = string.replace(
        &['?', '"', '/', '\\', '*', '<', '>', ':', '|', '^'][..],
        "_",
    );

    if cfg!(target_os = "windows") {
        {
            string = string
                // On Windows, spaces in the end of the filename are ignored and will be trimmed.
                //
                // Without trimming ourselves, creating a directory `dir ` will silently create
                // `dir` instead, but then operations on files like `dir /file` will fail.
                .trim_end()
                // On Windows, file names are not case-sensitive, so lowercase everything.
                .to_lowercase();
        }
    }

    string
}
