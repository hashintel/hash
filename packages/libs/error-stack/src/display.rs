//! Implementation of display, which can be either fancy or "normal", depending
//! on the type color and non ascii character can be used.
//!
//! This is inspired by [miette](https://docs.rs/miette/latest/miette/index.html)

#[cfg(feature = "fancy")]
const RIGHT_ARROW: char = '▶';
#[cfg(not(feature = "fancy"))]
const RIGHT_ARROW: char = '>';

#[cfg(feature = "fancy")]
const RIGHT_CURVE_END: char = '╰';
#[cfg(not(feature = "fancy"))]
const RIGHT_CURVE_END: char = '\\';

#[cfg(feature = "fancy")]
const RIGHT_CURVE_JUNCTION: char = '├';
#[cfg(not(feature = "fancy"))]
const RIGHT_CURVE_JUNCTION: char = '|';

#[cfg(feature = "fancy")]
const VERTICAL_LINE: char = '│';
#[cfg(not(feature = "fancy"))]
const VERTICAL_LINE: char = '|';

#[cfg(feature = "fancy")]
const HORIZONTAL_LINE: char = '─';
#[cfg(not(feature = "fancy"))]
const HORIZONTAL_LINE: char = '-';
