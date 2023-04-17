from langchain import OpenAI, LLMMathChain
from .io_types import *


def main(agent_input: Input) -> Output:
    llm = OpenAI(model_name="gpt-3.5-turbo", temperature=0)
    llm_math = LLMMathChain(llm=llm, verbose=True)
    result = llm_math.run(agent_input.expression)
    # ltrim "Answer: " from result
    return Output(result=float(result[8:]))


if __name__ == 'HASH':
    global IN, OUT
    OUT = main(IN)

if __name__ == '__main__':
    from .. import setup, get_logger
    setup()

    output = main(Input(expression="round(pi * 13.37)"))
    get_logger().info(f"output: {output.result}")
