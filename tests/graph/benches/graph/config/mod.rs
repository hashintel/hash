use core::error::Error;
use std::{
    collections::HashMap,
    fs::{self, File},
    io::BufReader,
    path::Path,
    sync::LazyLock,
};

use error_stack::{Report, ResultExt as _, TryReportIteratorExt as _};
use hash_graph_test_data::seeding::producer::{
    data_type::DataTypeProducerConfig, entity_type::EntityTypeProducerConfig,
    property_type::PropertyTypeProducerConfig, user::UserProducerConfig,
};
use serde::de::DeserializeOwned;

pub static USER_PRODUCER_CONFIGS: LazyLock<HashMap<String, UserProducerConfig>> =
    LazyLock::new(|| load_configs_map("users"));

pub static DATA_TYPE_PRODUCER_CONFIGS: LazyLock<HashMap<String, DataTypeProducerConfig>> =
    LazyLock::new(|| load_configs_map("data_types"));

pub static PROPERTY_TYPE_PRODUCER_CONFIGS: LazyLock<HashMap<String, PropertyTypeProducerConfig>> =
    LazyLock::new(|| load_configs_map("property_types"));

pub static ENTITY_TYPE_PRODUCER_CONFIGS: LazyLock<HashMap<String, EntityTypeProducerConfig>> =
    LazyLock::new(|| load_configs_map("entity_types"));

#[derive(Debug, derive_more::Display)]
pub enum LoadConfigError {
    #[display("I/O error while reading config")]
    Io,
    #[display("Failed to parse config")]
    Parse,
}

impl Error for LoadConfigError {}

fn load_json_configs<T: DeserializeOwned>(
    subdir: &str,
) -> Result<HashMap<String, T>, Report<[LoadConfigError]>> {
    // Real configs live under benches/config/<category>
    let dir = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("config")
        .join("producers")
        .join(subdir);

    fs::read_dir(&dir)
        .change_context(LoadConfigError::Io)?
        .map(|entry| {
            let entry = entry.change_context(LoadConfigError::Io)?;
            if entry
                .file_type()
                .change_context(LoadConfigError::Io)?
                .is_dir()
            {
                return Ok::<_, Report<LoadConfigError>>(None);
            }
            let path = entry.path();
            if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
                return Ok(None);
            }
            let stem = path
                .file_stem()
                .expect("file has stem")
                .to_string_lossy()
                .into_owned();
            let file = File::open(&path).change_context(LoadConfigError::Io)?;
            let reader = BufReader::new(file);
            let cfg = serde_json::from_reader(reader)
                .change_context(LoadConfigError::Parse)
                .attach_printable_lazy(|| {
                    format!("Failed to parse config file: `{}`", path.display())
                })?;
            let key = format!("{subdir}/{stem}");
            Ok(Some((key, cfg)))
        })
        .filter_map(Result::transpose)
        .try_collect_reports()
}

pub(crate) fn load_configs_map<T: DeserializeOwned>(subdir: &str) -> HashMap<String, T> {
    load_json_configs(subdir).expect("should be able to collect configs")
}
