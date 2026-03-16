use std::path::{Path, PathBuf};

/// A discovered test case, either from a `.jsonc` file or a programmatic
/// registration.
pub(crate) struct TestCase {
    /// Display name used by libtest-mimic (and nextest filtering).
    pub name: String,
    /// Source of the test.
    pub source: TestSource,
    /// Path to the expected output file (`.stdout`).
    pub expected_output: PathBuf,
}

pub(crate) enum TestSource {
    /// Full-pipeline test from a J-Expr file.
    JExpr { path: PathBuf },
    /// Programmatic test identified by index into the registry.
    Programmatic { index: usize },
}

/// Scans `base_dir/jsonc/` for `.jsonc` files and returns a `TestCase` for
/// each one. The test name is derived from the file stem.
pub(crate) fn discover_jexpr_tests(base_dir: &Path) -> Vec<TestCase> {
    let jsonc_dir = base_dir.join("jsonc");

    if !jsonc_dir.is_dir() {
        return Vec::new();
    }

    let mut tests = Vec::new();

    let mut entries: Vec<_> = std::fs::read_dir(&jsonc_dir)
        .expect("could not read jsonc test directory")
        .filter_map(|entry| {
            let entry = entry.expect("could not read directory entry");
            let path = entry.path();

            if path.extension().is_some_and(|ext| ext == "jsonc") {
                Some(path)
            } else {
                None
            }
        })
        .collect();

    entries.sort();

    for path in entries {
        let name = path
            .file_stem()
            .expect("jsonc file has no stem")
            .to_str()
            .expect("non-UTF-8 file name")
            .to_owned();

        let expected_output = path.with_extension("stdout");

        tests.push(TestCase {
            name: format!("jsonc::{name}"),
            source: TestSource::JExpr { path },
            expected_output,
        });
    }

    tests
}

/// Registers programmatic tests from a list of `(name, _)` pairs.
/// The expected output files live in `base_dir/programmatic/<name>.stdout`.
pub(crate) fn discover_programmatic_tests(
    base_dir: &Path,
    registry: &[(&str, ())],
) -> Vec<TestCase> {
    let programmatic_dir = base_dir.join("programmatic");

    registry
        .iter()
        .enumerate()
        .map(|(index, &(name, ()))| {
            let expected_output = programmatic_dir.join(format!("{name}.stdout"));

            TestCase {
                name: format!("programmatic::{name}"),
                source: TestSource::Programmatic { index },
                expected_output,
            }
        })
        .collect()
}

/// Returns the base directory for orchestrator UI tests.
pub(crate) fn test_ui_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("ui")
        .join("orchestrator")
}
