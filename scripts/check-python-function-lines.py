#!/usr/bin/env python3

from __future__ import annotations

import ast
import sys
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

MAX_FUNCTION_LINES = 150
IGNORED_DIRECTORY_NAMES = {
    ".git",
    ".next",
    ".ruff_cache",
    ".turbo",
    ".venv",
    "build",
    "dist",
    "node_modules",
}

REPO_ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    oversized_functions: list[FunctionLineViolation] = []

    for path in walk_python_files(REPO_ROOT):
        relative_path = to_relative_path(path)
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=relative_path)
        except SyntaxError as error:
            print(f"{relative_path}: failed to parse Python AST: {error}", file=sys.stderr)
            return 1

        oversized_functions.extend(find_oversized_functions(relative_path, tree))

    if oversized_functions:
        report_failures(oversized_functions)
        return 1

    return 0


def walk_python_files(directory: Path) -> Iterator[Path]:
    for entry in directory.iterdir():
        if entry.is_dir():
            if entry.name not in IGNORED_DIRECTORY_NAMES:
                yield from walk_python_files(entry)
            continue

        if entry.is_file() and entry.suffix == ".py":
            yield entry


def find_oversized_functions(
    relative_path: str, tree: ast.AST
) -> Iterator[FunctionLineViolation]:
    for node in ast.walk(tree):
        if not isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
            continue

        if node.end_lineno is None:
            continue

        line_count = node.end_lineno - node.lineno + 1
        if line_count > MAX_FUNCTION_LINES:
            yield FunctionLineViolation(
                line_count=line_count,
                name=node.name,
                path=relative_path,
                start_line=node.lineno,
                end_line=node.end_lineno,
            )


def report_failures(violations: list["FunctionLineViolation"]) -> None:
    print(
        "Python function line limit failed. "
        f"Maximum allowed: {MAX_FUNCTION_LINES} lines per function.",
        file=sys.stderr,
    )

    for violation in sorted(violations):
        print(
            f"- {violation.path}:{violation.start_line}: "
            f"{violation.name} has {violation.line_count} lines "
            f"({violation.start_line}-{violation.end_line})",
            file=sys.stderr,
        )


def to_relative_path(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


@dataclass(frozen=True, order=True)
class FunctionLineViolation:
    path: str
    start_line: int
    name: str
    line_count: int
    end_line: int


if __name__ == "__main__":
    raise SystemExit(main())
