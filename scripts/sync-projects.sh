#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAVIX_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
WORKSPACE_DIR="$(cd "${NAVIX_DIR}/.." && pwd)"

sync_repo() {
  local project_name="$1"
  local repo_url="$2"
  local branch_name="$3"
  local target_dir="${WORKSPACE_DIR}/${project_name}"

  echo
  echo "=== ${project_name} ==="

  if [[ -e "${target_dir}" ]]; then
    if [[ ! -d "${target_dir}/.git" ]]; then
      echo "Existing folder is not a git repository: ${target_dir}" >&2
      exit 1
    fi

    echo "Updating ${target_dir}"
    git -C "${target_dir}" fetch origin
  else
    echo "Cloning into ${target_dir}"
    git clone "${repo_url}" "${target_dir}"
  fi

  git -C "${target_dir}" checkout "${branch_name}"
  git -C "${target_dir}" pull --ff-only origin "${branch_name}"
}

sync_repo "WebP-Animator" "https://github.com/KristekQQ/WebP-Animator.git" "master"
sync_repo "panorama" "https://github.com/KristekQQ/panorama.git" "main"
sync_repo "SFX-HotSwap" "https://github.com/KristekQQ/SFX-HotSwap.git" "main"

echo
echo "Synchronization finished."
