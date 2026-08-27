#!/usr/bin/env python3
"""Fail closed when a Git diff adds an obvious hardcoded secret."""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from dataclasses import dataclass


SENSITIVE_ASSIGNMENT = re.compile(
    r"""(?ix)
    (?P<key_quote>['"]?)\b[\w.-]*(?:secret|token|password|passwd|api[_-]?key|private[_-]?key)[\w.-]*\b
    (?P=key_quote)
    \s*[:=]\s*
    (?P<rhs>.+)
    """
)
QUOTED_VALUE = re.compile(r"""^\s*(['"])(?P<value>.*?)\1(?:\s*[,;}\]])*\s*$""")
SAFE_REFERENCE = re.compile(
    r"""(?ix)^\s*(?:
    process\.env(?:\.|\[) |
    os\.(?:environ|getenv) |
    getenv\s*\( |
    env\s*\( |
    secret\s*\( |
    \$\{ |
    <[A-Z0-9_.-]+>
    )"""
)
PLACEHOLDER = re.compile(
    r"(?ix)^(?:|x+|example|placeholder|dummy|test|changeme|replace[_ -]?me|redacted|not[_ -]?set|<[A-Z0-9_.-]+>)$"
)
KNOWN_SECRET = re.compile(
    r"""(?x)
    -----BEGIN\ (?:RSA\ |EC\ |OPENSSH\ )?PRIVATE\ KEY----- |
    \bgh[oprsu]_[A-Za-z0-9_]{20,}\b |
    \bgithub_pat_[A-Za-z0-9_]{20,}\b |
    \bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b |
    \bxox[baprs]-[A-Za-z0-9-]{10,}\b
    """
)
BEARER_LITERAL = re.compile(r"""(?i)\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b""")
CREDENTIAL_URL = re.compile(r"""(?i)\b[a-z][a-z0-9+.-]*://[^/\s:@]+:[^/\s@]+@""")
HUNK = re.compile(r"^@@ -\d+(?:,\d+)? \+(?P<line>\d+)(?:,\d+)? @@")


@dataclass(frozen=True)
class Finding:
    path: str
    line: int
    rule: str


def _assignment_is_secret(line: str) -> bool:
    match = SENSITIVE_ASSIGNMENT.search(line)
    if not match:
        return False
    rhs = match.group("rhs").strip()
    if SAFE_REFERENCE.match(rhs):
        return False
    quoted = QUOTED_VALUE.match(rhs)
    if not quoted:
        return False
    value = quoted.group("value").strip()
    return not PLACEHOLDER.fullmatch(value)


def scan_diff(diff: str) -> list[Finding]:
    lines = diff.splitlines()
    if diff.strip() and not any(line.startswith("diff --git ") for line in lines):
        raise ValueError("malformed git diff")

    findings: list[Finding] = []
    path: str | None = None
    new_line: int | None = None

    for raw_line in lines:
        if raw_line.startswith("diff --git "):
            path = None
            new_line = None
            continue
        if raw_line.startswith("+++ "):
            candidate = raw_line[4:]
            path = candidate[2:] if candidate.startswith("b/") else candidate
            continue
        hunk = HUNK.match(raw_line)
        if hunk:
            new_line = int(hunk.group("line"))
            continue
        if raw_line.startswith("+") and not raw_line.startswith("+++"):
            if path is None or new_line is None:
                raise ValueError("malformed git diff")
            content = raw_line[1:]
            rules = []
            if _assignment_is_secret(content):
                rules.append("hardcoded-sensitive-assignment")
            if KNOWN_SECRET.search(content):
                rules.append("known-secret-pattern")
            if BEARER_LITERAL.search(content):
                rules.append("literal-bearer-token")
            if CREDENTIAL_URL.search(content):
                rules.append("credentials-in-url")
            findings.extend(Finding(path, new_line, rule) for rule in rules)
            new_line += 1
        elif raw_line.startswith(" "):
            if new_line is not None:
                new_line += 1

    return findings


def git_diff(args: list[str]) -> str:
    result = subprocess.run(
        ["git", "diff", "--unified=0", "--no-ext-diff", *args, "--"],
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if result.returncode:
        raise RuntimeError(f"git diff failed (exit {result.returncode})")
    return result.stdout


def git_revisions(revision_range: str) -> list[str]:
    result = subprocess.run(
        ["git", "rev-list", "--reverse", "--topo-order", revision_range],
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if result.returncode:
        raise RuntimeError(f"git rev-list failed (exit {result.returncode})")
    return result.stdout.splitlines()


def scan_commits(revision_range: str) -> list[Finding]:
    findings: list[Finding] = []
    for revision in git_revisions(revision_range):
        parent = subprocess.run(
            ["git", "rev-parse", "--verify", f"{revision}^1"],
            check=False,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        if parent.returncode == 0:
            diff = git_diff([f"{parent.stdout.strip()}..{revision}"])
        else:
            empty_tree = subprocess.run(
                ["git", "hash-object", "-t", "tree", "/dev/null"],
                check=False,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            if empty_tree.returncode:
                raise RuntimeError(
                    f"git hash-object failed (exit {empty_tree.returncode})"
                )
            diff = git_diff([f"{empty_tree.stdout.strip()}..{revision}"])
        findings.extend(scan_diff(diff))
    return findings


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--staged", action="store_true", help="scan staged additions")
    source.add_argument("--range", dest="revision_range", help="scan REV..REV additions")
    source.add_argument(
        "--commits",
        dest="commit_range",
        help="scan each commit in REV..REV independently",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        if args.commit_range:
            findings = scan_commits(args.commit_range)
        else:
            diff = git_diff(["--cached"] if args.staged else [args.revision_range])
            findings = scan_diff(diff)
    except (RuntimeError, ValueError) as exc:
        print(f"secret scan could not run: {exc}", file=sys.stderr)
        return 2

    if not findings:
        print("secret scan passed: no obvious hardcoded secrets in added lines")
        return 0

    print("secret scan blocked the change:", file=sys.stderr)
    for finding in findings:
        print(f"  {finding.path}:{finding.line}: {finding.rule}", file=sys.stderr)
    print("Move the value to the approved runtime secret store and reference it at runtime.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
