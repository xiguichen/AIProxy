# Combine All Files Script

A Python script that provides one-command functionality to combine all source code and documentation for the AIProxy project.

## Overview

The `combine_all.py` script enhances the original `combine_files.py` by providing organized categories for different types of files, making it easy to generate comprehensive documentation bundles in a single command.

## Features

- **Category-based organization**: Predefined categories for documentation, Python sources, JavaScript sources, tests, and configuration files
- **Customizable selection**: Choose which categories to include
- **Priority ordering**: Files automatically ordered by category priority
- **Automatic file discovery**: Smart glob patterns to find all matching files
- **Verbose progress tracking**: See exactly which files are being combined
- **File headers**: Each file includes its category and path information

## Categories

| Category | Description | Files Included |
|----------|-------------|----------------|
| `docs` | Documentation files | `CLAUDE.md`, `AGENTS.md`, `TESTING.md`, `copilot-instructions.md`, `tasks/*.md`, `js/*.md` |
| `py` | Python backend sources | `backend/main.py`, `backend/websocket_manager.py`, `test_backend.py`, `test_avante_stream.py` |
| `js` | JavaScript frontend sources | `js/src/**/*.js`, `js/main.js`, `js/build-main.py`, `js/package.json`, `js/eslint.config.js` |
| `tests` | Test files | `test-js.py`, `js/src/**/*.test.js` |
| `config` | Configuration files | All `.json`, `.txt`, `.toml`, `.yaml`, `.yml`, `.ini`, `.cfg` files |

## Usage

### Basic Usage

Combine everything (default behavior):

```bash
python combine_all.py --output combined.txt
```

### Common Commands

Combine only documentation files:

```bash
python combine_all.py --output docs_only.txt --categories docs
```

Combine only source code (Python and JavaScript):

```bash
python combine_all.py --output sources.txt --categories py --categories js
```

Combine documentation, Python, and JavaScript:

```bash
python combine_all.py --output everything.txt --categories docs --categories py --categories js
```

Combine only test files:

```bash
python combine_all.py --output tests.txt --categories tests
```

Combine documentation, Python, JavaScript, and tests:

```bash
python combine_all.py --output full_project.txt --categories docs --categories py --categories js --categories tests
```

### Advanced Usage

Custom starting directory:

```bash
python combine_all.py --output ../backup/all_files.txt --directory ..
```

Suppress verbose output:

```bash
python combine_all.py --output combined.txt --quiet
```

## Output Format

The combined output file follows this structure:

```
================================================================================
AIProxy - Complete Source Code & Documentation
================================================================================
📁 Combined 5 category(ies)

Generated at: /path/to/AIProxy
Python version: 3.x.x


================================================================================
Category 1/5: DOCUMENTATION
--------------------------------------------------------------------------------
📄 5 files


================================================================================
FILE 1/5: 📄 docs - CLAUDE.md
================================================================================
# Content of CLAUDE.md...


================================================================================
FILE 2/5: 📄 docs - AGENTS.md
================================================================================
# Content of AGENTS.md...


================================================================================
FILE 3/5: 📄 docs - TESTING.md
================================================================================
# Content of TESTING.md...


================================================================================
FILE 4/5: 📄 docs - .github/copilot-instructions.md
================================================================================
# Content of copilot-instructions.md...


================================================================================
FILE 5/5: 📄 docs - tasks/js_system_role_support.md
================================================================================
# Content of js_system_role_support.md...


================================================================================
Category 2/5: PYTHON BACKEND
--------------------------------------------------------------------------------
🐍 4 files


================================================================================
FILE 1/9: 🐍 py - backend/main.py
================================================================================
# Content of backend/main.py...


================================================================================
FILE 2/9: 🐍 py - backend/websocket_manager.py
================================================================================
# Content of backend/websocket_manager.py...


... and so on for all files
```

## Comparison with combine_files.py

| Feature | combine_files.py | combine_all.py |
|---------|------------------|----------------|
| Single file patterns | ✅ | ✅ |
| Multiple categories | Manual repetition | Built-in categories |
| Category ordering | Manual | Automatic priority-based |
| Output organization | File headers only | Category sections + file headers |
| Easy one-command use | ❌ | ✅ |
| Progress tracking | ✅ | ✅ |
| Customization | High | High (via categories) |

## File Detection

The script uses intelligent text detection:
- Reads first 1024 bytes to determine if file is text
- Handles UTF-8 encoding automatically
- For binary files, includes a marker and skips content

## Error Handling

- Invalid categories: Prints warning and continues with valid ones
- Missing files: Skips with error message
- Permission errors: Catches and reports exceptions
- Empty output directories: Creates automatically

## Benefits

1. **Rapid documentation**: Generate complete project documentation in seconds
2. **Backup**: Create single-file backups of your project
3. **Code review**: Share entire codebase in one file for review
4. **Learning**: Explore project structure without navigating directories
5. **Consistency**: Ensures all relevant files are included in the same order

## Troubleshooting

### "No files found"

- Check that you're running the script from the correct directory
- Verify your category selections are correct
- Use `--categories docs` first to see which files are found

### "Unknown category"

Available categories: `docs`, `py`, `js`, `tests`, `config`

### Permission errors

- Ensure you have read permissions for all target files
- Check output directory write permissions

### Encoding issues

The script defaults to UTF-8 encoding. If you encounter encoding issues:
- Manually edit the script to use a different encoding
- Use `--quiet` to reduce output that might contain non-UTF-8 characters

## Examples

### Example 1: Generate Complete Documentation Bundle

```bash
python combine_all.py --output AIProxy_Documentation.txt
```

This creates a comprehensive file containing:
- All documentation files
- All backend Python code
- All frontend JavaScript code
- All test files
- Configuration files

### Example 2: Quick Code Review Copy

```bash
python combine_all.py --output review.txt --categories py --categories js
```

This creates a file with only source code, useful for:
- Quick code reviews
- Comparing code across versions
- Sharing with team members
- Archiving source code separately

### Example 3: Documentation-Only Backup

```bash
python combine_all.py --output docs_backup.txt --categories docs
```

This creates a documentation-only backup, useful for:
- Creating separate documentation repositories
- Sharing technical documentation
- Maintaining documentation independently of code

## Future Enhancements

Potential improvements for future versions:

1. Add category for `*.log` files
2. Add category for `.env` files (with warnings)
3. Add option to exclude specific files via pattern
4. Add timestamp in output header
5. Add file hash verification
6. Add compression option (gzip)
7. Add option to generate separate output per category

## Comparison with combine_files.py

The original `combine_files.py` provides low-level file combining functionality with custom glob patterns. The new `combine_all.py` builds on top of it by:

1. **Predefined categories**: Ready-to-use categories for common file types
2. **Simplified usage**: One command instead of multiple patterns
3. **Better organization**: Automatic categorization and prioritization
4. **Progress tracking**: Clear feedback about which files are being combined
5. **Default behavior**: Sensible defaults for complete project documentation

Use `combine_files.py` when you need custom glob patterns or fine-grained control. Use `combine_all.py` for rapid project documentation and backup generation.
