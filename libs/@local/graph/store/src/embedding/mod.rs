#![expect(
    unsafe_code,
    dead_code,
    clippy::indexing_slicing,
    clippy::float_arithmetic,
    clippy::min_ident_chars,
    clippy::many_single_char_names,
    reason = "embedding module is under active development; dead_code is expected until the \
              public API is wired up. Single-char idents (k, n, m, d, x) are standard \
              mathematical notation for clustering."
)]

pub mod clustering;
pub mod dimension;
pub(crate) mod kernel;
