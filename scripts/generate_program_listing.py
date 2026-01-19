from __future__ import annotations
from pathlib import Path
import re
from datetime import datetime, timezone

root = Path(r"c:/Users/Lenovo/Downloads/ONHS OLMS - mongodb").resolve()
output_path = root / "docs" / "PROGRAM_LISTING.md"
output_path.parent.mkdir(parents=True, exist_ok=True)

skip_dirs = {".git", "node_modules", ".next", ".turbo", ".idea", ".vscode", "__pycache__", ".pytest_cache", ".venv"}
skip_files = {".DS_Store", "Thumbs.db"}

binary_exts = {
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".svg",
    ".mp4", ".mov", ".avi", ".mp3", ".wav",
    ".pdf", ".zip", ".7z", ".rar",
    ".map", ".lock", ".woff", ".woff2", ".ttf", ".eot",
}

data_dir = root / "backend" / "data"
collection_names = []
if data_dir.exists():
    for item in data_dir.glob("*.json"):
        collection_names.append(item.stem.lower())
collection_names.sort()


def should_skip(path: Path) -> bool:
    for part in path.relative_to(root).parts:
        if part in skip_dirs:
            return True
    return False


def is_program_file(path: Path) -> bool:
    if path.name in skip_files:
        return False
    if path.suffix.lower() in binary_exts:
        return False
    rel = path.relative_to(root).as_posix()
    lower = rel.lower()

    # Exclude non-essential outputs and records
    exclude_prefixes = (
        "frontend/build/",
        "frontend/public/",
        "backend/data/",
        "backend/test/",
        "backend/uploads/",
        "docs/",
        "scripts/",
    )
    if lower.startswith(exclude_prefixes):
        return False

    exclude_names = {
        "package-lock.json",
        "yarn.lock",
        "pnpm-lock.yaml",
        ".env",
        ".env.example",
        ".env.development",
        ".gitignore",
        "readme.md",
        "file_status_report.txt",
    }
    if path.name.lower() in exclude_names:
        return False

    # Exclude logs and backup artifacts
    if path.suffix.lower() in {".log", ".bak"}:
        return False
    if ".bak." in path.name.lower():
        return False
    return True


def describe_program(path: Path) -> str:
    rel = path.relative_to(root).as_posix()
    lower = rel.lower()
    name = path.name

    if lower.startswith("backend/routes/"):
        base = path.stem.replace("_", " ")
        return f"API route handler for {base} resources."
    if lower.startswith("backend/middleware/"):
        return "Express middleware for request handling and access control."
    if lower.startswith("backend/utils/"):
        return "Backend utility module used across services."
    if lower.startswith("backend/adapters/"):
        return "Database adapter layer for storage operations."
    if lower.startswith("backend/scripts/"):
        return "Backend maintenance or data migration script."
    if lower.startswith("backend/test/"):
        return "Backend automated test case."
    if lower.startswith("backend/data/"):
        return "Seed or offline data store for the backend."
    if lower == "backend/app.js":
        return "Express application configuration and middleware setup."
    if lower == "backend/server.js":
        return "Backend server entry point and HTTP listener."

    if lower.startswith("frontend/src/pages/"):
        return "Frontend page view for routing and page-level UI."
    if lower.startswith("frontend/src/components/"):
        return "Reusable frontend UI component."
    if lower.startswith("frontend/src/contexts/"):
        return "React context provider for shared state."
    if lower.startswith("frontend/src/utils/"):
        return "Frontend utility helper for shared logic."
    if lower.startswith("frontend/src/theme/"):
        return "Frontend theming and UI configuration."
    if lower.startswith("frontend/src/data/"):
        return "Frontend static data configuration."
    if lower == "frontend/src/index.js":
        return "Frontend application bootstrap and render entry."
    if lower == "frontend/src/app.js":
        return "Frontend application root component."
    if lower.startswith("frontend/public/"):
        return "Frontend public static asset or HTML entry."
    if lower.startswith("frontend/build/"):
        return "Compiled frontend build artifact."

    if name.endswith(".md"):
        return "Project documentation file."
    if name.endswith(".json"):
        return "Project configuration or data file."
    if name.endswith(".yml") or name.endswith(".yaml"):
        return "Deployment or configuration file."
    if name.endswith(".bat") or name.endswith(".ps1"):
        return "Automation or startup script."

    return f"Source file located at {rel}."


program_files: list[Path] = []
for path in root.rglob("*"):
    if path.is_dir():
        if should_skip(path):
            continue
        continue
    if should_skip(path):
        continue
    if is_program_file(path):
        program_files.append(path)

program_files.sort(key=lambda p: p.relative_to(root).as_posix().lower())

# Preload file contents for simple reference matching
file_contents: dict[Path, str] = {}
for path in program_files:
    try:
        file_contents[path] = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        file_contents[path] = ""


def clean_code(path: Path, content: str) -> str:
    ext = path.suffix.lower()
    cleaned = content

    # Remove block comments for JS/CSS-like files
    if ext in {".js", ".jsx", ".ts", ".tsx", ".css", ".scss"}:
        cleaned = re.sub(r"/\*.*?\*/", "", cleaned, flags=re.DOTALL)
        cleaned = re.sub(r"^\s*//.*$", "", cleaned, flags=re.MULTILINE)

    # Remove Python comments (full-line)
    if ext == ".py":
        cleaned = re.sub(r"^\s*#.*$", "", cleaned, flags=re.MULTILINE)

    # Remove PowerShell and YAML comments (full-line)
    if ext in {".ps1", ".yml", ".yaml"}:
        cleaned = re.sub(r"^\s*#.*$", "", cleaned, flags=re.MULTILINE)

    # Remove batch file comments
    if ext == ".bat":
        cleaned = re.sub(r"^\s*(rem\s+.*|::.*)$", "", cleaned, flags=re.IGNORECASE | re.MULTILINE)

    # Remove JSON style comments if present
    if ext == ".json":
        cleaned = re.sub(r"/\*.*?\*/", "", cleaned, flags=re.DOTALL)
        cleaned = re.sub(r"^\s*//.*$", "", cleaned, flags=re.MULTILINE)

    # Normalize whitespace
    lines = [line.rstrip() for line in cleaned.splitlines()]
    # Collapse consecutive blank lines
    collapsed: list[str] = []
    blank = False
    for line in lines:
        if line.strip() == "":
            if not blank:
                collapsed.append("")
            blank = True
        else:
            collapsed.append(line)
            blank = False
    return "\n".join(collapsed).strip()


def code_fence_language(path: Path) -> str:
    ext = path.suffix.lower()
    return {
        ".js": "javascript",
        ".jsx": "javascript",
        ".ts": "typescript",
        ".tsx": "typescript",
        ".json": "json",
        ".yml": "yaml",
        ".yaml": "yaml",
        ".css": "css",
        ".scss": "scss",
        ".html": "html",
        ".bat": "bat",
        ".ps1": "powershell",
        ".py": "python",
    }.get(ext, "")


def module_name(path: Path) -> str:
    rel = path.relative_to(root).as_posix()
    lower = rel.lower()

    if lower.startswith("backend/adapters/"):
        return "Backend - Adapters"
    if lower.startswith("backend/middleware/"):
        return "Backend - Middleware"
    if lower.startswith("backend/routes/"):
        return "Backend - Routes"
    if lower.startswith("backend/utils/"):
        return "Backend - Utils"
    if lower.startswith("backend/scripts/"):
        return "Backend - Scripts"
    if lower.startswith("backend/"):
        return "Backend - Core"

    if lower.startswith("frontend/src/pages/"):
        return "Frontend - Pages"
    if lower.startswith("frontend/src/components/"):
        return "Frontend - Components"
    if lower.startswith("frontend/src/contexts/"):
        return "Frontend - Contexts"
    if lower.startswith("frontend/src/utils/"):
        return "Frontend - Utils"
    if lower.startswith("frontend/src/theme/"):
        return "Frontend - Theme"
    if lower.startswith("frontend/src/data/"):
        return "Frontend - Data"
    if lower.startswith("frontend/src/"):
        return "Frontend - Core"

    if lower.startswith("frontend/"):
        return "Frontend - Other"

    return "Other"


def find_table_used(path: Path) -> str:
    rel_lower = path.relative_to(root).as_posix().lower()
    file_stem = path.stem.lower()

    matches = []
    for name in collection_names:
        if name in rel_lower or name in file_stem:
            matches.append(name)

    if matches:
        return ", ".join(sorted(set(matches)))
    return "None"


def find_called_by(target: Path) -> str:
    target_name = target.name
    target_stem = target.stem
    rel = target.relative_to(root).as_posix()
    rel_no_ext = rel.rsplit(".", 1)[0]

    patterns = [
        re.compile(rf"require\(\s*['\"][^'\"]*{re.escape(target_name)}['\"]\s*\)"),
        re.compile(rf"from\s+['\"][^'\"]*{re.escape(target_name)}['\"]"),
        re.compile(rf"import\s+[^;]*from\s+['\"][^'\"]*{re.escape(target_name)}['\"]"),
        re.compile(rf"require\(\s*['\"][^'\"]*{re.escape(target_stem)}['\"]\s*\)"),
        re.compile(rf"from\s+['\"][^'\"]*{re.escape(target_stem)}['\"]"),
        re.compile(rf"import\s+[^;]*from\s+['\"][^'\"]*{re.escape(target_stem)}['\"]"),
        re.compile(rf"['\"]{re.escape(rel)}['\"]"),
        re.compile(rf"['\"]{re.escape(rel_no_ext)}['\"]"),
    ]

    callers = []
    for caller, content in file_contents.items():
        if caller == target:
            continue
        if any(p.search(content) for p in patterns):
            callers.append(caller.name)

    callers = sorted(set(callers), key=str.lower)
    return ", ".join(callers) if callers else "None"


def table_block(program_name: str, description: str, table_used: str, called_by: str) -> str:
    return "\n".join(
        [
            "| Field | Details |",
            "| --- | --- |",
            f"| Program Name | {program_name} |",
            f"| Description | {description} |",
            f"| Called by | {called_by} |",
            f"| Table used | {table_used} |",
            "|  |  |",
            "| Programmer | Nazel Ascaño |",
            "| Date created | 12/14/2025 |",
            "| Revision Date | TBD |",
            "| Revision / description of change | None |",
        ]
    )


timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ")

lines: list[str] = []
lines.append("# Program Listing")
lines.append("")
lines.append(f"_Formatted to match the program-listing template. Generated on {timestamp} UTC._")
lines.append("")

grouped: dict[str, list[Path]] = {}
for path in program_files:
    group = module_name(path)
    grouped.setdefault(group, []).append(path)

for group in sorted(grouped.keys()):
    lines.append(f"# {group}")
    lines.append("")
    for path in sorted(grouped[group], key=lambda p: p.name.lower()):
        program_name = path.name
        description = describe_program(path)
        table_used = find_table_used(path)
        called_by = find_called_by(path)
        cleaned_code = clean_code(path, file_contents.get(path, ""))
        language = code_fence_language(path)
        lines.append(f"## {program_name}")
        lines.append("")
        lines.append(table_block(program_name, description, table_used, called_by))
        if cleaned_code:
            lines.append("")
            lines.append(f"```{language}".rstrip())
            lines.append(cleaned_code)
            lines.append("```")
        lines.append("")

output_path.write_text("\n".join(lines), encoding="utf-8")
print(f"Wrote formatted program listing to {output_path.relative_to(root)}")
