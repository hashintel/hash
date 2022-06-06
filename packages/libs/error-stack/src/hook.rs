use std::{error::Error, fmt};

use once_cell::sync::OnceCell;

use crate::{Report, Result};

type FormatterHook = Box<dyn Fn(&Report<()>, &mut fmt::Formatter<'_>) -> fmt::Result + Send + Sync>;

static DEBUG_HOOK: OnceCell<FormatterHook> = OnceCell::new();
static DISPLAY_HOOK: OnceCell<FormatterHook> = OnceCell::new();

/// A hook can only be set once.
///
/// Returned by [`Report::set_debug_hook()`] or [`Report::set_display_hook()`] if a hook was already
/// set.
#[derive(Debug, Copy, Clone)]
#[non_exhaustive]
pub struct HookAlreadySet;

impl fmt::Display for HookAlreadySet {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("Hook can only be set once")
    }
}

impl Error for HookAlreadySet {}

impl Report<()> {
    /// Globally sets a hook which is called when formatting [`Report`] with the [`Debug`] trait.
    ///
    /// By intercepting the default [`Debug`] implementation, this hook adds the possibility for
    /// downstream crates to provide their own formatting like colored output or a machine-readable
    /// output (i.e. JSON).
    ///
    /// If not set, [`Debug`] will print
    ///   * The latest error
    ///   * The errors causes
    ///   * The [`Backtrace`] and [`SpanTrace`] **if captured**
    ///
    /// [`Debug`]: fmt::Debug
    /// [`Backtrace`]: std::backtrace::Backtrace
    /// [`SpanTrace`]: tracing_error::SpanTrace
    ///
    /// # Errors
    ///
    /// - Returns an error if a debug hook was already set
    ///
    /// # Example
    ///
    /// ```
    /// use std::io::{Error, ErrorKind};
    ///
    /// use error_stack::{report, Report};
    ///
    /// # fn main() -> Result<(), Report<error_stack::HookAlreadySet>> {
    /// Report::set_debug_hook(|_, fmt| write!(fmt, "custom debug implementation"))?;
    ///
    /// let report = report!(Error::from(ErrorKind::InvalidInput));
    /// assert_eq!(format!("{report:?}"), "custom debug implementation");
    /// # Ok(()) }
    /// ```
    #[cfg(feature = "hooks")]
    pub fn set_debug_hook<H>(hook: H) -> Result<(), HookAlreadySet>
    where
        H: Fn(&Self, &mut fmt::Formatter) -> fmt::Result + Send + Sync + 'static,
    {
        DEBUG_HOOK
            .set(Box::new(hook))
            .map_err(|_| Report::new(HookAlreadySet))
    }

    /// Returns the hook that was previously set by [`set_debug_hook`], if any.
    ///
    /// [`set_debug_hook`]: Self::set_debug_hook
    #[cfg(feature = "hooks")]
    pub(crate) fn debug_hook()
    -> Option<&'static (impl Fn(&Self, &mut fmt::Formatter) -> fmt::Result + Send + Sync + 'static)>
    {
        DEBUG_HOOK.get()
    }

    /// Globally sets a hook that is called when formatting [`Report`] with the [`Display`] trait.
    ///
    /// By intercepting the default [`Display`] implementation, this hook adds the possibility
    /// for downstream crates to provide their own formatting like colored output or a
    /// machine-readable output (i.e. JSON).
    ///
    /// If not set, [`Display`] will print the latest error and, if alternate formatting is enabled
    /// (`"{:#}"`) and it exists, its direct cause.
    ///
    /// [`Display`]: fmt::Display
    ///
    /// # Errors
    ///
    /// - Returns an error if a display hook was already set
    ///
    /// # Example
    ///
    /// ```
    /// use std::io::{Error, ErrorKind};
    ///
    /// use error_stack::{report, Report};
    ///
    /// # fn main() -> Result<(), Report<error_stack::HookAlreadySet>> {
    /// Report::set_display_hook(|_, fmt| write!(fmt, "custom display implementation"))?;
    ///
    /// let report = report!(Error::from(ErrorKind::InvalidInput));
    /// assert_eq!(report.to_string(), "custom display implementation");
    ///
    /// # Ok(()) }
    /// ```
    #[cfg(feature = "hooks")]
    pub fn set_display_hook<H>(hook: H) -> Result<(), HookAlreadySet>
    where
        H: Fn(&Self, &mut fmt::Formatter) -> fmt::Result + Send + Sync + 'static,
    {
        DISPLAY_HOOK
            .set(Box::new(hook))
            .map_err(|_| Report::new(HookAlreadySet))
    }

    /// Returns the hook that was previously set by [`set_display_hook`], if any.
    ///
    /// [`set_display_hook`]: Self::set_display_hook
    #[cfg(feature = "hooks")]
    pub(crate) fn display_hook()
    -> Option<&'static (impl Fn(&Self, &mut fmt::Formatter) -> fmt::Result + Send + Sync + 'static)>
    {
        DISPLAY_HOOK.get()
    }
}

impl<T> Report<T> {
    /// Converts the `&Report<T>` to `&Report<()>` without modifying the frame stack.
    ///
    /// Changing `Report<T>` to `Report<()>` is only used internally for calling [`debug_hook`] and
    /// [`display_hook`] and is intentionally not exposed.
    ///
    /// [`debug_hook`]: Self::debug_hook
    /// [`display_hook`]: Self::display_hook
    pub(crate) const fn generalized(&self) -> &Report<()> {
        // SAFETY: `Report` is repr(transparent), so it's safe to cast between `Report<A>` and
        //         `Report<B>`
        unsafe { &*(self as *const Self).cast() }
    }
}
