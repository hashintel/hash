use std::collections::HashMap;

use error_stack::{bail, IntoReport, Report, ResultExt};
use execution::package::experiment::{
    basic::{BasicExperimentConfig, SimpleExperimentConfig, SingleRunExperimentConfig},
    ExperimentName, ExperimentPackageConfig,
};
use json_comments::StripComments;
use rand::{distributions::Distribution, Rng, RngCore};
use rand_distr::{Beta, Gamma, LogNormal, Normal, Poisson};
use serde::{Deserialize, Serialize};
use serde_json::json;
use thiserror::Error;

use crate::{experiment::ExperimentType, SimulationSource};

#[derive(Debug, Error)]
#[error("Could not read experiment plan")]
pub struct ExperimentPlanError;

pub type Result<T, E = ExperimentPlanError> = error_stack::Result<T, E>;

impl ExperimentType {
    /// Creates an experiment config from `ExperimentType`.
    ///
    /// If the type is a simple Experiment [`Simple`](Self::Simple), it uses a `base` to load the
    /// experiment config for the given `name`.
    pub fn get_package_config(
        self,
        simulation: &SimulationSource,
    ) -> Result<ExperimentPackageConfig> {
        let basic = match self {
            ExperimentType::SingleRun { num_steps } => {
                BasicExperimentConfig::SingleRun(SingleRunExperimentConfig { num_steps })
            }
            ExperimentType::Simple { name } => BasicExperimentConfig::Simple(
                get_simple_experiment_config(simulation, name)
                    .attach_printable("Could not read simple experiment config")?,
            ),
        };
        Ok(ExperimentPackageConfig::Basic(basic))
    }
}

fn get_simple_experiment_config(
    simulation: &SimulationSource,
    experiment_name: ExperimentName,
) -> Result<SimpleExperimentConfig> {
    let experiments_manifest = simulation
        .experiments_src
        .as_ref()
        .ok_or_else(|| Report::new(ExperimentPlanError))
        .attach_printable("Experiment configuration not found: experiments.json")?;
    let experiments_manifest_comment_remover = StripComments::new(experiments_manifest.as_bytes());
    let parsed = serde_json::from_reader(experiments_manifest_comment_remover)
        .into_report()
        .change_context(ExperimentPlanError)
        .attach_printable("Could not parse experiment manifest")?;
    let plan = create_experiment_plan(&parsed, &experiment_name)
        .attach_printable("Could not read experiment plan")?;

    let max_sims_in_parallel = parsed
        .get("max_sims_in_parallel")
        .map(|val| {
            val.as_u64()
                .map(|val| val as usize)
                .ok_or_else(|| Report::new(ExperimentPlanError))
        })
        .transpose()
        .attach_printable(
            "max_sims_in_parallel in globals.json was set, but wasn't a valid integer",
        )?; // Extract and report the error for failed parsing

    let config = SimpleExperimentConfig {
        experiment_name,
        changed_globals: plan
            .inner
            .into_iter()
            .flat_map(|v| {
                v.fields
                    .into_iter()
                    .map(|(property_path, changed_value)| json!({ property_path: changed_value }))
            })
            .collect(),
        num_steps: plan.num_steps,
        max_sims_in_parallel,
    };
    Ok(config)
}

fn create_experiment_plan(
    experiments: &HashMap<String, serde_json::Value>,
    experiment_name: &ExperimentName,
) -> Result<SimpleExperimentPlan> {
    let selected_experiment = experiments
        .get(experiment_name.as_str())
        .ok_or_else(|| Report::new(ExperimentPlanError))
        .attach_printable_lazy(|| {
            format!(
                "Expected experiments.json to contain the specified experiment definition for \
                 experiment with name: {experiment_name}",
            )
        })?;
    let experiment_type = selected_experiment
        .get("type")
        .ok_or_else(|| Report::new(ExperimentPlanError))
        .attach_printable("Expected experiment definition to contain an experiment type")?
        .as_str()
        .ok_or_else(|| Report::new(ExperimentPlanError))
        .attach_printable("Expected experiment definition type to have a string value")?;
    match experiment_type {
        "group" => create_group_variant(selected_experiment, experiments),
        "multiparameter" => create_multiparameter_variant(selected_experiment, experiments),
        "optimization" => bail!(
            Report::new(ExperimentPlanError)
                .attach_printable("Not implemented for optimization experiment types")
        ),
        _ => create_basic_variant(selected_experiment, experiment_type)
            .attach_printable("Could not parse basic variant"),
    }
}

fn create_multiparameter_variant(
    selected_experiment: &serde_json::Value,
    experiments: &HashMap<String, serde_json::Value>,
) -> Result<SimpleExperimentPlan> {
    #[derive(Serialize, Deserialize)]
    struct MultiparameterVariant {
        #[serde(rename = "type")]
        _type: String,
        steps: usize,
        runs: Vec<String>,
    }

    let var: MultiparameterVariant = serde_json::from_value(selected_experiment.clone())
        .into_report()
        .change_context(ExperimentPlanError)
        .attach_printable("Could not parse multiparameter variant")?;
    let subplans = var
        .runs
        .iter()
        .map(|run_name| {
            let selected = experiments
                .get(run_name)
                .ok_or_else(|| Report::new(ExperimentPlanError))
                .attach_printable_lazy(|| {
                    format!("Experiment plan does not define the specified experiment: {run_name}")
                })
                .attach_printable("Could not parse experiment file")?;
            create_basic_variant(selected, run_name)
                .attach_printable("Could not parse basic variant")
        })
        .collect::<Result<Vec<SimpleExperimentPlan>>>()
        .attach_printable("Unable to create sub plans")?;

    let mut variant_list: Vec<ExperimentPlanEntry> = vec![];
    for (i, subplan) in subplans.into_iter().enumerate() {
        if i == 0 {
            variant_list = subplan.inner;
        } else {
            let mut new_variant_list: Vec<ExperimentPlanEntry> = vec![];
            for entry in subplan.inner.into_iter().map(|v| v.fields) {
                for existing_entry in &variant_list {
                    let mut merged = existing_entry.clone();
                    entry.iter().for_each(|(name, value)| {
                        merged.fields.insert(name.clone(), value.clone());
                    });
                    new_variant_list.push(merged);
                }
            }
            variant_list = new_variant_list;
        }
    }

    let mut plan = SimpleExperimentPlan::new(var.steps);
    plan.inner = variant_list;
    Ok(plan)
}

fn create_group_variant(
    selected_experiment: &serde_json::Value,
    experiments: &HashMap<String, serde_json::Value>,
) -> Result<SimpleExperimentPlan> {
    #[derive(Serialize, Deserialize)]
    struct GroupVariant {
        // TODO: move ALL variants to proto, experiment plan creation to simple exp controller def
        #[serde(rename = "type")]
        _type: String,
        steps: f64,
        runs: Vec<ExperimentName>,
    }
    let var: GroupVariant = serde_json::from_value(selected_experiment.clone())
        .into_report()
        .change_context(ExperimentPlanError)
        .attach_printable("Could not create group variant")?;
    var.runs.iter().try_fold(
        SimpleExperimentPlan::new(var.steps as usize),
        |mut acc, name| {
            let variants = create_experiment_plan(experiments, name)
                .attach_printable("Could not read experiment plan")?;
            variants.inner.into_iter().for_each(|v| {
                acc.push(v);
            });
            Ok(acc)
        },
    )
}

fn create_basic_variant(
    selected_experiment: &serde_json::Value,
    experiment_type: &str,
) -> Result<SimpleExperimentPlan> {
    match experiment_type {
        "monte-carlo" => create_monte_carlo_variant_plan(selected_experiment),
        "values" => create_value_variant_plan(selected_experiment),
        "linspace" => create_linspace_variant_plan(selected_experiment),
        "arange" => create_arange_variant_plan(selected_experiment),
        "meshgrid" => create_meshgrid_variant_plan(selected_experiment),
        _ => bail!(
            Report::new(ExperimentPlanError)
                .attach_printable(format!("Unknown experiment type: {experiment_type}"))
        ),
    }
}

pub type Mapper = Box<dyn Fn(serde_json::Value, usize) -> serde_json::Value>;

fn create_variant_with_mapped_value(
    field: &str,
    items: &[serde_json::Value],
    mapper: &Mapper,
    num_steps: usize,
) -> SimpleExperimentPlan {
    items.iter().enumerate().fold(
        SimpleExperimentPlan::new(num_steps),
        |mut acc, (index, val)| {
            let mapped_value = mapper(val.clone(), index);
            acc.push(HashMap::from([(field.to_string(), mapped_value)]).into());
            acc
        },
    )
}

fn create_monte_carlo_variant_plan(
    selected_experiment: &serde_json::Value,
) -> Result<SimpleExperimentPlan> {
    #[derive(Serialize, Deserialize)]
    struct MonteCarloVariant {
        #[serde(rename = "type")]
        _type: String,
        steps: f64,
        field: String,
        samples: f64,
        distribution: String,
        mean: Option<f64>,
        std: Option<f64>,
        mu: Option<f64>,
        sigma: Option<f64>,
        rate: Option<f64>,
        alpha: Option<f64>,
        beta: Option<f64>,
        shape: Option<f64>,
        scale: Option<f64>,
    }

    // Needed trait objects of distributions, solution from:
    // https://users.rust-lang.org/t/vec-of-rand-distribution-trait-objects/58727/2
    pub trait DynDistribution<T> {
        fn sample_(&self, rng: &mut dyn RngCore) -> T;
    }

    impl<D, T> DynDistribution<T> for D
    where
        D: Distribution<T>,
    {
        fn sample_(&self, rng: &mut dyn RngCore) -> T {
            <Self as Distribution<T>>::sample(self, rng)
        }
    }

    impl<T> Distribution<T> for dyn DynDistribution<T> + '_ {
        fn sample<R: Rng + ?Sized>(&self, mut rng: &mut R) -> T {
            self.sample_(&mut rng)
        }
    }

    impl MonteCarloVariant {
        fn sample_distribution_fn(&self) -> Result<Mapper> {
            let distribution = match self.distribution.as_str() {
                "normal" => Box::new(
                    Normal::new(self.mean.unwrap_or(1.0), self.std.unwrap_or(1.0))
                        .into_report()
                        .change_context(ExperimentPlanError)
                        .attach_printable("Unable to create normal distribution")?,
                ) as Box<dyn DynDistribution<f64>>,
                "log-normal" => Box::new(
                    LogNormal::new(self.mu.unwrap_or(1.0), self.sigma.unwrap_or(1.0))
                        .into_report()
                        .change_context(ExperimentPlanError)
                        .attach_printable("Unable to create log-normal distribution")?,
                ),
                "poisson" => Box::new(
                    Poisson::new(self.rate.unwrap_or(1.0))
                        .into_report()
                        .change_context(ExperimentPlanError)
                        .attach_printable("Unable to create poisson distribution")?,
                ),
                "beta" => Box::new(
                    Beta::new(self.alpha.unwrap_or(1.0), self.beta.unwrap_or(1.0))
                        .into_report()
                        .change_context(ExperimentPlanError)
                        .attach_printable("Unable to create beta distribution")?,
                ),
                "gamma" => Box::new(
                    Gamma::new(self.shape.unwrap_or(1.0), self.scale.unwrap_or(1.0))
                        .into_report()
                        .change_context(ExperimentPlanError)
                        .attach_printable("Unable to create gamma distribution")?,
                ),
                _ => Box::new(
                    Normal::new(1.0, 1.0)
                        .into_report()
                        .change_context(ExperimentPlanError)
                        .attach_printable("Unable to create normal distribution")?,
                ),
            };
            Ok(Box::new(move |_, _| {
                let mut rng = rand::thread_rng();
                distribution.sample(&mut rng).into()
            }))
        }
    }

    let var: MonteCarloVariant = serde_json::from_value(selected_experiment.clone())
        .into_report()
        .change_context(ExperimentPlanError)
        .attach_printable("Could not create monte carlo distribution")?;
    let values: Vec<_> = (0..var.samples as usize).map(|_| 0.into()).collect();
    Ok(create_variant_with_mapped_value(
        &var.field,
        &values,
        &var.sample_distribution_fn()?,
        var.steps as usize,
    ))
}

fn create_value_variant_plan(
    selected_experiment: &serde_json::Value,
) -> Result<SimpleExperimentPlan> {
    #[derive(Serialize, Deserialize)]
    struct ValueVariant {
        #[serde(rename = "type")]
        _type: String,
        steps: f64,
        field: String,
        values: Vec<serde_json::Value>,
    }

    let var: ValueVariant = serde_json::from_value(selected_experiment.clone())
        .into_report()
        .change_context(ExperimentPlanError)
        .attach_printable("Could not parse value variant")?;
    let mapper: Mapper = Box::new(|val, _index| val);
    Ok(create_variant_with_mapped_value(
        &var.field,
        &var.values,
        &mapper,
        var.steps as usize,
    ))
}

fn create_linspace_variant_plan(
    selected_experiment: &serde_json::Value,
) -> Result<SimpleExperimentPlan> {
    #[derive(Clone, Serialize, Deserialize, Debug)]
    struct LinspaceVariant {
        #[serde(rename = "type")]
        _type: String,
        steps: f64,
        field: String,
        samples: f64,
        start: f64,
        stop: f64,
    }
    let var: LinspaceVariant = serde_json::from_value(selected_experiment.clone())
        .into_report()
        .change_context(ExperimentPlanError)
        .attach_printable("Could not create linspace variant")?;
    let values: Vec<_> = (0..var.samples as usize).map(|_| 0.into()).collect();

    let closure_var = var.clone();
    let mapper: Mapper = Box::new(move |_val, index| {
        let denominator = if closure_var.samples > 1.0 {
            (closure_var.samples - 1.0) as f64
        } else {
            1.0
        };
        let x = closure_var.start
            + (index as f64 * (closure_var.stop - closure_var.start)) / denominator;
        x.into()
    });

    Ok(create_variant_with_mapped_value(
        &var.field,
        &values,
        &mapper,
        var.steps as usize,
    ))
}

fn create_arange_variant_plan(
    selected_experiment: &serde_json::Value,
) -> Result<SimpleExperimentPlan> {
    #[derive(Serialize, Deserialize)]
    struct ArangeVariant {
        #[serde(rename = "type")]
        _type: String,
        steps: f64,
        field: String,
        increment: f64,
        start: f64,
        stop: f64,
    }
    let var: ArangeVariant = serde_json::from_value(selected_experiment.clone())
        .into_report()
        .change_context(ExperimentPlanError)
        .attach_printable("Could not create arange variant")?;
    let mut values = vec![];
    let mut cur = var.start;
    while cur <= var.stop {
        values.push(cur.into());
        cur += var.increment;
    }
    let mapper: Mapper = Box::new(|val, _index| val);
    Ok(create_variant_with_mapped_value(
        &var.field,
        &values,
        &mapper,
        var.steps as usize,
    ))
}

fn create_meshgrid_variant_plan(
    selected_experiment: &serde_json::Value,
) -> Result<SimpleExperimentPlan> {
    #[derive(Serialize, Deserialize)]
    struct MeshgridVariant {
        #[serde(rename = "type")]
        _type: String,
        steps: f64,
        x_field: String,
        y_field: String,
        x: [f64; 3],
        // [start, stop, num_samples]
        y: [f64; 3], // [start, stop, num_samples]
    }
    let var: MeshgridVariant = serde_json::from_value(selected_experiment.clone())
        .into_report()
        .change_context(ExperimentPlanError)
        .attach_printable("Could not create meshgrid variant")?;

    let mut plan = SimpleExperimentPlan::new(var.steps as usize);
    let x_space = linspace(var.x[0], var.x[1], var.x[2] as usize);
    let y_space = linspace(var.y[0], var.y[1], var.y[2] as usize);

    for x_val in x_space {
        for y_val in &y_space {
            let entry = HashMap::from([
                (var.x_field.clone(), x_val.into()),
                (var.y_field.clone(), (*y_val).into()),
            ])
            .into();
            plan.push(entry);
        }
    }

    Ok(plan)
}

fn linspace(start: f64, stop: f64, num_samples: usize) -> Vec<f64> {
    let mut samples = vec![];
    let length = (stop - start) / (num_samples - 1) as f64;
    let mut index = start;
    while index <= stop {
        samples.push(start + length * index);
        index += length;
    }
    samples
}

#[derive(Clone, Debug)]
struct ExperimentPlanEntry {
    fields: HashMap<String, serde_json::Value>,
}

impl From<HashMap<String, serde_json::Value>> for ExperimentPlanEntry {
    fn from(fields: HashMap<String, serde_json::Value>) -> Self {
        ExperimentPlanEntry { fields }
    }
}

#[derive(Clone)]
struct SimpleExperimentPlan {
    inner: Vec<ExperimentPlanEntry>,
    num_steps: usize,
}

impl SimpleExperimentPlan {
    pub fn new(num_steps: usize) -> SimpleExperimentPlan {
        SimpleExperimentPlan {
            inner: Vec::new(),
            num_steps,
        }
    }

    pub fn push(&mut self, value: ExperimentPlanEntry) {
        self.inner.push(value);
    }
}
