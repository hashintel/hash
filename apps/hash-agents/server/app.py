from flask import Flask, request
from ..agents import call_agent

app = Flask(__name__)


@app.route("/agents/<string:agent_name>", methods=["POST"])
def agent(agent_name):
    return call_agent(agent_name, **request.json)
