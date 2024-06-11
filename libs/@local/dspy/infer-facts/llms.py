import random
import dspy

def cache_busting_config():
    return dict(temperature=0.7 + 0.0001 * random.uniform(-1, 1))

# Load the language models to use

# We use GPT-4o as the evaluator and teacher
gpt4o = dspy.OpenAI(model='gpt-4o', max_tokens=4_000, **cache_busting_config())

# We use Haiku as the agent being optimized for the task
bedrock = dspy.Bedrock(region_name="us-east-1")
haiku = dspy.AWSAnthropic(bedrock, "anthropic.claude-3-haiku-20240307-v1:0", max_tokens=4_000, **cache_busting_config())
