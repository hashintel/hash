use core::result::Result as StdResult;

use error::{Report, Result};

fn external_api() -> StdResult<String, Box<str>> {
    Ok("external api call".to_string())
}

fn wrap_result_example<T>(err: StdResult<T, Box<str>>) -> Result<T> {
    // `ResultExt` is not implemented for non-std-errors or `Option`s
    err.map_err(|e| Report::from_message(e).add_message("They saw me errorin', they hatin'"))
}

fn main() -> Result<()> {
    let api_result = external_api();
    let _api_result = wrap_result_example(api_result)?;

    Ok(())
}
