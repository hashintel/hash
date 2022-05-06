pub mod context;
pub mod init;
pub mod output;
pub mod state;

pub mod creator;
pub mod run;

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
