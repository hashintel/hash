//! Prepare, the second stage: runs a definition's SQL on the rows a run captured.

#[cfg_attr(
    not(test),
    expect(dead_code, reason = "the SQL steps are the first caller")
)]
mod workspace;
