use std::{collections::HashSet, iter::FromIterator};

use crate::simulation::{
    packages::{context, init, output, state},
    Error, Result,
};

use crate::simulation::packages::name::PackageName;
use context::Name as ContextPackage;
use init::Name as InitPackage;
use output::Name as OutputPackage;
use state::Name as StatePackage;

/// Configuration of packages used in the engine.
/// Contains the names of all packages used.
/// If a name of a package is included,
/// then the respsective package creator will use
/// the global and local configurations to create
/// the package instance for a simulation run.
/// Unless a default config is required, use
/// `ConfigBuilder`.
///
/// For the different package types, `HashSet`
/// collections indicate parallel execution
/// while `Vec` collections indicate sequential
/// execution.
pub struct Config {
    pub init: HashSet<InitPackage>,
    pub context: HashSet<ContextPackage>,
    pub state: Vec<StatePackage>,
    pub output: HashSet<OutputPackage>,
}

impl Config {
    fn new() -> Config {
        Config {
            init: HashSet::new(),
            context: HashSet::new(),
            state: vec![],
            output: HashSet::new(),
        }
    }

    fn default_init_packages() -> HashSet<InitPackage> {
        let default = [InitPackage::JSON];
        HashSet::from_iter(default.iter().cloned())
    }

    fn default_context_packages() -> HashSet<ContextPackage> {
        let default = [
            ContextPackage::AgentMessages,
            ContextPackage::Neighbors,
            ContextPackage::APIRequests,
        ];
        HashSet::from_iter(default.iter().cloned())
    }

    fn default_state_packages() -> Vec<StatePackage> {
        vec![StatePackage::BehaviorExecution, StatePackage::Topology]
    }

    fn default_output_packages() -> HashSet<OutputPackage> {
        let default = [OutputPackage::JSONState, OutputPackage::Analysis];
        HashSet::from_iter(default.iter().cloned())
    }

    pub fn init_packages(&self) -> &HashSet<InitPackage> {
        &self.init
    }

    pub fn state_packages(&self) -> &[StatePackage] {
        &self.state
    }

    pub fn context_packages(&self) -> &HashSet<ContextPackage> {
        &self.context
    }

    pub fn output_packages(&self) -> &HashSet<OutputPackage> {
        &self.output
    }
}

impl Default for Config {
    fn default() -> Self {
        Config {
            init: Self::default_init_packages(),
            context: Self::default_context_packages(),
            state: Self::default_state_packages(),
            output: Self::default_output_packages(),
        }
    }
}

#[derive(Debug, Default)]
pub struct ConfigBuilder {
    init: Option<HashSet<InitPackage>>,
    context: Option<HashSet<ContextPackage>>,
    state: Option<Vec<StatePackage>>,
    output: Option<HashSet<OutputPackage>>,
}

impl ConfigBuilder {
    pub fn new() -> ConfigBuilder {
        ConfigBuilder::default()
    }

    pub fn set_init_packages<'a, K: IntoIterator<Item = &'a InitPackage>>(
        mut self,
        init_packages: K,
    ) -> ConfigBuilder {
        self.init = Some(HashSet::from_iter(init_packages.into_iter().cloned()));
        self
    }

    pub fn set_context_packages<'a, K: IntoIterator<Item = &'a ContextPackage>>(
        mut self,
        context_packages: K,
    ) -> ConfigBuilder {
        self.context = Some(HashSet::from_iter(context_packages.into_iter().cloned()));
        self
    }

    pub fn set_state_packages(mut self, state_packages: Vec<StatePackage>) -> ConfigBuilder {
        self.state = Some(state_packages);
        self
    }

    pub fn set_output_packages<'a, K: IntoIterator<Item = &'a OutputPackage>>(
        mut self,
        output_packages: K,
    ) -> ConfigBuilder {
        self.output = Some(HashSet::from_iter(output_packages.into_iter().cloned()));
        self
    }

    pub fn add_init_package(self, init_package: InitPackage) -> ConfigBuilder {
        let new = if let Some(mut pkgs) = self.init {
            pkgs.insert(init_package);
            pkgs
        } else {
            unit_hash_set(init_package)
        };
        self.set_init_packages(&new)
    }

    pub fn add_context_package(self, context_package: ContextPackage) -> ConfigBuilder {
        let new = if let Some(mut pkgs) = self.context {
            pkgs.insert(context_package);
            pkgs
        } else {
            unit_hash_set(context_package)
        };
        self.set_context_packages(&new)
    }

    pub fn add_state_package(self, state_package: StatePackage) -> ConfigBuilder {
        let new = self
            .state
            .map(|mut pkgs| {
                pkgs.push(state_package);
                pkgs
            })
            .unwrap_or_else(|| vec![state_package]);
        self.set_state_packages(new)
    }

    pub fn add_output_package(self, output_package: OutputPackage) -> ConfigBuilder {
        let new = if let Some(mut pkgs) = self.output {
            pkgs.insert(output_package);
            pkgs
        } else {
            unit_hash_set(output_package)
        };
        self.set_output_packages(&new)
    }

    pub fn build(self) -> Result<Config> {
        let mut init = self.init.unwrap_or_else(|| Config::default_init_packages());

        let mut context = self
            .context
            .unwrap_or_else(|| Config::default_context_packages());

        let mut state = self
            .state
            .unwrap_or_else(|| Config::default_state_packages());

        let mut output = self
            .output
            .unwrap_or_else(|| Config::default_output_packages());

        let init_as_deps = init.iter().cloned().map(|n| PackageName::Init(n));
        let context_as_deps = context.iter().cloned().map(|n| PackageName::Context(n));
        let state_as_deps = state.iter().cloned().map(|n| PackageName::State(n));
        let output_as_deps = output.iter().cloned().map(|n| PackageName::Output(n));

        // Gather all dependencies and insert
        for dependency in init_as_deps
            .chain(context_as_deps)
            .chain(state_as_deps)
            .chain(output_as_deps)
        {
            let deps = dependency.get_all_dependencies()?;
            for dep in deps.into_iter_deps() {
                match dep {
                    PackageName::Context(dep_name) => {
                        context.insert(dep_name);
                    }
                    PackageName::Init(dep_name) => {
                        init.insert(dep_name);
                    }
                    PackageName::State(dep_name) => {
                        if !state.contains(&dep_name) {
                            return Err(Error::from(format!(
                                "State packages do not contain the package {:?}, 
                                         which is a dependency (child or descendant)
                                         for the {:?} package. State package dependencies 
                                         cannot be automatically loaded as they are bound 
                                         to an order of execution.",
                                dep_name, dependency
                            )));
                        }
                    }
                    PackageName::Output(dep_name) => {
                        output.insert(dep_name);
                    }
                }
            }
        }

        let config = Config {
            init,
            context,
            state,
            output,
        };

        Ok(config)
    }
}

fn unit_hash_set<T: Eq + std::hash::Hash>(element: T) -> HashSet<T> {
    let mut hash_set = HashSet::new();
    hash_set.insert(element);
    hash_set
}
