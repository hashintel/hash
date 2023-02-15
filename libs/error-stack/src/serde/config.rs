use crate::fmt;

pub(crate) struct Config {
    context: HookContext<()>,
    frame: fmt::config::Config,
}
