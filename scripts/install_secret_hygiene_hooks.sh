#!/usr/bin/env bash
set -eu

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

case "${1:-install}" in
  install)
    current="$(git config --local --get core.hooksPath 2>/dev/null || true)"
    if [ -n "$current" ] && [ "$current" != ".githooks" ]; then
      echo "refusing to replace existing local core.hooksPath=$current" >&2
      exit 2
    fi
    for hook in .githooks/pre-commit .githooks/pre-push .githooks/prepare-commit-msg; do
      if [ ! -x "$hook" ]; then
        echo "required executable hook missing: $hook" >&2
        exit 2
      fi
    done
    if [ ! -f scripts/scan_added_secrets.py ]; then
      echo "required scanner missing: scripts/scan_added_secrets.py" >&2
      exit 2
    fi
    git config --local core.hooksPath .githooks
    test "$(git config --local --get core.hooksPath)" = ".githooks"
    echo "secret-hygiene hooks active at .githooks"
    ;;
  --remove)
    current="$(git config --local --get core.hooksPath 2>/dev/null || true)"
    if [ -z "$current" ]; then
      echo "no local hooksPath override is installed"
    elif [ "$current" = ".githooks" ]; then
      git config --local --unset core.hooksPath
      echo "secret-hygiene hooks removed; global hooksPath inheritance restored"
    else
      echo "refusing to remove unrelated local core.hooksPath=$current" >&2
      exit 2
    fi
    ;;
  *)
    echo "usage: $0 [install|--remove]" >&2
    exit 2
    ;;
esac
