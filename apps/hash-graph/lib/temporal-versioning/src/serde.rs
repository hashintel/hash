use ::time::format_description::well_known::{iso8601, Iso8601};

const CONFIG: iso8601::EncodedConfig = iso8601::Config::DEFAULT
    .set_year_is_six_digits(false)
    .encode();
const FORMAT: Iso8601<CONFIG> = Iso8601::<CONFIG>;
::time::serde::format_description!(time_format, OffsetDateTime, FORMAT);

// The macro above creates a private macro so we re-export it here publicly.
pub mod time {
    pub use super::time_format::*;

    pub mod option {
        pub use super::super::time_format::option::*;
    }
}
