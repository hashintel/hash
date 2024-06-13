import dspy
from dspy.teleprompt import BootstrapFewShotWithRandomSearch, COPRO
import json

from definition import EntityRecognizerProgram
from metric import metric
from llms import gpt4o, haiku

# Configure the LLM we will be training
dspy.settings.configure(lm=haiku)

# Create the training set from the examples
with open("trainset.json") as f:
    examples = json.load(f)
trainset = [dspy.Example(**item).with_inputs("context", "entity_type", "relevant_entities_description") for item in examples]

# Set up the optimizer: to optimize the prompt
optimizer_config = dict(prompt_model=gpt4o, task_model=haiku, metric=metric, breadth=10, depth=3, init_temperature=1.2, track_stats=True)
copro_optimizer = COPRO(**optimizer_config)

eval_config = dict(num_threads=4, display_progress=True, display_table=0)
copro_optimized_signature = copro_optimizer.compile(EntityRecognizerProgram(), trainset=trainset, eval_kwargs=eval_config)

copro_optimized_signature.save("optimized_program-prompt.json")

# Set up the bootstrap optimizer: we want to "bootstrap" (i.e., self-generate) 4-shot examples of the program's steps.
# The optimizer will repeat this 8 times (plus some initial attempts) before selecting its best attempt on the devset.
config = dict(max_bootstrapped_demos=2, max_labeled_demos=2, num_candidate_programs=4, num_threads=6, max_rounds=1, teacher_settings={ "lm": gpt4o })

# see https://dspy-docs.vercel.app/docs/building-blocks/optimizers#which-optimizer-should-i-use
bootstrap_optimizer = BootstrapFewShotWithRandomSearch(metric=metric, **config)
bootstrap_optimized_program = bootstrap_optimizer.compile(student=EntityRecognizerProgram(), trainset=trainset)

bootstrap_optimized_program.save("optimized_program-bootstrapped.json")

print("Finished bootstrapping")

