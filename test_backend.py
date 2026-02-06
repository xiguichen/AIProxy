import requests
import json
import time
import sys

# 设置输出编码
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

url = "http://localhost:8000/v1/chat/completions"

headers = {
    "Content-Type": "application/json"
}

questions = [
    "<task>1 + 1 = ?</task>",
    "<task>2 + 2 = ?</task>",
    "<task>3 + 3 = ?</task>"
]

def ask_question(question):
    data = {
        "model": "gpt-3.5-turbo",
        "messages": [
            {"role": "user", "content": question}
        ],
        "temperature": 0.7,
        "stream": False
    }

    try:
        response = requests.post(url, headers=headers, json=data, timeout=120)
        print(f"\nQ: {question}", flush=True)
        print(f"Status: {response.status_code}", flush=True)

        if response.status_code == 200:
            result = response.json()
            content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
            print(f"A: {content.strip()}", flush=True)
            return True
        else:
            print(f"Error: {response.json()}", flush=True)
            return False

    except requests.exceptions.Timeout:
        print(f"Timeout (>120s)", flush=True)
        return False
    except Exception as e:
        print(f"Error: {e}", flush=True)
        return False

print("=== Multi-Question Test ===")
print(f"Questions: {questions}\n")

stats = requests.get("http://localhost:8000/stats").json()
print(f"Connections before test: idle={stats['idle_connections']}/{stats['total_connections']}")

success_count = 0
for i, q in enumerate(questions, 1):
    print(f"\n--- Question {i}/{len(questions)} ---")
    if ask_question(q):
        success_count += 1

print(f"\n=== Results ===")
print(f"Success: {success_count}/{len(questions)}")

stats = requests.get("http://localhost:8000/stats").json()
print(f"Connections after test: idle={stats['idle_connections']}/{stats['total_connections']}")
