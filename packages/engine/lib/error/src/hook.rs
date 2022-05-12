#![cfg(feature = "hooks")]
#![allow(clippy::module_name_repetitions)]

use core::fmt;

use once_cell::sync::OnceCell;

use crate::{report, Report, Result, ResultExt};

type FormatterHook = Box<dyn Fn(&Report<()>, &mut fmt::Formatter<'_>) -> fmt::Result + Send + Sync>;

static DEBUG_HOOK: OnceCell<FormatterHook> = OnceCell::new();
static DISPLAY_HOOK: OnceCell<FormatterHook> = OnceCell::new();

/// Sets a hook, which is called when formatting [`Report`] with the [`Debug`] trait.
///
/// [`Debug`]: fmt::Debug
///
/// # Errors
///
/// - Returns an error, if the hook was already set
///
/// # Example
///
/// ```
/// use error::{report, set_debug_hook};
///
/// # fn main() -> Result<(), error::Report> {
/// set_debug_hook(|_, fmt| write!(fmt, "custom debug implementation"))?;
///
/// let report = report!("Bail");
/// assert_eq!(format!("{report:?}"), "custom debug implementation");
/// # Ok(()) }
/// ```
#[cfg(feature = "hooks")]
pub fn set_debug_hook<H>(hook: H) -> Result<()>
where
    H: Fn(&Report<()>, &mut fmt::Formatter) -> fmt::Result + Send + Sync + 'static,
{
    DEBUG_HOOK
        .set(Box::new(hook))
        .map_err(|_| report!("Hook is already set"))
        .wrap_err("Could not set debug hook")
}

/// Returns the hook, which was previously set by [`set_debug_hook`], if any.
#[cfg(feature = "hooks")]
pub fn debug_hook() -> Option<
    &'static (impl Fn(&Report<()>, &mut fmt::Formatter) -> fmt::Result + Send + Sync + 'static),
> {
    DEBUG_HOOK.get()
}

/// Sets a hook, which is called when formatting [`Report`] with the [`Display`] trait.
///
/// [`Display`]: fmt::Display
///
/// # Errors
///
/// - Returns an error, if the hook was already set
///
/// # Example
///
/// ```
/// use error::{report, set_display_hook};
///
/// # fn main() -> Result<(), error::Report> {
/// set_display_hook(|_, fmt| write!(fmt, "custom display implementation"))?;
///
/// let report = report!("Bail");
/// assert_eq!(report.to_string(), "custom display implementation");
/// # Ok(()) }
/// ```
#[cfg(feature = "hooks")]
pub fn set_display_hook<H>(hook: H) -> Result<()>
where
    H: Fn(&Report<()>, &mut fmt::Formatter) -> fmt::Result + Send + Sync + 'static,
{
    DISPLAY_HOOK
        .set(Box::new(hook))
        .map_err(|_| report!("Hook is already set"))
        .wrap_err("Could not set debug hook")
}

/// Returns the hook, which was previously set by [`display_hook`], if any.
#[cfg(feature = "hooks")]
pub fn display_hook() -> Option<
    &'static (impl Fn(&Report<()>, &mut fmt::Formatter) -> fmt::Result + Send + Sync + 'static),
> {
    DISPLAY_HOOK.get()
}
