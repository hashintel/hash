from langchain import PromptTemplate
from langchain.chains import RetrievalQA
from langchain.chat_models import ChatOpenAI
from langchain.embeddings.openai import OpenAIEmbeddings
from langchain.vectorstores import Qdrant
from qdrant_client import QdrantClient

from .io_types import *


def main(agent_input: Input, qdrant_host: str) -> Output:
    """
    Main function of the agent
    :param agent_input: Input defined in `io_types.ts`
    :return: Output defined in `io_types.ts`
    """

    qdrant_client = QdrantClient(host=qdrant_host, port=6333)

    embeddings = OpenAIEmbeddings(model="text-embedding-ada-002")
    qdrant = Qdrant(
        client=qdrant_client,
        collection_name="entities",
        content_payload_key="contents",
        embedding_function=embeddings.embed_query,
    )
    retriever = qdrant.as_retriever()
    prompt_template = """Use the following nodes of the user's Graph to answer/fulfil the inquiry at the end. If you don't know the answer, just say that you don't know, don't try to make up an answer. Do not reply with raw IDs that would be meaningless to users. Treat the context entities as information you know, and not information the user can/should see. Answer precisely and concisely.

Graph: ---
{context}
---

Inquiry: {question}
Helpful Answer:"""
    prompt = PromptTemplate(
        template=prompt_template, input_variables=["context", "question"]
    )
    llm = ChatOpenAI(model_name="gpt-3.5-turbo", temperature=0)
    retrieval_qa = RetrievalQA.from_llm(llm=llm, retriever=retriever, prompt=prompt)
    result = retrieval_qa.run(agent_input.query)
    return Output(answer=result)


if __name__ == "HASH":
    """This is used when running the agent from the server or the agent orchestrator"""

    # `IN` and `OUT` are defined by the agent orchestrator
    global IN, OUT
    OUT = main(IN, "hash-qdrant")

if __name__ == "__main__":
    """This is used when running the agent from the command line"""

    from ... import setup

    setup("dev")

    output = main(Input(query="Who is Lars?"), "localhost")
    print(f"output: {output.answer}")
