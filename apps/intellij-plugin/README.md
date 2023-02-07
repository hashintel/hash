# HASH IntelliJ-Plugin

This is a highly experimental plugin to assist development in common HASH workflows.

## Disclaimer

This plugin is to be considered **highly experimental**, HASH does not guarantee any long-term support. This project might vanish one day if it wasn't deemed feasible.

**Security Disclaimer:** Due to the highly experimental status, the code is currently not as thoroughly tested and reviewed as other projects in this repository.

## Running the plugin

To install and run the plugin it is recommended to have a JetBrains IDE installed, navigate to this folder and execute `./gradlew buildPlugin` to build the plugin (can be found at `/build/distributions`) and `./gradlew runIde` to test run the plugin in a sandboxed CLion installation.

### Troubleshooting

You need to have a recent Java version installed, if that is not the case, install the `Gradle` plugin for in your IDE of choice and create a new run configuration with either command. The IDE should be able to automagically install and maintain the required Java version.

## Contributors

[//]: # "what should go here?"

## License

`intellij-plugin` is available under a number of different open-source licenses. Please see the [LICENSE] file to review your options.
