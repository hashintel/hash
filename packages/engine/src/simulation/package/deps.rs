use crate::simulation::{
    package::{context, init, name::PackageName, output, state},
    Error, Result,
};

#[derive(Clone, Default)]
pub struct Dependencies {
    inner: Vec<PackageName>,
}

impl Dependencies {
    pub fn new() -> Dependencies {
        Self::default()
    }

    pub fn empty() -> Dependencies {
        Self::default()
    }

    fn add_dependency(&mut self, dep: PackageName) -> Result<()> {
        self.inner.push(dep);
        Ok(())
    }

    fn add_dependency_with_ignore(&mut self, dep: PackageName) -> Result<()> {
        if !self.inner.contains(&dep) {
            self.add_dependency(dep)?;
        }
        Ok(())
    }

    pub fn add_context_dep(&mut self, name: context::Name) -> Result<()> {
        let dependency = PackageName::Context(name);
        self.validate_clash(&dependency)?;
        self.add_dependency(dependency)
    }

    pub fn add_init_dep(&mut self, name: init::Name) -> Result<()> {
        let dependency = PackageName::Init(name);
        self.validate_clash(&dependency)?;
        self.add_dependency(dependency)
    }

    pub fn add_state_dep(&mut self, name: state::Name) -> Result<()> {
        let dependency = PackageName::State(name);
        self.validate_clash(&dependency)?;
        self.add_dependency(dependency)
    }

    pub fn add_output_dep(&mut self, name: output::Name) -> Result<()> {
        let dependency = PackageName::Output(name);
        self.validate_clash(&dependency)?;
        self.add_dependency(dependency)
    }

    pub fn contains(&self, dep: &PackageName) -> bool {
        self.inner.contains(dep)
    }

    pub fn iter_deps(&self) -> impl Iterator<Item = &PackageName> {
        self.inner.iter()
    }

    pub fn into_iter_deps(self) -> impl Iterator<Item = PackageName> {
        self.inner.into_iter()
    }

    fn validate_clash(&self, new: &PackageName) -> Result<()> {
        if self.contains(new) {
            return Err(Error::from(format!(
                "Dependencies ({:?}) already contain given dependency: {:?}",
                &self.inner, new
            )));
        }
        Ok(())
    }
}

impl PackageName {
    pub fn get_all_dependencies(&self) -> Result<Dependencies> {
        let mut merged = Dependencies::new();
        for dependency in self.get_dependencies()?.into_iter_deps() {
            merged.add_dependency_with_ignore(dependency.clone())?;
            let deps = dependency.get_all_dependencies()?;
            for dep in deps.into_iter_deps() {
                merged.add_dependency_with_ignore(dep)?;
            }
        }
        Ok(merged)
    }
}

#[cfg(test)]
pub mod tests {
    use std::sync::Arc;

    use uuid::Uuid;

    use super::*;
    use crate::{
        config::{ExperimentConfig, WorkerPoolConfig},
        proto::{ExperimentRunBase, InitialState, InitialStateName, ProjectBase},
        simulation::{Error, Result},
    };

    fn validate(mut parents: Vec<PackageName>, src_dep: PackageName) -> Result<()> {
        let cycle_found = parents.contains(&src_dep);
        parents.push(src_dep);
        if cycle_found {
            return Err(Error::from(format!(
                "Found cyclical dependency chain {:?}",
                parents
            )));
        } else {
            // Safe unwrap as we've added an element to `parents`
            let deps = parents.last().unwrap().get_dependencies()?;
            for dep in deps.into_iter_deps() {
                validate(parents.clone(), dep)?;
            }
        }
        Ok(())
    }

    macro_rules! validate {
        ($module:ident, $config:expr, $pkg_name:expr) => {
            $module::PACKAGE_CREATORS.initialize_for_experiment_run($config)?;
            for (name, _creator) in $module::PACKAGE_CREATORS.iter_checked()? {
                validate(vec![], $pkg_name(name.clone()))?;
            }
        };
    }

    #[test]
    fn validate_dependencies() -> Result<()> {
        let experiment_config = &Arc::new(ExperimentConfig {
            packages: Arc::new(Default::default()),
            run: Arc::new(
                ExperimentRunBase {
                    name: String::new().into(),
                    id: Uuid::new_v4(),
                    project_base: ProjectBase {
                        name: String::new(),
                        initial_state: InitialState {
                            name: InitialStateName::InitJson,
                            src: String::new(),
                        },
                        globals_src: String::new(),
                        experiments_src: None,
                        behaviors: vec![],
                        datasets: vec![],
                        packages: vec![],
                    },
                }
                .into(),
            ),
            worker_pool: Arc::new(WorkerPoolConfig {
                worker_base_config: Default::default(),
                num_workers: 0,
            }),
            target_max_group_size: 100_000,
            base_globals: Default::default(),
        });
        validate!(context, experiment_config, PackageName::Context);
        validate!(init, experiment_config, PackageName::Init);
        validate!(state, experiment_config, PackageName::State);
        validate!(output, experiment_config, PackageName::Output);
        Ok(())
    }
}
