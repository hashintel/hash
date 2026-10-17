# Petrinaut website

HASH root guidance applies. The website compiles its React with the React Compiler; follow the [React Compiler section of the Petrinaut library's guidance](../../libs/@hashintel/petrinaut/AGENTS.md#react-compiler). [`react-plugin.ts`](react-plugin.ts) holds the compiler options for both the build and the unit tests, so tests exercise the compiled components that ship.
