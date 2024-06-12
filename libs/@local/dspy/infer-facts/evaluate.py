import dspy
from dspy.evaluate.evaluate import Evaluate
import json

from definition import FactInferrerProgram
from metric import metric
from llms import haiku

dspy.settings.configure(lm=haiku)

# Run the unoptimized program on a test case and print the answer
# This isn't needed for the evaluation, it's just a demonstration
with open("testset.json") as f:
    input_data = json.load(f)

unoptimized_program = FactInferrerProgram()
pred = unoptimized_program (**input_data[3])
print("Unoptimized answer:")
print(f"{pred}")

exit()

# Load the setset for evaluation
with open("testset.json") as f:
    tests = json.load(f)

testset = [dspy.Example(**item).with_inputs("context", "subject_entity") for item in tests]

# Create the evaluation function
# Table display is not supported in the terminal – see https://github.com/stanfordnlp/dspy/issues/663
evaluate = Evaluate(devset=testset, metric=metric, num_threads=4, display_progress=True, display_table=False)

# Evaluate the unoptimized program's performance on the testset
print("******************* Unoptimized program *******************")
result = evaluate(FactInferrerProgram())
print(f"********* Unoptimized program's score: {result} *********")

# Evaluate the optimized program's performance on the testset
print("******************* Optimized program *******************")
program = FactInferrerProgram()
program.load(path="optimized_program.json")
result = evaluate(program)
print(f"********* Optimized program's score: {result} *********")

