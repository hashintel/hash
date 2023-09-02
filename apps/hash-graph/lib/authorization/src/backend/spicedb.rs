use std::borrow::Cow;

mod api;
mod model;

#[derive(Debug)]
pub struct SpiceDb {
    pub configuration: SpiceDbConfig,
}

#[derive(Debug)]
pub struct SpiceDbConfig {
    pub base_path: Cow<'static, str>,
    pub client: reqwest::Client,
    pub key: Cow<'static, str>,
}
