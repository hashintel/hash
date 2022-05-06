use execution::package::simulation::{
    context::ContextPackageName, init::InitPackageName, output::OutputPackageName,
    state::StatePackageName, PackageName,
};

use crate::config::error::{Error, Result};

/// Configuration of packages used in the engine.
/// Contains the names of all packages used.
/// If a name of a package is included,
/// then the respective package creator will use
/// the global and local configurations to create
/// the package instance for a simulation run.
/// Unless a default config is required, use
/// `ConfigBuilder`.
pub struct Config {
    pub init: Vec<InitPackageName>,
    pub context: Vec<ContextPackageName>,
    pub state: Vec<StatePackageName>,
    pub output: Vec<OutputPackageName>,
}

impl Config {
    fn default_init_packages() -> Vec<InitPackageName> {
        vec![InitPackageName::Json]
    }

    fn default_context_packages() -> Vec<ContextPackageName> {
        vec![
            ContextPackageName::Neighbors,
            ContextPackageName::ApiRequests,
            ContextPackageName::AgentMessages,
        ]
    }

    fn default_state_packages() -> Vec<StatePackageName> {
        vec![
            StatePackageName::BehaviorExecution,
            StatePackageName::Topology,
        ]
    }

    fn default_output_packages() -> Vec<OutputPackageName> {
        vec![OutputPackageName::JsonState, OutputPackageName::Analysis]
    }

    pub fn init_packages(&self) -> &Vec<InitPackageName> {
        &self.init
    }

    pub fn state_packages(&self) -> &[StatePackageName] {
        &self.state
    }

    pub fn context_packages(&self) -> &Vec<ContextPackageName> {
        &self.context
    }

    pub fn output_packages(&self) -> &Vec<OutputPackageName> {
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
    init: Option<Vec<InitPackageName>>,
    context: Option<Vec<ContextPackageName>>,
    state: Option<Vec<StatePackageName>>,
    output: Option<Vec<OutputPackageName>>,
}

impl ConfigBuilder {
    pub fn new() -> ConfigBuilder {
        ConfigBuilder::default()
    }

    pub fn set_init_packages<'a, K: IntoIterator<Item = &'a InitPackageName>>(
        mut self,
        init_packages: K,
    ) -> ConfigBuilder {
        self.init = Some(Vec::from_iter(init_packages.into_iter().cloned()));
        self
    }

    pub fn set_context_packages<'a, K: IntoIterator<Item = &'a ContextPackageName>>(
        mut self,
        context_packages: K,
    ) -> ConfigBuilder {
        self.context = Some(Vec::from_iter(context_packages.into_iter().cloned()));
        self
    }

    pub fn set_state_packages(mut self, state_packages: Vec<StatePackageName>) -> ConfigBuilder {
        self.state = Some(state_packages);
        self
    }

    pub fn set_output_packages<'a, K: IntoIterator<Item = &'a OutputPackageName>>(
        mut self,
        output_packages: K,
    ) -> ConfigBuilder {
        self.output = Some(Vec::from_iter(output_packages.into_iter().cloned()));
        self
    }

    pub fn add_init_package(mut self, init_package: InitPackageName) -> ConfigBuilder {
        match self.init {
            Some(ref mut pkgs) => {
                pkgs.push(init_package);
            }
            None => {
                self.init = Some(vec![init_package]);
            }
        };
        self
    }

    pub fn add_context_package(mut self, context_package: ContextPackageName) -> ConfigBuilder {
        match self.context {
            Some(ref mut pkgs) => {
                pkgs.push(context_package);
            }
            None => {
                self.context = Some(vec![context_package]);
            }
        };
        self
    }

    pub fn add_state_package(mut self, state_package: StatePackageName) -> ConfigBuilder {
        match self.state {
            Some(ref mut pkgs) => {
                pkgs.push(state_package);
            }
            None => {
                self.state = Some(vec![state_package]);
            }
        };
        self
    }

    pub fn add_output_package(mut self, output_package: OutputPackageName) -> ConfigBuilder {
        match self.output {
            Some(ref mut pkgs) => {
                pkgs.push(output_package);
            }
            None => {
                self.output = Some(vec![output_package]);
            }
        };
        self
    }

    pub fn build(self) -> Result<Config> {
        let mut init = self.init.unwrap_or_else(Config::default_init_packages);

        let mut context = self
            .context
            .unwrap_or_else(Config::default_context_packages);

        let state = self.state.unwrap_or_else(Config::default_state_packages);

        let mut output = self.output.unwrap_or_else(Config::default_output_packages);

        let init_as_deps = init
            .iter()
            .map(|n| PackageName::Init(*n))
            .collect::<Vec<_>>();
        let context_as_deps = context
            .iter()
            .map(|n| PackageName::Context(*n))
            .collect::<Vec<_>>();
        let state_as_deps = state
            .iter()
            .map(|n| PackageName::State(*n))
            .collect::<Vec<_>>();
        let output_as_deps = output
            .iter()
            .map(|n| PackageName::Output(*n))
            .collect::<Vec<_>>();

        // Gather all dependencies and insert
        for dependency in init_as_deps
            .iter()
            .chain(context_as_deps.iter())
            .chain(state_as_deps.iter())
            .chain(output_as_deps.iter())
        {
            let deps = dependency.get_all_dependencies()?;
            for dep in deps.into_iter_deps() {
                match dep {
                    PackageName::Context(dep_name) => {
                        context.push(dep_name);
                    }
                    PackageName::Init(dep_name) => {
                        init.push(dep_name);
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
                        output.push(dep_name);
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
