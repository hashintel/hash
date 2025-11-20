use std::{collections::HashMap, fs::File, io::BufReader, path::Path};

use criterion::Throughput;
use error_stack::{Report, ResultExt as _};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use walkdir::WalkDir;

use crate::benches::analyze::AnalyzeError;

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct Info {
    pub title: String,
    pub full_id: String,
    pub directory_name: String,
    pub throughput: Option<Throughput>,
    pub group_id: String,
    pub function_id: Option<String>,
    pub value_str: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct ConfidenceInterval {
    pub confidence_level: f64,
    pub lower_bound: f64,
    pub upper_bound: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct Stat {
    pub confidence_interval: ConfidenceInterval,
    pub point_estimate: f64,
    pub standard_error: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct Estimates {
    pub mean: Stat,
    pub median: Stat,
    pub median_abs_dev: Stat,
    pub slope: Option<Stat>,
    pub std_dev: Stat,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct ChangeEstimates {
    pub mean: Stat,
    pub median: Stat,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(transparent)]
pub(crate) struct Tukey {
    values: Box<[f64]>,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct Sample {
    pub sampling_mode: String,
    pub iters: Box<[f64]>,
    pub times: Box<[f64]>,
}

#[derive(Debug)]
pub(crate) struct Measurement {
    pub info: Info,
    pub estimates: Estimates,
    pub sample: Sample,
    pub tukey: Tukey,
}

impl Measurement {
    fn from_path(path: impl AsRef<Path>) -> Result<Option<(Box<str>, Self)>, Report<AnalyzeError>> {
        let path = path.as_ref();
        if !path.is_dir() {
            return Ok(None);
        }

        let Some(name) = path.file_name() else {
            return Ok(None);
        };

        let Some(info) = read_json_path(path.join("benchmark.json"))? else {
            return Ok(None);
        };
        let Some(estimates) = read_json_path(path.join("estimates.json"))? else {
            return Ok(None);
        };
        let Some(sample) = read_json_path(path.join("sample.json"))? else {
            return Ok(None);
        };
        let Some(tukey) = read_json_path(path.join("tukey.json"))? else {
            return Ok(None);
        };

        Ok(Some((
            name.to_string_lossy().into_owned().into_boxed_str(),
            Self {
                info,
                estimates,
                sample,
                tukey,
            },
        )))
    }
}

#[derive(Debug)]
pub(crate) struct Benchmark {
    pub measurements: HashMap<Box<str>, Measurement>,
    pub change: Option<ChangeEstimates>,
}

impl Benchmark {
    /// Reads a benchmark result from the given directory.
    ///
    /// Returns `None` if the directory does not contain any benchmark results.
    ///
    /// # Errors
    ///
    /// Returns an error if reading from the directory fails or the data is invalid.
    pub(crate) fn from_path(path: impl AsRef<Path>) -> Result<Option<Self>, Report<AnalyzeError>> {
        let path = path.as_ref();
        if !path.is_dir() {
            return Ok(None);
        }
        let mut measurements = HashMap::new();
        for entry in path.read_dir().change_context(AnalyzeError::ReadInput)? {
            let entry = entry.change_context(AnalyzeError::ReadInput)?.path();
            let Some((name, measurement)) = Measurement::from_path(&entry)? else {
                continue;
            };
            measurements.insert(name, measurement);
        }
        if measurements.is_empty() {
            return Ok(None);
        }

        Ok(Some(Self {
            measurements,
            change: read_json_path(path.join("change/estimates.json"))?,
        }))
    }

    pub(crate) fn gather(
        path: impl AsRef<Path>,
    ) -> impl Iterator<Item = Result<Self, Report<AnalyzeError>>> {
        WalkDir::new(path).into_iter().filter_map(|entry| {
            match entry.change_context(AnalyzeError::ReadInput) {
                Ok(entry) => Self::from_path(entry.into_path()).transpose(),
                Err(err) => Some(Err(err)),
            }
        })
    }
}

fn read_json_path<T>(path: impl AsRef<Path>) -> Result<Option<T>, Report<AnalyzeError>>
where
    T: DeserializeOwned,
{
    let path = path.as_ref();
    if !path.is_file() {
        return Ok(None);
    }
    Ok(Some(
        serde_json::from_reader(BufReader::new(
            File::open(path).change_context(AnalyzeError::ReadInput)?,
        ))
        .attach_with(|| path.display().to_string())
        .change_context(AnalyzeError::ParseInput)?,
    ))
}
