#!/usr/bin/env python3
"""
Combine all source code and documentation for AIProxy project into a single output file.

This script provides convenient one-command functionality to combine:
- Python backend source files
- JavaScript frontend source files
- All markdown documentation files
- Configuration files
- Test files

Usage:
    # Combine everything (default)
    python combine_all.py --output all_files.txt

    # Combine only source code (no documentation)
    python combine_all.py --output source_code.txt --no-docs

    # Combine only documentation
    python combine_all.py --output all_docs.txt --no-sources

    # Combine with custom ordering
    python combine_all.py --output combined.txt --order docs,py,js,tests
"""

import argparse
import os
import sys
from pathlib import Path
from typing import List, Dict, Tuple


# Configuration for file categories
CATEGORY_CONFIG = {
    'docs': {
        'name': 'Documentation',
        'patterns': [
            'CLAUDE.md',
            'AGENTS.md',
            'TESTING.md',
        ],
        'priority': 1
    },
    'py': {
        'name': 'Python Backend',
        'patterns': [
            'backend/main.py',
            'backend/websocket_manager.py',
        ],
        'priority': 2
    },
    'js': {
        'name': 'JavaScript Frontend',
        'patterns': [
            'js/src/modules/*.js',
            'js/main.js',
        ],
        'priority': 3
    },
    'tests': {
        'name': 'Test Files',
        'patterns': [
        ],
        'priority': 4
    },
    'config': {
        'name': 'Configuration',
        'patterns': [
        ],
        'priority': 5
    }
}


def find_files_by_category(category: str, start_dir: str = ".") -> List[str]:
    """
    Find files matching patterns for a specific category.

    Args:
        category: Category name (docs, py, js, tests, config)
        start_dir: Starting directory for search

    Returns:
        List of matching file paths, sorted naturally
    """
    if category not in CATEGORY_CONFIG:
        print(f"⚠️  Unknown category: {category}")
        return []

    category_info = CATEGORY_CONFIG[category]
    files = []

    for pattern in category_info['patterns']:
        # Handle patterns with wildcards
        if '*' in pattern:
            # Find all files matching the pattern
            matches = Path(start_dir).glob(pattern)
            files.extend([str(m) for m in matches if m.is_file()])
        else:
            # Single file path
            file_path = Path(start_dir) / pattern
            if file_path.exists():
                files.append(str(file_path))

    # Remove excluded files
    if 'excludes' in category_info:
        files = [f for f in files if not any(Path(f).name == exclude for exclude in category_info['excludes'])]

    # Sort files naturally (directories first, then by name)
    files.sort(key=lambda x: (x.startswith('.'), x.lower()))

    return files


def find_all_docs(start_dir: str = ".") -> List[str]:
    """
    Find all markdown documentation files in the project.

    Args:
        start_dir: Starting directory for search

    Returns:
        List of markdown file paths
    """
    patterns = [
        '*.md',
        '.github/*.md',
        'js/*.md',
    ]

    files = []
    for pattern in patterns:
        matches = Path(start_dir).glob(pattern)
        files.extend([str(m) for m in matches if m.is_file()])

    files.sort(key=lambda x: (x.startswith('.'), x.lower()))
    return files


def find_all_py_sources(start_dir: str = ".") -> List[str]:
    """
    Find all Python source files.

    Args:
        start_dir: Starting directory for search

    Returns:
        List of Python file paths
    """
    patterns = [
        'backend/*.py',
        'test_backend.py',
        'test_avante_stream.py',
    ]

    files = []
    for pattern in patterns:
        matches = Path(start_dir).glob(pattern)
        files.extend([str(m) for m in matches if m.is_file()])

    files.sort(key=lambda x: (x.startswith('.'), x.lower()))
    return files


def find_all_js_sources(start_dir: str = ".") -> List[str]:
    """
    Find all JavaScript source files.

    Args:
        start_dir: Starting directory for search

    Returns:
        List of JavaScript file paths
    """
    patterns = [
        'js/src/**/*.js',
        'js/main.js',
        'js/build-main.py',
        'js/package.json',
        'js/eslint.config.js',
    ]

    files = []
    for pattern in patterns:
        matches = Path(start_dir).glob(pattern)
        files.extend([str(m) for m in matches if m.is_file()])

    files.sort(key=lambda x: (x.startswith('.'), x.lower()))
    return files


def format_header(title: str, subtitle: str = "", subtitle_emoji: str = "📁") -> str:
    """
    Format a header for the combined output.

    Args:
        title: Main title
        subtitle: Subtitle (optional)
        subtitle_emoji: Emoji for the subtitle

    Returns:
        Formatted header string
    """
    header = f"""
{'=' * 80}
{title.upper()}
{'=' * 80}"""

    if subtitle:
        header += f"\n{subtitle_emoji} {subtitle}\n"
        header += f"{'-' * 80}\n"

    header += f"\nGenerated at: {Path(start_path := Path.cwd()).absolute()}\n"
    header += f"Python version: {sys.version.split()[0]}\n\n"

    return header


def format_file_header(filepath: str, index: int, total_files: int, category: str) -> str:
    """
    Format a header for a file in the combined output.

    Args:
        filepath: Path to the file
        index: Current file index
        total_files: Total number of files being combined
        category: Category name (for display purposes)

    Returns:
        Formatted header string
    """
    clean_path = os.path.abspath(filepath)

    try:
        rel_path = os.path.relpath(filepath)
    except ValueError:
        rel_path = filepath

    # Map category to emoji
    category_emoji = {
        'docs': '📄',
        'py': '🐍',
        'js': '📜',
        'tests': '🧪',
        'config': '⚙️',
    }.get(category, '📄')

    header = f"""
{'=' * 80}
FILE {index}/{total_files}: {category_emoji} {category} - {rel_path}
{'=' * 80}
"""

    return header


def combine_categories(
    categories: List[str],
    output_path: str,
    start_dir: str = ".",
    quiet: bool = False
) -> None:
    """
    Combine files from specified categories into a single output file.

    Args:
        categories: List of category names to combine
        output_path: Path to output file
        start_dir: Starting directory for search
        quiet: Suppress verbose output
    """
    if not categories:
        print("⚠️  No categories specified")
        return

    # Filter valid categories
    valid_categories = [c for c in categories if c in CATEGORY_CONFIG]

    if not valid_categories:
        print("⚠️  No valid categories specified")
        return

    # Sort categories by priority and remove duplicates
    valid_categories = sorted(list(set(valid_categories)), key=lambda x: CATEGORY_CONFIG[x]['priority'])

    # Find all files from all categories
    all_files = []
    file_categories = []  # Track which category each file belongs to

    for category in valid_categories:
        files = find_files_by_category(category, start_dir)
        all_files.extend(files)
        file_categories.extend([category] * len(files))

        if not quiet:
            print(f"   📂 Found {len(files)} {category} file(s)")

    if not all_files:
        print("⚠️  No files found")
        return

    if not quiet:
        print(f"\n✅ Total files to combine: {len(all_files)}")

    # Create output directory if it doesn't exist
    output_dir = os.path.dirname(output_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir)
        if not quiet:
            print(f"📁 Created output directory: {output_dir}")

    # Write combined content
    with open(output_path, 'w', encoding='utf-8') as f:
        for index, filepath in enumerate(all_files, 1):
            try:
                # Add file header (only category and path)
                f.write(f"\n\n")
                f.write("=" * 80 + "\n")
                f.write(f"FILE {index}/{len(all_files)}: {filepath}\n")
                f.write("=" * 80 + "\n")

                # Add file content
                if is_text_file(filepath):
                    with open(filepath, 'r', encoding='utf-8') as content_file:
                        f.write(content_file.read())
                else:
                    f.write(f"# BINARY FILE: {filepath}\n")
                    f.write("# Skipping binary content...\n\n")

                # Add separator after each file (except the last)
                if index < len(all_files):
                    f.write("\n")
                    f.write("-" * 80 + "\n\n")

                if not quiet:
                    print(f"   ✅ Added: {filepath}")

            except Exception as e:
                print(f"   ❌ Error processing {filepath}: {e}")

    print(f"\n✅ Successfully combined {len(all_files)} file(s) into: {output_path}")
    print(f"📊 File size: {os.path.getsize(output_path) / 1024:.2f} KB")


def main():
    parser = argparse.ArgumentParser(
        description='Combine all source code and documentation for AIProxy',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Combine everything (default behavior)
  python combine_all.py --output combined.txt

  # Combine only documentation files
  python combine_all.py --output docs_only.txt --categories docs

  # Combine only Python and JavaScript source files
  python combine_all.py --output sources.txt --categories py --categories js

  # Combine documentation, Python, and JS with custom ordering
  python combine_all.py --output everything.txt --categories docs --categories py --categories js --categories tests

  # Combine only test files
  python combine_all.py --output tests.txt --categories tests

Available categories:
  docs   - Documentation files (*.md, including CLAUDE.md, AGENTS.md, etc.)
  py     - Python backend source files (backend/*.py, test_backend.py)
  js     - JavaScript frontend source files (js/src/**/*.js, js/main.js)
  tests  - Test files (test-js.py, js/src/**/*.test.js)
  config - Configuration files (*.json, *.txt, etc.)
        """
    )

    parser.add_argument(
        '--output',
        '-o',
        required=True,
        help='Output file path'
    )

    parser.add_argument(
        '--categories',
        '-c',
        action='append',
        help='Categories to combine (can be used multiple times, e.g., -c docs -c py)'
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

    # Get categories from default if not provided
    default_categories = ['docs', 'py', 'js', 'tests', 'config']
    categories = args.categories if args.categories is not None else default_categories

    combine_categories(
        categories,
        args.output,
        args.directory,
        args.quiet
    )


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
            sample = f.read(sample_size)
            text_chars = set(b'\x09\x0a\x0d\x20-\x7e')
            has_text = any(c in text_chars for c in sample[:100])
            return has_text
    except (IOError, OSError):
        return False


if __name__ == '__main__':
    main()
