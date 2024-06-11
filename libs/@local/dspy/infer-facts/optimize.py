import dspy
from dspy.teleprompt import BootstrapFewShotWithRandomSearch
import json

from definition import FactInferrerProgram
from metric import metric
from llms import gpt4o, haiku

# Configure the LLM we will be training
dspy.settings.configure(lm=haiku)

# Create the training set from the examples
with open("examples.json") as f:
    examples = json.load(f)
trainset = [dspy.Example(**item).with_inputs("context", "subject_entity") for item in examples]

# Set up the optimizer: we want to "bootstrap" (i.e., self-generate) 4-shot examples of the program's steps.
# The optimizer will repeat this 8 times (plus some initial attempts) before selecting its best attempt on the devset.
config = dict(max_bootstrapped_demos=4, max_labeled_demos=4, num_candidate_programs=8, num_threads=4, teacher_settings={ "lm": gpt4o })

# see https://dspy-docs.vercel.app/docs/building-blocks/optimizers#which-optimizer-should-i-use
optimizer = BootstrapFewShotWithRandomSearch(metric=metric, **config)
optimized_program = optimizer.compile(FactInferrerProgram(), trainset=trainset)

optimized_program.save("optimized_program.json")