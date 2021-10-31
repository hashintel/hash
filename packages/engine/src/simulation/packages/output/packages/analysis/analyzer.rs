use std::{collections::HashMap, convert::TryFrom, sync::Arc};

use serde::{Deserialize, Serialize};

use crate::datastore::batch::AgentBatch;
use crate::datastore::schema::state::AgentSchema;
use crate::simulation::packages::output::packages::analysis::output::AnalysisSingleOutput;

use super::index_iter;
use super::AnalysisOutput;
use super::{Error, Result};

pub(crate) const ULPS: i64 = 2;

type Agents<'a> = &'a [&'a AgentBatch];
pub(crate) type IndexIterator<'a> = Box<dyn Iterator<Item = usize> + Send + Sync + 'a>;
pub(crate) type OutputRunner<'agents> =
    Box<dyn FnOnce(IndexIterator<'agents>) -> Result<AnalysisOutput> + Send + Sync + 'agents>;
pub(crate) type OutputRunnerCreator =
    Box<dyn for<'agents> Fn(Agents<'agents>) -> Result<OutputRunner<'agents>> + Send + Sync>;

pub(crate) type NumberIterator<'a> = Box<dyn Iterator<Item = Option<f64>> + Send + Sync + 'a>;
pub(crate) type ValueIterator<'a> = Box<dyn Iterator<Item = serde_json::Value> + Send + Sync + 'a>;
pub(crate) type ValueIteratorCreator =
    Box<dyn for<'agents> Fn(Agents<'agents>) -> Result<ValueIterator<'agents>> + Send + Sync>;

pub(crate) type MapIterator = Box<
    dyn for<'agents> Fn(ValueIterator<'agents>) -> Result<ValueIterator<'agents>> + Send + Sync,
>;

pub struct Analyzer {
    _repr: AnalysisSourceRepr,
    pub outputs: Vec<(String, OutputCreator, Vec<AnalysisOutput>)>,
    src: String,
}

impl Analyzer {
    pub fn from_analysis_source(
        analysis_source: &str,
        agent_schema: &AgentSchema,
    ) -> Result<Analyzer> {
        let repr = AnalysisSourceRepr::try_from(analysis_source)?;
        repr.validate_def()?;

        let outputs = repr
            .outputs
            .iter()
            .map(|(name, output)| {
                let creator = OutputCreator::new(agent_schema, output)?;
                Ok((name.to_string(), creator, Vec::new()))
            })
            .collect::<Result<_>>()?;

        Ok(Analyzer {
            _repr: repr,
            outputs,
            src: analysis_source.to_string(),
        })
    }

    pub fn is_empty(&self) -> bool {
        self.outputs.is_empty()
    }

    pub fn run(&mut self, dynamic_pool: &[&AgentBatch], num_agents: usize) -> Result<()> {
        self.outputs
            .iter_mut()
            .try_for_each(|(output_name, creator, outputs)| {
                let output = creator.run(dynamic_pool, num_agents).map_err(|e| {
                    Error::from(format!(
                        "Error in the analysis output \"{}\": {}",
                        output_name,
                        e.to_string()
                    ))
                })?;
                outputs.push(output);
                // log::debug!("Ran analysis. Output ({}): {:?}", _output_name, v);
                Ok(())
            })
    }

    pub fn get_latest_output_set(&self) -> AnalysisOutput {
        AnalysisOutput {
            inner: self
                .outputs
                .iter()
                .map(|(name, _, outputs)| {
                    // TODO revisit architecture, these clones seem unnecessary, having a single vec instead
                    //     of a HashMap seems like it would be a lot more efficient and just keep ordering
                    (Arc::new(name.clone()), outputs.last().unwrap().clone())
                })
                .collect(),
        }
    }

    pub fn last_output_scalar(&self, name: &str) -> Result<Option<f64>> {
        fn invalid_value_convert<A, B>(output: &(A, B, Vec<AnalysisOutput>)) -> String {
            if let Some(Ok(v)) = output.2.last().map(|v| serde_json::to_string(v)) {
                v
            } else {
                "null".into()
            }
        }

        for output in self.outputs.iter() {
            if output.0 == name {
                return match output.2.last() {
                    None => Err(Error::EmptyAnalysisOutput(name.into())),
                    Some(AnalysisSingleOutput::Number(v)) => Ok(*v),
                    _ => Err(Error::InvalidAnalysisOutputForOptimization {
                        name: name.into(),
                        value: invalid_value_convert(output),
                    }),
                };
            }
        }

        Err(Error::MissingAnalysisOutput(name.into()))
    }

    // TODO: Rename to `take` to make it obvious that can't finalize multiple times?
    pub fn finalize(&mut self) -> Result<AnalysisResult> {
        let mut map = HashMap::with_capacity(self.outputs.len());
        self.outputs
            .iter_mut()
            .for_each(|(output_name, _, outputs)| {
                map.insert(output_name.clone(), std::mem::replace(outputs, vec![]));
            });
        let src = std::mem::replace(&mut self.src, "".into());
        Ok(AnalysisResult {
            manifest: src,
            outputs: map,
        })
    }
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
struct AnalysisSourceRepr {
    #[serde(default = "HashMap::new")]
    pub outputs: HashMap<String, Vec<AnalysisOperationRepr>>,
    #[serde(default = "Vec::new")]
    plots: Vec<serde_json::Value>,
}

impl<'a> TryFrom<&'a str> for AnalysisSourceRepr {
    type Error = Error;

    fn try_from(source: &'a str) -> Result<Self> {
        if source.trim().is_empty() {
            Ok(Self::default())
        } else {
            let repr = match serde_json::from_str(source) {
                Ok(repr) => repr,
                Err(why) => {
                    return Err(Error::from(format!(
                        "Parsing the Analysis definition ('analysis.json') failed: {}",
                        why.to_string()
                    )))
                }
            };
            Ok(repr)
        }
    }
}

pub struct OutputCreator {
    creator: OutputRunnerCreator,
}

impl OutputCreator {
    fn new(
        agent_schema: &AgentSchema,
        operations: &[AnalysisOperationRepr],
    ) -> Result<OutputCreator> {
        let creator = Self::index_creator(operations, agent_schema)?;
        Ok(OutputCreator { creator })
    }

    fn run(&self, dynamic_pool: &[&AgentBatch], num_agents: usize) -> Result<AnalysisOutput> {
        ((&self.creator)(dynamic_pool)?)(Box::new(0..num_agents))
    }

    fn index_creator(
        operations: &[AnalysisOperationRepr],
        agent_schema: &AgentSchema,
    ) -> Result<OutputRunnerCreator> {
        match &operations[0] {
            AnalysisOperationRepr::Filter {
                field,
                comparison,
                value,
            } => index_iter::index_iterator_filter_creator(
                operations,
                agent_schema,
                field
                    .as_str()
                    .ok_or_else(|| {
                        Error::from(format!(
                            "Top-level filter (by value '{}') must index by string",
                            serde_json::to_string(&value).unwrap_or_else(|_| "__error__".into())
                        ))
                    })?
                    .to_string(),
                comparison,
                value,
            ),
            AnalysisOperationRepr::Get { field: _ } => {
                index_iter::index_iterator_mapper_creator(operations, agent_schema)
            }
            AnalysisOperationRepr::Count => Ok(Box::new(move |_| {
                Ok(Box::new(
                    move |iterator: Box<dyn Iterator<Item = usize> + Send + Sync>| {
                        Ok(AnalysisSingleOutput::some_number(iterator.count() as f64))
                    },
                ) as OutputRunner)
            })),
            AnalysisOperationRepr::Sum
            | AnalysisOperationRepr::Min
            | AnalysisOperationRepr::Max
            | AnalysisOperationRepr::Mean => {
                return Err(Error::from(
                    "Aggregators of numbers may not be called directly",
                ));
            }
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum ComparisonRepr {
    Eq,
    Neq,
    Lt,
    Lte,
    Gt,
    Gte,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum AnalysisOperationRepr {
    Filter {
        field: serde_json::Value,
        comparison: ComparisonRepr,
        value: serde_json::Value,
    },
    Get {
        field: serde_json::Value, // May be a string or an index (usize)
    },
    Count,
    Sum,
    Min,
    Max,
    Mean,
}

impl AnalysisOperationRepr {
    pub fn is_filter(&self) -> bool {
        matches!(self, Self::Filter { .. })
    }

    pub fn is_map(&self) -> bool {
        matches!(self, Self::Get { .. })
    }

    pub fn is_count(&self) -> bool {
        matches!(self, Self::Count)
    }

    pub fn is_num_aggregator(&self) -> bool {
        match self {
            Self::Sum | Self::Min | Self::Max | Self::Mean => true,
            _ => self.is_count(),
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AnalysisResult {
    manifest: String,
    outputs: HashMap<String, Vec<AnalysisOutput>>,
}
