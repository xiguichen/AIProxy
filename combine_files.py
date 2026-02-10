#!/usr/bin/env python3
"""
Combine multiple files into a single output file.

Usage:
    python combine_files.py --pattern "*.cpp" --output combined.cpp
    python combine_files.py --pattern "**/*.py" --output python_files.txt
    python combine_files.py --pattern "*.md" --output all_markdown.md
"""

import argparse
import glob
import os
from pathlib import Path
from typing import List


def find_files(pattern: str, start_dir: str = ".") -> List[str]:
    """
    Find files matching the given pattern.

    Args:
        pattern: Glob pattern (e.g., "*.cpp", "**/*.py")
        start_dir: Starting directory (default: current directory)

    Returns:
        List of matching file paths
    """
    # Convert pattern to use Path's glob
    start_path = Path(start_dir).resolve()

    # Handle recursive patterns
    if "**" in pattern:
        # Split on ** and handle directory separators
        parts = pattern.split("**")
        dir_part = parts[0].rstrip(os.sep) if parts[0] else ""
        file_pattern = parts[1].lstrip(os.sep) if len(parts) > 1 else "*"

        # Find all directories that match the prefix
        dir_matches = []
        if dir_part:
            # Pattern might be like "config/" or just part of path
            if dir_part.endswith(os.sep):
                dir_part = dir_part[:-1]

            # Use glob to find directories matching the prefix
            if dir_part:
                # Match directories like "config/" or "config/*"
                dir_pattern = dir_part + os.sep + "*"
                found_dirs = list(start_path.glob(dir_pattern))
                if not found_dirs:
                    return []
                dir_matches = [d for d in found_dirs if d.is_dir()]
            else:
                # No directory prefix, search all subdirectories
                dir_matches = [d for d in start_path.rglob("*") if d.is_dir()]
        else:
            # No directory prefix, search all directories
            dir_matches = [d for d in start_path.rglob("*") if d.is_dir()]

        # Recursively search all matching directories
        file_matches = []
        for dir_path in dir_matches:
            # Use glob with the file pattern
            # Ensure pattern starts with . or is just *
            if file_pattern == "*" or (file_pattern.startswith(".") and len(file_pattern) > 1):
                matches = list(dir_path.glob(file_pattern))
            else:
                # File pattern without leading dot - add * at the beginning
                matches = list(dir_path.glob("*" + file_pattern))
            file_matches.extend(matches)

        return [str(m) for m in file_matches]

    # Non-recursive pattern
    matches = list(start_path.glob(pattern))
    return [str(m) for m in matches]


def format_file_header(filepath: str, index: int, total_files: int) -> str:
    """
    Format a header for a file in the combined output.

    Args:
        filepath: Path to the file
        index: Current file index
        total_files: Total number of files being combined

    Returns:
        Formatted header string
    """
    # Clean up the path
    clean_path = os.path.abspath(filepath)

    # Get relative path from start directory
    try:
        rel_path = os.path.relpath(filepath)
    except ValueError:
        rel_path = filepath

    header = f"""
{'=' * 80}
FILE {index}/{total_files}: {rel_path}
{'=' * 80}
"""

    # Add encoding hint if it's a text file
    if is_text_file(filepath):
        header += f"# Encoding: UTF-8 (Please verify if needed)\n\n"

    return header


def is_text_file(filepath: str, sample_size: int = 1024) -> bool:
    """
    Check if a file appears to be a text file.

    Args:
        filepath: Path to the file
        sample_size: Number of bytes to read for detection

    Returns:
        True if file appears to be text
    """
    try:
        with open(filepath, 'rb') as f:
            # Read a sample of bytes
            sample = f.read(sample_size)
            # Check if sample contains mostly printable ASCII characters
            text_chars = set(b'\x09\x0a\x0d\x20-\x7e')
            has_text = any(c in text_chars for c in sample[:100])
            return has_text
    except (IOError, OSError):
        return False


def combine_files(pattern: str, output_path: str, start_dir: str = ".") -> None:
    """
    Combine all matching files into a single output file.

    Args:
        pattern: Glob pattern to match files
        output_path: Path to output file
        start_dir: Starting directory for search (default: current directory)
    """
    print(f"🔍 Searching for files matching pattern: {pattern}")
    print(f"📂 Starting directory: {start_dir}")

    files = find_files(pattern, start_dir)

    if not files:
        print(f"⚠️  No files found matching pattern: {pattern}")
        return

    print(f"✅ Found {len(files)} file(s):")
    for i, f in enumerate(files, 1):
        print(f"   {i}. {f}")

    # Create output directory if it doesn't exist
    output_dir = os.path.dirname(output_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir)
        print(f"📁 Created output directory: {output_dir}")

    # Write combined content
    with open(output_path, 'w', encoding='utf-8') as f:
        for index, filepath in enumerate(files, 1):
            try:
                # Add file header
                f.write(format_file_header(filepath, index, len(files)))

                # Add file content
                if is_text_file(filepath):
                    # Text file
                    with open(filepath, 'r', encoding='utf-8') as content_file:
                        f.write(content_file.read())
                else:
                    # Binary file - mark as such
                    f.write(f"# BINARY FILE: {filepath}\n")
                    f.write("# Skipping binary content...\n")
                    f.write("# Use original file for binary content.\n\n")

                # Add separator after each file (except the last)
                if index < len(files):
                    f.write("\n")
                    f.write("-" * 80 + "\n\n")

                print(f"   ✅ Added: {filepath}")

            except Exception as e:
                print(f"   ❌ Error processing {filepath}: {e}")

    print(f"\n✅ Successfully combined {len(files)} file(s) into: {output_path}")
    print(f"📊 File size: {os.path.getsize(output_path) / 1024:.2f} KB")


def main():
    parser = argparse.ArgumentParser(
        description='Combine multiple files into a single output file',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --pattern "*.cpp" --output combined.cpp
  %(prog)s --pattern "**/*.py" --output all_python.py
  %(prog)s --pattern "*.md" --output all_markdown.md
  %(prog)s --pattern "*.json" --output config.json --directory ./config
        """
    )

    parser.add_argument(
        '--pattern',
        '-p',
        required=True,
        help='Glob pattern for matching files (e.g., "*.cpp", "**/*.py")'
    )

    parser.add_argument(
        '--output',
        '-o',
        required=True,
        help='Output file path'
    )

    parser.add_argument(
        '--directory',
        '-d',
        default='.',
        help='Starting directory for search (default: current directory)'
    )

    parser.add_argument(
        '--quiet',
        '-q',
        action='store_true',
        help='Suppress verbose output'
    )

    args = parser.parse_args()

    combine_files(args.pattern, args.output, args.directory)


if __name__ == '__main__':
    main()
