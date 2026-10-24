---
"@hashintel/petrinaut": patch
---

Fix the code editor's web worker failing to load in apps that bundle Petrinaut with Vite. Petrinaut now emits the worker's URL in a form the app's bundler recognises, so the bundler copies the worker into the app's build.
