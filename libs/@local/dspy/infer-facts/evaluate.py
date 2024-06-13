import dspy
from dspy.evaluate.evaluate import Evaluate
import json

from definition import FactInferrerProgram
from metric import metric
from llms import haiku

dspy.settings.configure(lm=haiku)

# Run the unoptimized program on a test case and print the answer
# This isn't needed for the evaluation, it's just for demoing,
# and to help generate facts on new cases
# with open("testset.json") as f:
#     input_data = json.load(f)

# unoptimized_program = FactInferrerProgram()
# pred = unoptimized_program (**input_data[0])
# print("Unoptimized answer:")
# print(f"{pred}")

# haiku.inspect_history(n=1)

# Load the set for evaluation
with open("trainset.json") as f:
    tests = json.load(f)

devset = [dspy.Example(**item).with_inputs("context", "subject_entity", "potential_object_entities") for item in tests]

# Create the evaluation function
# Table display is not supported in the terminal – see https://github.com/stanfordnlp/dspy/issues/663
evaluate = Evaluate(devset=devset, metric=metric, num_threads=8, display_progress=True, display_table=False)

# Evaluate the unoptimized program's performance on the testset
print("******************* Unoptimized program *******************")
result = evaluate(FactInferrerProgram())
print(f"********* Unoptimized program's score: {result} *********")

# Evaluate the optimized program's performance on the testset
# print("******************* Optimized program *******************")
# program = FactInferrerProgram()
# program.load(path="optimized_program.json")
# result = evaluate(program)
# print(f"********* Optimized program's score: {result} *********")

