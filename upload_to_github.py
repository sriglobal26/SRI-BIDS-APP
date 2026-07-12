#!/usr/bin/env python3
"""
Run this script to automatically upload server.js to GitHub.
Usage: python upload_to_github.py YOUR_GITHUB_TOKEN
"""
import sys
import json
import urllib.request
import base64
import os

TOKEN = sys.argv[1] if len(sys.argv) > 1 else input("Enter your GitHub token (ghp_...): ")
REPO = "sriglobal26/SRI-BIDS-APP"
FILE = "server.js"

# Read server.js from same folder as this script
script_dir = os.path.dirname(os.path.abspath(__file__))
server_path = os.path.join(script_dir, "server.js")

with open(server_path, "rb") as f:
    content = f.read()

# Verify it's real JS not chat text
if b"Claude finished" in content or b"Ctrl+A" in content.split(b"File")[0]:
    print("ERROR: server.js contains chat text, not code!")
    sys.exit(1)

if not content.startswith(b"if (typeof File"):
    print("ERROR: server.js does not start with expected code!")
    print("First line:", content[:80])
    sys.exit(1)

print("File verified OK:", len(content), "bytes")

# Get current file SHA (needed for update)
url = f"https://api.github.com/repos/{REPO}/contents/{FILE}"
req = urllib.request.Request(url, headers={
    "Authorization": f"token {TOKEN}",
    "Accept": "application/vnd.github.v3+json"
})
try:
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())
        sha = data["sha"]
        print("Current file SHA:", sha)
except Exception as e:
    print("Error getting SHA:", e)
    sha = None

# Upload new content
encoded = base64.b64encode(content).decode()
payload = json.dumps({
    "message": "Fix: Add EnviroBidNet auto-seed to server.js",
    "content": encoded,
    "sha": sha
}).encode()

req2 = urllib.request.Request(url, data=payload, method="PUT", headers={
    "Authorization": f"token {TOKEN}",
    "Accept": "application/vnd.github.v3+json",
    "Content-Type": "application/json"
})
try:
    with urllib.request.urlopen(req2) as resp:
        result = json.loads(resp.read())
        print("SUCCESS! File uploaded to GitHub!")
        print("Commit:", result.get("commit", {}).get("sha", "unknown"))
        print("Now wait 3 minutes for Railway to deploy.")
        print("Then go to: https://web-production-d1bd2.up.railway.app/api/seed-ebn")
except Exception as e:
    print("Upload error:", e)
