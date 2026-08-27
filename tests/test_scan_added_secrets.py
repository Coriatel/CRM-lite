import importlib.util
from pathlib import Path
import contextlib
import io
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


MODULE_PATH = Path(__file__).parents[1] / "scripts" / "scan_added_secrets.py"
SPEC = importlib.util.spec_from_file_location("scan_added_secrets", MODULE_PATH)
assert SPEC and SPEC.loader
scanner = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = scanner
SPEC.loader.exec_module(scanner)


def diff_with(added_line: str) -> str:
    return "\n".join(
        [
            "diff --git a/config.js b/config.js",
            "--- a/config.js",
            "+++ b/config.js",
            "@@ -0,0 +12 @@",
            f"+{added_line}",
        ]
    )


class SecretScanTests(unittest.TestCase):
    def test_blocks_sensitive_quoted_literal_without_echoing_value(self):
        key = "API_" + "TOKEN"
        value = "live-" + ("value" * 5)
        findings = scanner.scan_diff(diff_with(f'{key}: "{value}"'))

        self.assertEqual(["hardcoded-sensitive-assignment"], [item.rule for item in findings])
        self.assertNotIn(value, repr(findings))

    def test_allows_runtime_environment_reference(self):
        key = "API_" + "TOKEN"
        findings = scanner.scan_diff(diff_with(f"{key}: process.env.{key}"))
        self.assertEqual([], findings)

    def test_allows_explicit_placeholder(self):
        key = "API_" + "TOKEN"
        findings = scanner.scan_diff(diff_with(f'{key}: "<{key}>"'))
        self.assertEqual([], findings)

    def test_blocks_literal_bearer_value(self):
        bearer = "Bearer " + ("a1" * 12)
        findings = scanner.scan_diff(diff_with(f'header = "{bearer}"'))
        self.assertEqual(["literal-bearer-token"], [item.rule for item in findings])

    def test_blocks_pm2_style_quoted_secret(self):
        key = "SERVICE_" + "SECRET"
        value = "synthetic-" + ("z9" * 12)
        findings = scanner.scan_diff(diff_with(f'{key}: "{value}",'))
        self.assertEqual(["hardcoded-sensitive-assignment"], [item.rule for item in findings])

    def test_blocks_inline_pm2_style_quoted_secret(self):
        key = "SERVICE_" + "SECRET"
        value = "synthetic-" + ("m8" * 12)
        findings = scanner.scan_diff(diff_with(f'env: {{ {key}: "{value}" }}'))
        self.assertEqual(["hardcoded-sensitive-assignment"], [item.rule for item in findings])

    def test_blocks_quoted_environment_key(self):
        key = "SERVICE_" + "SECRET"
        value = "synthetic-" + ("q6" * 12)
        findings = scanner.scan_diff(diff_with(f'env = {{"{key}": "{value}"}}'))
        self.assertEqual(["hardcoded-sensitive-assignment"], [item.rule for item in findings])

    def test_blocks_realistic_one_line_pm2_environment_object(self):
        key = "SERVICE_" + "SECRET"
        value = "synthetic-" + ("v5" * 12)
        findings = scanner.scan_diff(diff_with(f'module.exports = {{ env: {{ {key}: "{value}" }} }};'))
        self.assertEqual(["hardcoded-sensitive-assignment"], [item.rule for item in findings])

    def test_blocks_secret_in_new_file(self):
        key = "NEW_" + "API_KEY"
        value = "synthetic-" + ("k7" * 12)
        diff = "\n".join(
            [
                "diff --git a/new_config.py b/new_config.py",
                "new file mode 100644",
                "--- /dev/null",
                "+++ b/new_config.py",
                "@@ -0,0 +1 @@",
                f'+{key} = "{value}"',
            ]
        )
        findings = scanner.scan_diff(diff)
        self.assertEqual("new_config.py", findings[0].path)
        self.assertEqual("hardcoded-sensitive-assignment", findings[0].rule)

    def test_allows_ordinary_safe_change(self):
        self.assertEqual([], scanner.scan_diff(diff_with('FEATURE_ENABLED = "true"')))

    def test_allows_canonical_secret_lookup(self):
        key = "SERVICE_" + "TOKEN"
        self.assertEqual([], scanner.scan_diff(diff_with(f'{key} = secret("{key}")')))

    def test_blocks_credentials_embedded_in_url(self):
        userinfo = "user" + ":" + "pass" + "@"
        findings = scanner.scan_diff(diff_with(f'url = "https://{userinfo}db.internal/name"'))
        self.assertEqual(["credentials-in-url"], [item.rule for item in findings])

    @patch.object(scanner, "parse_args")
    @patch.object(scanner, "git_diff")
    def test_cli_redacts_matched_value(self, git_diff, parse_args):
        key = "SERVICE_" + "TOKEN"
        value = "synthetic-" + ("r4" * 12)
        parse_args.return_value = type(
            "Args",
            (),
            {"staged": True, "revision_range": None, "commit_range": None},
        )()
        git_diff.return_value = diff_with(f'{key} = "{value}"')
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            self.assertEqual(1, scanner.main())
        self.assertNotIn(value, stderr.getvalue())
        self.assertIn("hardcoded-sensitive-assignment", stderr.getvalue())

    @patch.object(scanner.subprocess, "run")
    def test_git_failure_is_not_treated_as_a_clean_scan(self, run):
        marker = "synthetic-sensitive-marker"
        run.return_value = subprocess.CompletedProcess([], 128, "", marker)
        with self.assertRaisesRegex(RuntimeError, "git diff failed") as raised:
            scanner.git_diff(["missing..HEAD"])
        self.assertNotIn(marker, str(raised.exception))

    @patch.object(scanner, "parse_args")
    @patch.object(scanner.subprocess, "run")
    def test_cli_redacts_git_failure_stderr(self, run, parse_args):
        marker = "synthetic-sensitive-marker"
        parse_args.return_value = type(
            "Args",
            (),
            {
                "staged": False,
                "revision_range": "missing..HEAD",
                "commit_range": None,
            },
        )()
        run.return_value = subprocess.CompletedProcess([], 128, "", marker)
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            self.assertEqual(2, scanner.main())
        self.assertNotIn(marker, stderr.getvalue())
        self.assertIn("git diff failed", stderr.getvalue())

    @patch.object(scanner, "parse_args")
    @patch.object(scanner, "git_diff")
    def test_malformed_input_fails_closed_without_echoing_input(self, git_diff, parse_args):
        malformed = "malformed " + ("sensitive-content-" * 3)
        parse_args.return_value = type(
            "Args",
            (),
            {"staged": True, "revision_range": None, "commit_range": None},
        )()
        git_diff.return_value = malformed
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            self.assertEqual(2, scanner.main())
        self.assertNotIn(malformed, stderr.getvalue())
        self.assertIn("malformed git diff", stderr.getvalue())

    def test_ci_invokes_same_scanner_without_bypass(self):
        workflow = (Path(__file__).parents[1] / ".github" / "workflows" / "secret-hygiene.yml").read_text()
        self.assertIn("pull_request_target:", workflow)
        self.assertIn("pull_request:", workflow)
        self.assertIn("push:", workflow)
        self.assertIn("ref: ${{ github.event.repository.default_branch }}", workflow)
        self.assertEqual(2, workflow.count("persist-credentials: false"))
        self.assertIn("credential.helper=", workflow)
        self.assertIn("GH_TOKEN: ${{ github.token }}", workflow)
        self.assertIn("without checking out proposed code", workflow)
        self.assertIn("python3 scripts/scan_added_secrets.py --commits", workflow)
        self.assertNotIn("continue-on-error", workflow)

    def test_local_hooks_fail_closed_and_chain_existing_push_guard(self):
        root = Path(__file__).parents[1]
        pre_commit = (root / ".githooks" / "pre-commit").read_text()
        pre_push = (root / ".githooks" / "pre-push").read_text()
        prepare_commit = (root / ".githooks" / "prepare-commit-msg").read_text()
        self.assertIn("scanner missing", pre_commit)
        self.assertIn("--staged", pre_commit)
        self.assertIn("scanner missing", pre_push)
        self.assertIn("--commits", pre_push)
        self.assertIn("config --global --get core.hooksPath", pre_push)
        self.assertIn("config --global --get core.hooksPath", prepare_commit)

    def test_local_hook_fails_closed_when_scanner_is_missing(self):
        root = Path(__file__).parents[1]
        with tempfile.TemporaryDirectory() as temp:
            repo = Path(temp)
            subprocess.run(["git", "init", "-q", str(repo)], check=True)
            hook = repo / ".githooks" / "pre-commit"
            hook.parent.mkdir()
            shutil.copy2(root / ".githooks" / "pre-commit", hook)
            hook.chmod(0o755)

            result = subprocess.run(
                [str(hook)],
                cwd=repo,
                check=False,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )

        self.assertEqual(2, result.returncode)
        self.assertIn("scanner missing", result.stderr)

    def test_local_hook_fails_closed_when_python_is_unavailable(self):
        root = Path(__file__).parents[1]
        with tempfile.TemporaryDirectory() as temp:
            repo = Path(temp) / "repo"
            bin_dir = Path(temp) / "bin"
            repo.mkdir()
            bin_dir.mkdir()
            subprocess.run(["git", "init", "-q", str(repo)], check=True)
            hook = repo / ".githooks" / "pre-commit"
            scanner_path = repo / "scripts" / "scan_added_secrets.py"
            hook.parent.mkdir()
            scanner_path.parent.mkdir()
            shutil.copy2(root / ".githooks" / "pre-commit", hook)
            shutil.copy2(root / "scripts" / "scan_added_secrets.py", scanner_path)
            hook.chmod(0o755)
            for command in ("bash", "git"):
                executable = shutil.which(command)
                self.assertIsNotNone(executable)
                os.symlink(executable, bin_dir / command)

            result = subprocess.run(
                [str(hook)],
                cwd=repo,
                check=False,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env={"PATH": str(bin_dir), "HOME": str(repo)},
            )

        self.assertNotEqual(0, result.returncode)
        self.assertIn("python3", result.stderr)

    @patch.object(scanner, "git_revisions", return_value=["commit-one", "commit-two"])
    @patch.object(scanner, "git_diff")
    @patch.object(scanner.subprocess, "run")
    def test_commit_scan_catches_add_then_remove(self, run, git_diff, _git_revisions):
        run.side_effect = [
            subprocess.CompletedProcess([], 0, "parent-one\n", ""),
            subprocess.CompletedProcess([], 0, "parent-two\n", ""),
        ]
        key = "API_" + "TOKEN"
        value = "synthetic-" + ("a6" * 12)
        git_diff.side_effect = [
            diff_with(f'{key} = "{value}"'),
            "\n".join(
                [
                    "diff --git a/config.js b/config.js",
                    "--- a/config.js",
                    "+++ b/config.js",
                    "@@ -12 +11,0 @@",
                    f'-{key} = "{value}"',
                ]
            ),
        ]

        findings = scanner.scan_commits("base..head")
        self.assertEqual(
            ["hardcoded-sensitive-assignment"], [item.rule for item in findings]
        )

    @patch.object(scanner.subprocess, "run")
    def test_revision_failure_redacts_git_stderr(self, run):
        marker = "synthetic-sensitive-marker"
        run.return_value = subprocess.CompletedProcess([], 128, "", marker)
        with self.assertRaisesRegex(RuntimeError, "git rev-list failed") as raised:
            scanner.git_revisions("missing..HEAD")
        self.assertNotIn(marker, str(raised.exception))

    def test_commit_cli_blocks_add_then_remove_without_logging_value(self):
        key = "SERVICE_" + "TOKEN"
        value = "synthetic-" + ("h4" * 12)
        with tempfile.TemporaryDirectory() as temp:
            repo = Path(temp)
            subprocess.run(["git", "init", "-q", str(repo)], check=True)
            subprocess.run(
                ["git", "config", "user.name", "Secret Hygiene Test"],
                cwd=repo,
                check=True,
            )
            subprocess.run(
                ["git", "config", "user.email", "secret-hygiene@example.invalid"],
                cwd=repo,
                check=True,
            )
            config = repo / "config.py"
            config.write_text("SAFE = True\n")
            subprocess.run(["git", "add", "config.py"], cwd=repo, check=True)
            subprocess.run(["git", "commit", "-qm", "base"], cwd=repo, check=True)
            base = subprocess.run(
                ["git", "rev-parse", "HEAD"],
                cwd=repo,
                check=True,
                text=True,
                stdout=subprocess.PIPE,
            ).stdout.strip()

            config.write_text(f'{key} = "{value}"\n')
            subprocess.run(["git", "commit", "-qam", "add synthetic value"], cwd=repo, check=True)
            config.write_text("SAFE = True\n")
            subprocess.run(["git", "commit", "-qam", "remove synthetic value"], cwd=repo, check=True)
            head = subprocess.run(
                ["git", "rev-parse", "HEAD"],
                cwd=repo,
                check=True,
                text=True,
                stdout=subprocess.PIPE,
            ).stdout.strip()

            result = subprocess.run(
                [sys.executable, str(MODULE_PATH), "--commits", f"{base}..{head}"],
                cwd=repo,
                check=False,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )

        self.assertEqual(1, result.returncode)
        self.assertIn("hardcoded-sensitive-assignment", result.stderr)
        self.assertNotIn(value, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
