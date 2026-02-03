import subprocess
import os
import sys

# 获取构建脚本路径
build_script_path = os.path.join(os.path.dirname(__file__), 'js', 'src', 'build.js')

# 检查 Node.js 是否安装
def check_node():
    try:
        subprocess.run(['node', '--version'], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except FileNotFoundError:
        print("❌ Node.js 未安装，请先安装 Node.js。")
        sys.exit(1)

# 执行构建脚本
def run_build():
    try:
        result = subprocess.run(['node', build_script_path], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        print(result.stdout)
        if result.stderr:
            print(f"⚠️ 构建警告: {result.stderr}")
        print("✅ 构建完成: main.js 已生成")
    except subprocess.CalledProcessError as e:
        print(f"❌ 构建失败: {e.stderr}")
        sys.exit(1)

if __name__ == "__main__":
    check_node()
    run_build()