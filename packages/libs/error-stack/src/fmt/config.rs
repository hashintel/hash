use crate::fmt::{Charset, ColorMode};
#[cfg(any(feature = "std", feature = "hooks"))]
use crate::fmt::{Format, HookContext};

#[cfg(any(feature = "std", feature = "hooks"))]
pub(crate) struct Config {
    context: HookContext<()>,
}

#[cfg(any(feature = "std", feature = "hooks"))]
impl Config {
    pub(crate) fn new(color_mode: ColorMode, charset: Charset, alternate: bool) -> Self {
        let context = HookContext::new(Format::new(alternate, color_mode, charset));

        Self { context }
    }

    pub(crate) fn load(alternate: bool) -> Self {
        let color_mode = ColorMode::load();
        let charset = Charset::load();

        Self::new(color_mode, charset, alternate)
    }

    pub(crate) fn context<T>(&mut self) -> &mut HookContext<T> {
        self.context.cast()
    }

    pub(crate) const fn color_mode(&self) -> ColorMode {
        self.context.color_mode()
    }

    pub(crate) const fn charset(&self) -> Charset {
        self.context.charset()
    }
}

#[cfg(not(any(feature = "std", feature = "hooks")))]
pub(crate) struct Config {
    color_mode: ColorMode,
    charset: Charset,
}

#[cfg(not(any(feature = "std", feature = "hooks")))]
impl Config {
    // alternate is still provided, as it is used in the hook counterpart
    #[allow(unused)]
    pub(crate) const fn new(color_mode: ColorMode, charset: Charset, alternate: bool) -> Self {
        Self {
            color_mode,
            charset,
        }
    }

    pub(crate) fn load(alternate: bool) -> Self {
        let color_mode = ColorMode::load();
        let charset = Charset::load();

        Self::new(color_mode, charset, alternate)
    }

    // This is here for parity to the hook counterpart, might be unused in some
    // configurations (no `color` feature)
    #[allow(unused)]
    pub(crate) const fn color_mode(&self) -> ColorMode {
        self.color_mode
    }

    pub(crate) const fn charset(&self) -> Charset {
        self.charset
    }
}
