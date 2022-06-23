pub mod run;

#[cfg(test)]
pub mod tests {
    use execution::{
        package::simulation::{
            context::ContextPackageCreators,
            init::{InitPackageCreators, InitialState, InitialStateName},
            output::OutputPackageCreators,
            state::StatePackageCreators,
            PackageInitConfig, PackageName,
        },
        Error, Result,
    };

    use crate::simulation::comms::Comms;

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
        ($creators:expr, $pkg_name:expr) => {
            for (name, _creator) in $creators.iter() {
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

        validate!(
            ContextPackageCreators::from_config(&init_config)?,
            PackageName::Context
        );
        validate!(
            InitPackageCreators::from_config(&init_config)?,
            PackageName::Init
        );
        validate!(
            StatePackageCreators::from_config(&init_config)?,
            PackageName::State
        );
        validate!(
            OutputPackageCreators::from_config(&init_config)?,
            PackageName::Output
        );
        Ok(())
    }
}
