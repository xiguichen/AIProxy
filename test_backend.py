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

SYSTEM_PROMPT = """You are a highly skilled software engineer with extensive knowledge in many programming languages, frameworks, design patterns, and best practices.

Respect and use existing conventions, libraries, etc that are already present in the code base.

Make sure code comments are in English when generating them.

Memory is crucial, you must follow the instructions in <memory>!

====

SYSTEM INFORMATION

- Platform: Windows_NT-10.0.26200-x86_64
- Shell: nil
- Language: nil
- Current date: 2026-02-06
- Project root: C:\\Users\\xigui\\develop\\AIProxy
- The user is operating inside a git repository

====

Don't directly search for code context in historical messages. Instead, prioritize using tools to obtain context first, then use context from historical messages as a secondary source, since context from historical messages is often not up to date.

====

TOOLS USAGE GUIDE

- You have access to tools, but only use them when necessary. If a tool is not required, respond as normal.
- Please DON'T be so aggressive in using tools, as many tasks can be better completed without tools.
- Files will be provided to you as context through <file> tag!
- You should make good use of the `thinking` tool, as it can help you better solve tasks, especially complex ones, before using the `view` tool each time, always repeatedly check whether the file is already in the <file> tag. If it is already there, do not use the `view` tool, just read the file content directly from the <file> tag.
- If you use the `view` tool when file content is already provided in the <file> tag, you will be fired!
- If the `rag_search` tool exists, prioritize using it to do the search!
- If the `rag_search` tool exists, only use tools like `glob` `view` `ls` etc when absolutely necessary!
- Keep the `query` parameter of `rag_search` tool as concise as possible! Try to keep it within five English words!
- If you encounter a URL, prioritize using the `fetch` tool to obtain its content.
"""

TEST_QUESTIONS = [
    "<task>What is 2+2?</task>",
    "<task>What is 3+3?</task>",
]

def ask_question(question, use_system_prompt=True):
    """发送测试问题到服务器"""
    messages = []
    
    if use_system_prompt:
        messages.append({"role": "system", "content": SYSTEM_PROMPT})
    
    messages.append({"role": "user", "content": question})
    
    data = {
        "model": "gpt-3.5-turbo",
        "messages": messages,
        "temperature": 0.7,
        "stream": False
    }

    try:
        response = requests.post(url, headers=headers, json=data, timeout=120)
        system_tag = "WITH SYSTEM" if use_system_prompt else "NO SYSTEM"
        print(f"\n[{system_tag}] Q: {question}", flush=True)
        print(f"Status: {response.status_code}", flush=True)

        if response.status_code == 200:
            result = response.json()
            content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
            print(f"A: {content.strip()[:100]}..." if len(content.strip()) > 100 else f"A: {content.strip()}", flush=True)
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

def test_scenario(questions, use_system_prompt, scenario_name):
    """测试指定场景"""
    print(f"\n{'='*60}")
    print(f"=== {scenario_name} ===")
    print(f"{'='*60}")
    print(f"Questions: {questions}")
    print(f"Use System Prompt: {use_system_prompt}\n")

    stats = requests.get("http://localhost:8000/stats").json()
    print(f"Connections: idle={stats['idle_connections']}/{stats['total_connections']}")

    success_count = 0
    for i, q in enumerate(questions, 1):
        print(f"\n--- Question {i}/{len(questions)} ---")
        if ask_question(q, use_system_prompt):
            success_count += 1

    print(f"\n=== Results ===")
    print(f"Success: {success_count}/{len(questions)}")

    stats = requests.get("http://localhost:8000/stats").json()
    print(f"Connections: idle={stats['idle_connections']}/{stats['total_connections']}")
    
    return success_count

print("=== AIProxy Backend Test ===\n")

# 测试场景1: 不带system角色
success1 = test_scenario(
    questions=TEST_QUESTIONS,
    use_system_prompt=False,
    scenario_name="Scenario 1: User Message Only (No System Prompt)"
)

# 测试场景2: 带system角色
success2 = test_scenario(
    questions=TEST_QUESTIONS,
    use_system_prompt=True,
    scenario_name="Scenario 2: System + User Messages"
)

# 汇总结果
print(f"\n{'='*60}")
print("=== Final Summary ===")
print(f"{'='*60}")
print(f"Scenario 1 (No System): {success1}/{len(TEST_QUESTIONS)} passed")
print(f"Scenario 2 (With System): {success2}/{len(TEST_QUESTIONS)} passed")
print(f"\nTotal: {(success1 + success2)}/{len(TEST_QUESTIONS) * 2} passed")
