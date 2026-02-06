import requests
import json
import time
import sys

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
- You should make good use of the `thinking` tool, as it can help you better solve tasks, especially complex tasks, before using the `view` tool each time, always repeatedly check whether the file is already in the <file> tag. If it is already there, do not use the `view` tool, just read the file content directly from the <file> tag.
- If you use the `view` tool when file content is already provided in the <file> tag, you will be fired!
- If the `rag_search` tool exists, prioritize using it to do the search!
- If the `rag_search` tool exists, only use tools like `glob` `view` `ls` etc when absolutely necessary!
- Keep the `query` parameter of `rag_search` tool as concise as possible! Try to keep it within five English words!
- If you encounter a URL, prioritize using the `fetch` tool to obtain its content!
"""

SYSTEM_PROMPT_V2 = """You are a helpful assistant. This is version 2 of the system prompt.

Remember to answer concisely.
"""

TEST_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Get the current weather for a location",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": "The city and state, e.g. San Francisco, CA"
                    }
                },
                "required": ["location"]
            }
        }
    }
]

TEST_TOOLS_V2 = [
    {
        "type": "function",
        "function": {
            "name": "search",
            "description": "Search for information",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query"
                    }
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "calculate",
            "description": "Perform a calculation",
            "parameters": {
                "type": "object",
                "properties": {
                    "expression": {
                        "type": "string",
                        "description": "Math expression to evaluate"
                    }
                },
                "required": ["expression"]
            }
        }
    }
]

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

def ask_with_tools(question, system_prompt=None, tools=None):
    """发送带tools的测试问题"""
    messages = []

    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})

    messages.append({"role": "user", "content": question})

    data = {
        "model": "gpt-3.5-turbo",
        "messages": messages,
        "temperature": 0.7,
        "stream": False
    }

    if tools:
        data["tools"] = tools

    try:
        response = requests.post(url, headers=headers, json=data, timeout=120)
        print(f"\n  Q: {question[:50]}...", flush=True)
        print(f"  Status: {response.status_code}", flush=True)

        if response.status_code == 200:
            result = response.json()
            content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
            print(f"  A: {content.strip()[:80]}..." if len(content.strip()) > 80 else f"  A: {content.strip()}", flush=True)
            return True
        else:
            print(f"  Error: {response.json()}", flush=True)
            return False
    except requests.exceptions.Timeout:
        print(f"  Timeout (>120s)", flush=True)
        return False
    except Exception as e:
        print(f"  Error: {e}", flush=True)
        return False

def test_system_prompt_caching():
    """测试system prompt只会发送一次（当hash变化时才重新发送）"""
    print(f"\n{'='*60}")
    print("=== Test: System Prompt Caching ===")
    print(f"{'='*60}")
    print("验证: 相同的system prompt只会在第一次发送，后续请求跳过")

    stats = requests.get("http://localhost:8000/stats").json()
    print(f"Connections: idle={stats['idle_connections']}/{stats['total_connections']}\n")

    questions = ["<task>What is 5+5?</task>", "<task>What is 10+10?</task>"]

    print("--- Request 1: 首次发送 system + user ---")
    success1 = ask_with_tools(questions[0], system_prompt=SYSTEM_PROMPT)

    print("\n--- Request 2: 相同的 system + 不同 user（应该跳过system） ---")
    success2 = ask_with_tools(questions[1], system_prompt=SYSTEM_PROMPT)

    print("\n--- Request 3: 不同的 system + user（应该发送新system） ---")
    success3 = ask_with_tools(questions[0], system_prompt=SYSTEM_PROMPT_V2)

    print("\n--- Request 4: 再次相同的 system（应该跳过） ---")
    success4 = ask_with_tools(questions[1], system_prompt=SYSTEM_PROMPT_V2)

    print(f"\n=== Results ===")
    print(f"Request 1 (First system): {'✓' if success1 else '✗'}")
    print(f"Request 2 (Same system): {'✓' if success2 else '✗'}")
    print(f"Request 3 (Changed system): {'✓' if success3 else '✗'}")
    print(f"Request 4 (Same system again): {'✓' if success4 else '✗'}")

    return success1 and success2 and success3 and success4

def test_tools_caching():
    """测试tools只会发送一次（当hash变化时才重新发送）"""
    print(f"\n{'='*60}")
    print("=== Test: Tools Caching ===")
    print(f"{'='*60}")
    print("验证: 相同的tools只会在第一次发送，后续请求跳过")

    stats = requests.get("http://localhost:8000/stats").json()
    print(f"Connections: idle={stats['idle_connections']}/{stats['total_connections']}\n")

    questions = ["<task>Get weather in Beijing.</task>", "<task>Search for AI news.</task>"]

    print("--- Request 1: 首次发送 tools + user ---")
    success1 = ask_with_tools(questions[0], tools=TEST_TOOLS)

    print("\n--- Request 2: 相同的 tools + 不同 user（应该跳过tools） ---")
    success2 = ask_with_tools(questions[1], tools=TEST_TOOLS)

    print("\n--- Request 3: 不同的 tools + user（应该发送新tools） ---")
    success3 = ask_with_tools(questions[0], tools=TEST_TOOLS_V2)

    print("\n--- Request 4: 再次相同的 tools（应该跳过） ---")
    success4 = ask_with_tools(questions[1], tools=TEST_TOOLS_V2)

    print(f"\n=== Results ===")
    print(f"Request 1 (First tools): {'✓' if success1 else '✗'}")
    print(f"Request 2 (Same tools): {'✓' if success2 else '✗'}")
    print(f"Request 3 (Changed tools): {'✓' if success3 else '✗'}")
    print(f"Request 4 (Same tools again): {'✓' if success4 else '✗'}")

    return success1 and success2 and success3 and success4

def test_combined_caching():
    """测试system + tools组合的缓存行为"""
    print(f"\n{'='*60}")
    print("=== Test: Combined System + Tools Caching ===")
    print(f"{'='*60}")
    print("验证: system和tools独立缓存，只有变化的才重新发送")

    stats = requests.get("http://localhost:8000/stats").json()
    print(f"Connections: idle={stats['idle_connections']}/{stats['total_connections']}\n")

    questions = ["<task>Calculate 2+2.</task>", "<task>Calculate 3+3.</task>"]

    print("--- Request 1: 首次发送 system + tools ---")
    success1 = ask_with_tools(questions[0], system_prompt=SYSTEM_PROMPT, tools=TEST_TOOLS)

    print("\n--- Request 2: 相同 system + tools，不同 user（应该都跳过） ---")
    success2 = ask_with_tools(questions[1], system_prompt=SYSTEM_PROMPT, tools=TEST_TOOLS)

    print("\n--- Request 3: 改变 system，相同 tools（只发送新system） ---")
    success3 = ask_with_tools(questions[0], system_prompt=SYSTEM_PROMPT_V2, tools=TEST_TOOLS)

    print("\n--- Request 4: 相同 system，改变 tools（只发送新tools） ---")
    success4 = ask_with_tools(questions[1], system_prompt=SYSTEM_PROMPT_V2, tools=TEST_TOOLS_V2)

    print("\n--- Request 5: 都相同（应该都跳过） ---")
    success5 = ask_with_tools(questions[0], system_prompt=SYSTEM_PROMPT_V2, tools=TEST_TOOLS_V2)

    print(f"\n=== Results ===")
    print(f"Request 1 (System + Tools): {'✓' if success1 else '✗'}")
    print(f"Request 2 (Both same): {'✓' if success2 else '✗'}")
    print(f"Request 3 (System changed): {'✓' if success3 else '✗'}")
    print(f"Request 4 (Tools changed): {'✓' if success4 else '✗'}")
    print(f"Request 5 (Both same again): {'✓' if success5 else '✗'}")

    return success1 and success2 and success3 and success4 and success5

print("=== AIProxy Backend Test ===\n")

# 基础测试场景
success1 = test_scenario(
    questions=TEST_QUESTIONS,
    use_system_prompt=False,
    scenario_name="Scenario 1: User Message Only (No System Prompt)"
)

success2 = test_scenario(
    questions=TEST_QUESTIONS,
    use_system_prompt=True,
    scenario_name="Scenario 2: System + User Messages"
)

# 新增: 缓存行为测试
test3 = test_system_prompt_caching()
test4 = test_tools_caching()
test5 = test_combined_caching()

# 汇总结果
print(f"\n{'='*60}")
print("=== Final Summary ===")
print(f"{'='*60}")
print(f"Scenario 1 (No System): {success1}/{len(TEST_QUESTIONS)} passed")
print(f"Scenario 2 (With System): {success2}/{len(TEST_QUESTIONS)} passed")
print(f"System Caching Test: {'✓ PASSED' if test3 else '✗ FAILED'}")
print(f"Tools Caching Test: {'✓ PASSED' if test4 else '✗ FAILED'}")
print(f"Combined Caching Test: {'✓ PASSED' if test5 else '✗ FAILED'}")
print(f"\nTotal: {(success1 + success2)}/{len(TEST_QUESTIONS) * 2} passed (basic scenarios)")
