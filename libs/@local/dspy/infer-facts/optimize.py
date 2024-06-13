import dspy
from dspy.teleprompt import BootstrapFewShotWithRandomSearch, COPRO
import json

from definition import FactInferrerProgram
from metric import metric
from llms import gpt4o, haiku

# Configure the LLM we will be training
dspy.settings.configure(lm=haiku)

# Create the training set from the examples
with open("trainset.json") as f:
    examples = json.load(f)
trainset = [dspy.Example(**item).with_inputs("context", "subject_entity", "potential_object_entities") for item in examples]

# Set up the prompt optimizer
optimizer_config = dict(prompt_model=gpt4o, task_model=haiku, metric=metric, breadth=6, depth=3, init_temperature=1.2, track_stats=True)
copro_optimizer = COPRO(**optimizer_config)

eval_config = dict(num_threads=4, display_progress=True, display_table=0)
copro_optimized_signature = copro_optimizer.compile(FactInferrerProgram(), trainset=trainset, eval_kwargs=eval_config)

copro_optimized_signature.save("optimized_program-prompt.json")

# Set up the bootstrap optimizer: we want to "bootstrap" (i.e., self-generate) 4-shot examples of the program's steps.
# The optimizer will repeat this 8 times (plus some initial attempts) before selecting its best attempt on the devset.
# config = dict(max_bootstrapped_demos=4, max_labeled_demos=4, num_candidate_programs=8, num_threads=4, teacher_settings={ "lm": gpt4o })

# # see https://dspy-docs.vercel.app/docs/building-blocks/optimizers#which-optimizer-should-i-use
# optimizer = BootstrapFewShotWithRandomSearch(metric=metric, **config)
# optimized_program = optimizer.compile(FactInferrerProgram(), trainset=trainset)

# optimized_program.save("optimized_program.json")