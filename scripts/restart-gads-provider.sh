#!/usr/bin/env bash
# One-shot GADS provider restart for the host collector.
# Official macOS unit: com.gads.provider (shamanec/GADS docs/macos-service.md).
# Linux: gads-provider.service (system or user). Override with PROVIDER_UNIT.
set -euo pipefail

UNIT="${PROVIDER_UNIT:-}"

if [[ "$(uname -s)" == "Darwin" ]]; then
  UNIT="${UNIT:-com.gads.provider}"
  if sudo -n launchctl kickstart -k "system/${UNIT}"; then
    echo "restarted launchd ${UNIT}"
    exit 0
  fi
  echo "could not kickstart system/${UNIT}; need passwordless sudo for launchctl kickstart" >&2
  exit 1
fi

if command -v systemctl >/dev/null 2>&1; then
  UNIT="${UNIT:-gads-provider.service}"
  if systemctl --user restart "$UNIT" 2>/dev/null; then
    echo "restarted user ${UNIT}"
    exit 0
  fi
  if sudo -n systemctl restart "$UNIT"; then
    echo "restarted system ${UNIT}"
    exit 0
  fi
  echo "could not restart ${UNIT}" >&2
  exit 1
fi

echo "no GADS provider service found" >&2
exit 1
