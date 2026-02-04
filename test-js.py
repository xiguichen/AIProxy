#!/usr/bin/env python3
"""
JavaScript test runner for AIProxy
Runs all Jest tests in js/src/tests/ directory
"""

import subprocess
import os
import sys

def check_node():
    """Check if Node.js is installed"""
    try:
        subprocess.run(['node', '--version'], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        return True
    except FileNotFoundError:
        print("❌ Node.js 未安装，请先安装 Node.js。")
        return False

def check_jest():
    """Check if Jest is installed"""
    try:
        subprocess.run(['npm', 'list', 'jest'], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=os.path.join(os.path.dirname(__file__), 'js'))
        return True
    except subprocess.CalledProcessError:
        return False

def install_dependencies():
    """Install npm dependencies if needed"""
    js_dir = os.path.join(os.path.dirname(__file__), 'js')
    package_json = os.path.join(js_dir, 'package.json')
    
    if not os.path.exists(package_json):
        print("⚠️ js/package.json 不存在，跳过依赖安装")
        return False
    
    print("📦 安装 JavaScript 依赖...")
    try:
        subprocess.run(['npm', 'install'], check=True, cwd=js_dir)
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ 依赖安装失败: {e}")
        return False

def run_jest_tests(test_file=None):
    """Run Jest tests"""
    js_dir = os.path.join(os.path.dirname(__file__), 'js')
    
    cmd = ['npm', 'test']
    
    if test_file:
        cmd.append(test_file)
    
    print(f"🧪 运行 JavaScript 测试...\n")
    try:
        result = subprocess.run(cmd, cwd=js_dir)
        return result.returncode == 0
    except subprocess.CalledProcessError as e:
        print(f"❌ 测试运行失败: {e}")
        return False

def run_tests(test_file=None):
    """Main test runner"""
    # Check Node.js
    if not check_node():
        sys.exit(1)
    
    # Check and install Jest if needed
    if not check_jest():
        print("⚠️ Jest 未安装")
        if not install_dependencies():
            print("❌ 无法安装依赖，请手动运行: cd js && npm install")
            sys.exit(1)
    
    # Run tests
    success = run_jest_tests(test_file)
    
    if success:
        print("\n✅ 所有测试通过！")
        sys.exit(0)
    else:
        print("\n❌ 测试失败！")
        sys.exit(1)

if __name__ == "__main__":
    test_file = None
    if len(sys.argv) > 1:
        test_file = sys.argv[1]
    
    run_tests(test_file)
