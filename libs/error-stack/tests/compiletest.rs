use std::ffi::OsStr;

#[cfg_attr(not(nightly), ignore = "Outputs are different across toolchains")]
#[cfg_attr(miri, ignore = "Miri does not support UI tests")]
#[test]
fn ui() -> Result<(), Box<dyn core::error::Error>> {
    let paths = glob::glob("tests/ui/*.rs")?.collect::<Result<Vec<_>, _>>()?;

    let test_cases = trybuild::TestCases::new();

    for path in paths {
        if cfg!(feature = "serde") && path.file_name() == Some(OsStr::new("macro_invalid_args.rs"))
        {
            // This test adds additional notes when serde is enabled
            continue;
        }

        test_cases.compile_fail(path);
    }

    Ok(())
}
