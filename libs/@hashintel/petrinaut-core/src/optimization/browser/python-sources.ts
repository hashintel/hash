import initSource from "@local/petrinaut-optimizer-core/python/__init__.py?raw";
import askTellSource from "@local/petrinaut-optimizer-core/python/ask_tell.py?raw";
import descriptionSource from "@local/petrinaut-optimizer-core/python/description.py?raw";
import pyodideEntrySource from "@local/petrinaut-optimizer-core/python/pyodide_entry.py?raw";
import studySource from "@local/petrinaut-optimizer-core/python/study.py?raw";

/** The optimizer's Python package, keyed by path relative to the import root. */
export const optimizerPythonSources: Readonly<Record<string, string>> = {
  "petrinaut_optimizer_core/__init__.py": initSource,
  "petrinaut_optimizer_core/description.py": descriptionSource,
  "petrinaut_optimizer_core/study.py": studySource,
  "petrinaut_optimizer_core/ask_tell.py": askTellSource,
  "petrinaut_optimizer_core/pyodide_entry.py": pyodideEntrySource,
};
