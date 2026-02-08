#!/usr/bin/env python3
"""
avante.nvim Stream Mode Test Script

This script simulates avante.nvim requests to test the AIProxy backend.
It supports both streaming and non-streaming modes and validates responses.

Usage:
    python test_avante_stream.py [--stream] [--model MODEL] [--task TASK]

Examples:
    python test_avante_stream.py                      # Non-streaming test
    python test_avante_stream.py --stream             # Streaming test
    python test_avante_stream.py --stream --task "Write hello world"  # Custom task
"""

import argparse
import json
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime
from typing import Generator, Optional

API_BASE = "http://localhost:8000"
DEFAULT_MODEL = "your-model-name"


class AvanteStreamTester:
    """Test client simulating avante.nvim requests."""

    def __init__(self, base_url: str = API_BASE):
        self.base_url = base_url

    def create_request(
        self,
        task: str,
        model: str = DEFAULT_MODEL,
        stream: bool = False,
        system_prompt: Optional[str] = None,
    ) -> dict:
        """Create a request body matching avante.nvim format."""
        messages = []

        if system_prompt:
            messages.append({
                "role": "system",
                "content": system_prompt,
                "tool_calls": None,
                "tool_call_id": None
            })

        messages.append({
            "role": "user",
            "content": f"<task>{task}</task>",
            "tool_calls": None,
            "tool_call_id": None
        })

        return {
            "model": model,
            "messages": messages,
            "temperature": 0.75,
            "max_tokens": None,
            "stream": stream,
            "top_p": 1.0,
            "frequency_penalty": 0.0,
            "presence_penalty": 0.0,
            "tools": [
                {
                    "type": "function",
                    "function": {
                        "name": "write_todos",
                        "description": "Write TODOs to the current task",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "todos": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "id": {"type": "string"},
                                            "content": {"type": "string"},
                                            "status": {"type": "string", "enum": ["todo", "doing", "done", "cancelled"]},
                                            "priority": {"type": "string", "enum": ["low", "medium", "high"]}
                                        },
                                        "required": ["id", "content", "status", "priority"]
                                    }
                                }
                            },
                            "required": ["todos"]
                        }
                    }
                },
                {
                    "type": "function",
                    "function": {
                        "name": "attempt_completion",
                        "description": "Present the result to the user",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "result": {"type": "string"},
                                "command": {"type": "string"}
                            },
                            "required": ["result"]
                        }
                    }
                }
            ],
            "tool_choice": None
        }

    def send_request(
        self,
        request_body: dict,
        stream: bool = False
    ) -> tuple[dict, Generator[str, None, None]]:
        """
        Send request and return response.
        For streaming, returns a generator of SSE events.
        """
        url = f"{self.base_url}/v1/chat/completions"
        headers = {
            "Content-Type": "application/json",
            "Accept": "text/event-stream" if stream else "application/json"
        }

        data = json.dumps(request_body).encode("utf-8")

        req = urllib.request.Request(url, data=data, headers=headers, method="POST")

        try:
            response = urllib.request.urlopen(req, timeout=120)
        except urllib.error.HTTPError as e:
            error_body = e.read().decode("utf-8")
            print(f"\n[X] HTTP Error {e.code}: {e.reason}")
            print(f"Response: {error_body}")
            try:
                error_data = json.loads(error_body)
                return error_data, None
            except:
                return {"error": str(e)}, None
        except urllib.error.URLError as e:
            print(f"\n[X] Connection Error: {e.reason}")
            print("Make sure the backend server is running: python backend/main.py")
            sys.exit(1)

        if stream:
            # Don't read all at once, let it stream
            return self._parse_stream(response), None
        else:
            response_body = json.loads(response.read().decode("utf-8"))
            return response_body, None

    def _parse_stream(self, response) -> Generator[str, None, None]:
        """Parse SSE stream and yield events."""
        buffer = ""
        for line in response:
            # line is already bytes from generator
            if isinstance(line, int):
                # When iterating bytes, we get integers
                line = bytes([line])
            line = line.decode("utf-8")
            buffer += line

            # SSE events are separated by blank lines (\n\n)
            if line == "\n" or line == "\r\n":
                if buffer.startswith("data: "):
                    data = buffer[6:].strip()
                    if data == "[DONE]":
                        yield "stream_complete"
                    elif data:
                        try:
                            chunk = json.loads(data)
                            yield json.dumps(chunk)
                        except json.JSONDecodeError:
                            yield f"parse_error: {data}"
                buffer = ""

        # Handle any remaining data in buffer (in case response doesn't end with blank line)
        if buffer.startswith("data: "):
            data = buffer[6:].strip()
            if data == "[DONE]":
                yield "stream_complete"
            elif data:
                try:
                    chunk = json.loads(data)
                    yield json.dumps(chunk)
                except json.JSONDecodeError:
                    yield f"parse_error: {data}"

    def print_response(self, response: dict, stream: bool = False):
        """Print response in a formatted way."""
        print("\n" + "=" * 60)
        print("RESPONSE")
        print("=" * 60)

        if "error" in response:
            print(f"[X] Error: {response['error']}")
            return

        if not response:
            print("Empty response")
            return

        model = response.get("model", "unknown")
        created = response.get("created", 0)
        choices = response.get("choices", [])

        print(f"Model: {model}")
        print(f"Created: {created} ({datetime.fromtimestamp(created).isoformat()})")
        print(f"Choices count: {len(choices)}")

        for i, choice in enumerate(choices):
            print(f"\n--- Choice {i} ---")
            message = choice.get("message", {})
            role = message.get("role", "unknown")
            content = message.get("content", "")
            tool_calls = message.get("tool_calls")
            finish_reason = choice.get("finish_reason", "unknown")

            print(f"Role: {role}")
            print(f"Finish Reason: {finish_reason}")
            print(f"Content: {content[:200]}{'...' if len(content) > 200 else ''}")

            if tool_calls:
                print(f"\nTool Calls ({len(tool_calls)}):")
                for j, tc in enumerate(tool_calls):
                    print(f"  [{j}] {tc.get('id')}: {tc.get('type')}")
                    func = tc.get("function", {})
                    print(f"      Function: {func.get('name')}")
                    print(f"      Arguments: {json.dumps(func.get('arguments', {}), indent=6)}")

        usage = response.get("usage", {})
        if usage:
            print(f"\n--- Usage ---")
            print(f"Prompt Tokens: {usage.get('prompt_tokens', 'N/A')}")
            print(f"Completion Tokens: {usage.get('completion_tokens', 'N/A')}")
            print(f"Total Tokens: {usage.get('total_tokens', 'N/A')}")

    def print_stream_events(self, events: Generator[str, None, None]):
        """Print streaming events in real-time."""
        print("\n" + "=" * 60)
        print("STREAMING RESPONSE")
        print("=" * 60)

        chunk_count = 0
        content_parts = []
        role_received = False
        finish_reason = None
        tool_calls = None

        for event in events:
            if event == "stream_complete":
                print(f"\n[OK] Stream completed. Total chunks: {chunk_count}")
                break

            if event.startswith("parse_error:"):
                print(f"[!] Parse error: {event[12:]}")
                continue

            try:
                chunk = json.loads(event)
            except json.JSONDecodeError:
                print(f"[!] Failed to parse chunk: {event[:100]}")
                continue

            chunk_count += 1
            choices = chunk.get("choices", [])

            for choice in choices:
                delta = choice.get("delta", {})

                if "role" in delta and not role_received:
                    role_received = True
                    print(f"[USER] Role: {delta['role']}")

                if "content" in delta:
                    content = delta.get("content", "")
                    content_parts.append(content)
                    sys.stdout.write(content)
                    sys.stdout.flush()

                if "tool_calls" in delta:
                    tool_calls = delta["tool_calls"]
                    tc_names = [tc.get("function", {}).get("name") for tc in tool_calls]
                    print(f"\n[TOOL] Tool calls received: {tc_names}")

                if choice.get("finish_reason"):
                    finish_reason = choice.get("finish_reason")
                    print(f"\n[END] Finish reason: {finish_reason}")

        print("\n")

        return {
            "content": "".join(content_parts),
            "finish_reason": finish_reason,
            "tool_calls": tool_calls,
            "chunk_count": chunk_count
        }


def test_basic_request(tester: AvanteStreamTester):
    """Test basic non-streaming request."""
    print("\n" + "=" * 60)
    print("TEST: Basic Non-Streaming Request")
    print("=" * 60)

    request = tester.create_request(
        task="Write a python script to get current timezone.",
        stream=False
    )

    print(f"\n[SEND] Sending request to {API_BASE}/v1/chat/completions")
    print(f"Model: {request['model']}")
    print(f"Messages: {len(request['messages'])}")
    print(f"Stream: {request['stream']}")
    print(f"Tools: {len(request.get('tools', []))}")

    response, _ = tester.send_request(request, stream=False)
    tester.print_response(response, stream=False)

    return response


def test_streaming_request(tester: AvanteStreamTester):
    """Test streaming request."""
    print("\n" + "=" * 60)
    print("TEST: Streaming Request")
    print("=" * 60)

    request = tester.create_request(
        task="Write a python script to get current timezone.",
        stream=True
    )

    print(f"\n[SEND] Sending streaming request to {API_BASE}/v1/chat/completions")
    print(f"Model: {request['model']}")
    print(f"Messages: {len(request['messages'])}")
    print(f"Stream: {request['stream']}")
    print(f"Tools: {len(request.get('tools', []))}")

    response, events = tester.send_request(request, stream=True)

    if response and "error" in response:
        print(f"[X] Connection error during stream: {response['error']}")
        return response

    if events is None:
        print("[X] Events is None, cannot process stream")
        return response

    result = tester.print_stream_events(events)

    print("\n" + "=" * 60)
    print("STREAM SUMMARY")
    print("=" * 60)
    print(f"Total chunks: {result['chunk_count']}")
    print(f"Content length: {len(result['content'])} characters")
    print(f"Finish reason: {result['finish_reason']}")
    if result['tool_calls']:
        print(f"Tool calls: {len(result['tool_calls'])}")

    return result


def test_tool_calls(tester: AvanteStreamTester):
    """Test that tool calls are properly handled."""
    print("\n" + "=" * 60)
    print("TEST: Tool Calls Handling")
    print("=" * 60)

    request = tester.create_request(
        task="Create a todo list for building a web app.",
        stream=False,
        system_prompt="You are a helpful assistant that creates todo lists."
    )

    print(f"\n[SEND] Sending request with task requiring tool usage")

    response, _ = tester.send_request(request, stream=False)
    tester.print_response(response, stream=False)

    if "choices" in response:
        choice = response["choices"][0]
        message = choice.get("message", {})
        tool_calls = message.get("tool_calls", [])
        finish_reason = choice.get("finish_reason")

        if tool_calls:
            print("\n[OK] Tool calls correctly included in response")
            return True
        elif finish_reason == "tool_calls":
            print("\n[!] Finish reason is 'tool_calls' but no tool_calls in message")
            return False
        else:
            print("\n[i] No tool calls in response (may be expected)")
            return True

    return False


def test_health_check(tester: AvanteStreamTester):
    """Test health endpoint."""
    print("\n" + "=" * 60)
    print("TEST: Health Check")
    print("=" * 60)

    try:
        req = urllib.request.Request(f"{API_BASE}/health")
        with urllib.request.urlopen(req, timeout=5) as response:
            health = json.loads(response.read().decode("utf-8"))
            print(f"\n[OK] Health Status: {health.get('status', 'unknown')}")
            print(f"Active Connections: {health.get('active_connections', 0)}")
            print(f"Idle Connections: {health.get('idle_connections', 0)}")
            return True
    except Exception as e:
        print(f"\n[X] Health check failed: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(
        description="Test AIProxy backend with avante.nvim-like requests"
    )
    parser.add_argument(
        "--stream", "-s",
        action="store_true",
        help="Use streaming mode"
    )
    parser.add_argument(
        "--model", "-m",
        type=str,
        default=DEFAULT_MODEL,
        help=f"Model name (default: {DEFAULT_MODEL})"
    )
    parser.add_argument(
        "--task", "-t",
        type=str,
        default="Write a python script to get current timezone.",
        help="Task to send"
    )
    parser.add_argument(
        "--health", "-H",
        action="store_true",
        help="Run health check only"
    )
    parser.add_argument(
        "--all", "-a",
        action="store_true",
        help="Run all tests"
    )

    args = parser.parse_args()

    print("\n" + "=" * 60)
    print("AIProxy Stream Test Client")
    print("=" * 60)
    print(f"API Base: {API_BASE}")
    print(f"Time: {datetime.now().isoformat()}")

    tester = AvanteStreamTester(API_BASE)

    if args.health:
        test_health_check(tester)
        return

    if args.all:
        tests = [
            ("Health Check", test_health_check),
            ("Basic Request", test_basic_request),
            ("Streaming Request", test_streaming_request),
            ("Tool Calls", test_tool_calls),
        ]

        results = []
        for name, test_func in tests:
            try:
                result = test_func(tester)
                results.append((name, "PASS" if result else "FAIL"))
            except Exception as e:
                print(f"\n[X] Test '{name}' error: {e}")
                results.append((name, "ERROR"))

        print("\n" + "=" * 60)
        print("TEST SUMMARY")
        print("=" * 60)
        for name, status in results:
            print(f"{status}: {name}")

        passed = sum(1 for _, s in results if s == "PASS")
        print(f"\nTotal: {passed}/{len(results)} tests passed")

    elif args.stream:
        test_streaming_request(tester)
    else:
        test_basic_request(tester)


if __name__ == "__main__":
    main()
