import dspy
from dspy.evaluate.evaluate import Evaluate
import json

from definition import EntityRecognizerProgram
from metric import metric
from llms import haiku, gpt4o

dspy.settings.configure(lm=haiku)

# Load the training set for unoptimized evaluation
with open("trainset.json") as f:
    tests = json.load(f)

devset = [dspy.Example(**item).with_inputs("context", "entity_type", "relevant_entities_description") for item in tests]

# Create the evaluation function
# Table display is not supported in the terminal – see https://github.com/stanfordnlp/dspy/issues/663
evaluate = Evaluate(devset=devset, metric=metric, num_threads=4, display_progress=True, display_table=False)

# Evaluate the unoptimized program's performance on the testset
print("******************* Unoptimized program *******************")
result = evaluate(EntityRecognizerProgram())
print(f"********* Unoptimized program's score: {result} *********")
