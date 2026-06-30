#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.12"
# dependencies = ["httpx"]
# ///
import httpx, os, sys, json

api_key = os.environ.get("OPENROUTER_API_KEY")
if not api_key:
    print("set OPENROUTER_API_KEY"); sys.exit(1)

resp = httpx.post(
    "https://openrouter.ai/api/v1/embeddings",
    json={"model": "openai/text-embedding-3-large", "input": ["hello world"], "encoding_format": "float"},
    headers={"Authorization": f"Bearer {api_key}"},
    timeout=30.0,
)
print(f"status: {resp.status_code}")
print(f"headers: {dict(resp.headers)}")
body = resp.text[:500]
print(f"body: {body}")

if resp.status_code == 200:
    data = resp.json()
    if "data" in data:
        print(f"embedding dims: {len(data['data'][0]['embedding'])}")
    else:
        print(f"unexpected response: {json.dumps(data, indent=2)[:500]}")
