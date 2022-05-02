//! The Package System defines the building blocks of HASH Simulation, specifying the stages of
//! execution, and the types of logic that can be ran.
//!
//! The only invariant that the engine expects of a simulation project is that it creates a set of
//! [`Agent`]s backed by the data defined in [`stateful`], which may have their state changed as
//! simulation time progresses.
//!
//! The rest of the engine logic itself is defined within packages, self-contained implementations
//! that can affect the simulation initialisation, logic, and outputs.
//!
//! For example, if the [`BehaviorExecution`] State Package is enabled, then the engine will execute
//! behaviors on agents, depending on the behavior lists of the agents.
//!
//! A default collection of packages are usually used for the engine (
//! see [`PackageConfig`](crate::simulation::config::PackageConfig)).
// TODO: Create docs to explain package system uses and how to extend
//   see https://app.asana.com/0/1199548034582004/1201644736959126/f

pub mod context;
pub mod init;
pub mod output;
pub mod state;

pub mod creator;
pub mod run;
pub mod worker_init;

#[cfg(test)]
pub mod tests {
    use execution::{
        package::{
            init::{InitialState, InitialStateName},
            PackageInitConfig, PackageName,
        },
        Error, Result,
    };

    use super::{context, init, output, state};

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
            for dep in deps.iter_deps() {
                validate(parents.clone(), *dep)?;
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
        let init_config = PackageInitConfig {
            initial_state: InitialState {
                name: InitialStateName::InitJson,
                src: String::new(),
            },
            behaviors: vec![],
            packages: vec![],
        };
        validate!(context, &init_config, PackageName::Context);
        validate!(init, &init_config, PackageName::Init);
        validate!(state, &init_config, PackageName::State);
        validate!(output, &init_config, PackageName::Output);
        Ok(())
    }
}
