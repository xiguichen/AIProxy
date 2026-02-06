import subprocess
import os
import sys
import io

# Get build script path
build_script_path = os.path.join(os.path.dirname(__file__), 'js', 'src', 'build.js')

# Check Node.js installation
def check_node():
    try:
        subprocess.run(['node', '--version'], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except FileNotFoundError:
        sys.stdout.write("Node.js not installed. Please install Node.js first.\n")
        sys.exit(1)

# Run build script
def run_build():
    try:
        result = subprocess.run(['node', build_script_path], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        # Use io.open with utf-8 encoding
        with io.open(sys.stdout.fileno(), 'w', encoding='utf-8', closefd=False) as f:
            try:
                f.write(result.stdout.decode('utf-8'))
            except (UnicodeDecodeError, UnicodeEncodeError):
                f.write(result.stdout.decode('gbk', errors='replace'))
            if result.stderr:
                try:
                    f.write(result.stderr.decode('utf-8'))
                except (UnicodeDecodeError, UnicodeEncodeError):
                    f.write(result.stderr.decode('gbk', errors='replace'))
            f.write("main.js has been generated\n")
    except subprocess.CalledProcessError as e:
        sys.stdout.write("Build failed\n")
        sys.exit(1)

if __name__ == "__main__":
    check_node()
    run_build()
