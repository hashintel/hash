//! Prepare, the second stage: runs a definition's SQL on the rows a run captured.

#[cfg_attr(
    not(test),
    expect(dead_code, reason = "Prepare's entry is the first caller")
)]
mod pipeline;
#[cfg_attr(
    not(test),
    expect(dead_code, reason = "Prepare's entry is the first caller")
)]
mod workspace;
