#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  bash codex_portable_node_all_agents_mcp.sh /absolute/or/relative/path/to/repo

Optional environment variables:
  CODEX_HOME                Override Codex home (default: ~/.codex)
  GITHUB_PAT                GitHub Personal Access Token; when set, enables GitHub MCP
  GITHUB_MCP_URL            Override GitHub MCP URL (default: https://api.githubcopilot.com/mcp/)
  CHROME_MCP_BROWSER_URL    Existing Chrome remote-debugging URL (optional)
  ENABLE_FAST_PATCHER       1 to add fast_patcher agent, 0 to skip (default: 0)
USAGE
}

if [ "$#" -ne 1 ]; then
  usage >&2
  exit 1
fi

REPO_INPUT="$1"
if [ ! -d "$REPO_INPUT" ]; then
  echo "Repo directory does not exist: $REPO_INPUT" >&2
  exit 1
fi

cd "$REPO_INPUT"
REPO_ABS="$(pwd -P)"
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
GLOBAL_AGENTS_DIR="$CODEX_HOME/agents"
REPO_CODEX_DIR="$REPO_ABS/.codex"
REPO_PLAYBOOK_DIR="$REPO_CODEX_DIR/playbooks"
TS="$(date +%Y%m%d-%H%M%S)"
GITHUB_MCP_URL="${GITHUB_MCP_URL:-https://api.githubcopilot.com/mcp/}"
ENABLE_FAST_PATCHER="${ENABLE_FAST_PATCHER:-0}"

backup_if_exists() {
  local path="$1"
  local backup="$path.bak.$TS"
  if [ -e "$path" ]; then
    if [ -d "$path" ]; then
      cp -R "$path" "$backup"
    else
      cp "$path" "$backup"
    fi
  fi
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

PKG_MANAGER="npm"
if [ -f "$REPO_ABS/pnpm-lock.yaml" ] || [ -f "$REPO_ABS/pnpm-workspace.yaml" ]; then
  PKG_MANAGER="pnpm"
elif [ -f "$REPO_ABS/yarn.lock" ]; then
  PKG_MANAGER="yarn"
elif [ -f "$REPO_ABS/bun.lockb" ] || [ -f "$REPO_ABS/bun.lock" ]; then
  PKG_MANAGER="bun"
fi

RUN_PREFIX="npm run"
INSTALL_CMD="npm install"
case "$PKG_MANAGER" in
  npm)
    RUN_PREFIX="npm run"
    INSTALL_CMD="npm install"
    ;;
  pnpm)
    RUN_PREFIX="pnpm"
    INSTALL_CMD="pnpm install"
    ;;
  yarn)
    RUN_PREFIX="yarn"
    INSTALL_CMD="yarn install"
    ;;
  bun)
    RUN_PREFIX="bun run"
    INSTALL_CMD="bun install"
    ;;
esac

detect_script_name() {
  if [ ! -f "$REPO_ABS/package.json" ] || ! command_exists node; then
    return 1
  fi
  node -e '
    const fs = require("fs");
    const pkg = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const names = process.argv.slice(2);
    for (const name of names) {
      if (pkg.scripts && Object.prototype.hasOwnProperty.call(pkg.scripts, name)) {
        process.stdout.write(name);
        process.exit(0);
      }
    }
    process.exit(1);
  ' "$REPO_ABS/package.json" "$@"
}

mk_run_cmd() {
  local script_name="$1"
  case "$PKG_MANAGER" in
    npm) printf 'npm run %s' "$script_name" ;;
    pnpm) printf 'pnpm %s' "$script_name" ;;
    yarn) printf 'yarn %s' "$script_name" ;;
    bun) printf 'bun run %s' "$script_name" ;;
  esac
}

LINT_CMD="<fill me>"
TYPECHECK_CMD="<fill me>"
UNIT_TEST_CMD="<fill me>"
E2E_CMD="<fill me>"
BUILD_CMD="<fill me>"
DEV_CMD="<fill me>"

if script_name="$(detect_script_name lint eslint 2>/dev/null)"; then
  LINT_CMD="$(mk_run_cmd "$script_name")"
fi

if script_name="$(detect_script_name typecheck check-types check:types check-types:ci 2>/dev/null)"; then
  TYPECHECK_CMD="$(mk_run_cmd "$script_name")"
elif [ -f "$REPO_ABS/tsconfig.json" ]; then
  TYPECHECK_CMD="npx tsc --noEmit"
fi

if script_name="$(detect_script_name test:unit unit test 2>/dev/null)"; then
  UNIT_TEST_CMD="$(mk_run_cmd "$script_name")"
fi

if script_name="$(detect_script_name test:e2e e2e test:playwright playwright cypress 2>/dev/null)"; then
  E2E_CMD="$(mk_run_cmd "$script_name")"
fi

if script_name="$(detect_script_name build 2>/dev/null)"; then
  BUILD_CMD="$(mk_run_cmd "$script_name")"
fi

if script_name="$(detect_script_name dev start 2>/dev/null)"; then
  DEV_CMD="$(mk_run_cmd "$script_name")"
fi

MONOREPO_NOTE=""
if [ -f "$REPO_ABS/pnpm-workspace.yaml" ] || [ -f "$REPO_ABS/turbo.json" ] || [ -f "$REPO_ABS/nx.json" ] || [ -d "$REPO_ABS/apps" ] || [ -d "$REPO_ABS/packages" ]; then
  MONOREPO_NOTE='- This looks like a monorepo. Prefer focused commands from the relevant package or app instead of running the whole workspace unless the task truly spans multiple packages.'
fi

mkdir -p "$CODEX_HOME" "$GLOBAL_AGENTS_DIR" "$REPO_CODEX_DIR" "$REPO_PLAYBOOK_DIR"

backup_if_exists "$CODEX_HOME/config.toml"
backup_if_exists "$CODEX_HOME/AGENTS.md"
backup_if_exists "$REPO_ABS/AGENTS.md"
backup_if_exists "$REPO_CODEX_DIR/config.toml"
backup_if_exists "$REPO_PLAYBOOK_DIR"
for agent_file in explorer.toml planner.toml architect.toml worker.toml reviewer.toml tester.toml docs_researcher.toml browser_debugger.toml github_reader.toml fast_patcher.toml; do
  backup_if_exists "$GLOBAL_AGENTS_DIR/$agent_file"
done

cat > "$CODEX_HOME/config.toml" <<EOF_CONFIG
model = "gpt-5.4"
model_reasoning_effort = "medium"
plan_mode_reasoning_effort = "high"
model_verbosity = "medium"
review_model = "gpt-5.4"
approval_policy = "on-request"
sandbox_mode = "workspace-write"
personality = "pragmatic"
project_doc_fallback_filenames = ["TEAM_GUIDE.md", ".agents.md"]
project_doc_max_bytes = 65536

[agents]
max_threads = 6
max_depth = 1

[profiles.quick]
model = "gpt-5.4-mini"
model_reasoning_effort = "medium"

[profiles.deep]
model = "gpt-5.4"
model_reasoning_effort = "high"

[profiles.review]
model = "gpt-5.4"
model_reasoning_effort = "high"
sandbox_mode = "read-only"

[projects."$REPO_ABS"]
trust_level = "trusted"

[mcp_servers.openaiDeveloperDocs]
url = "https://developers.openai.com/mcp"
tool_timeout_sec = 120
required = false

[mcp_servers.context7]
command = "npx"
args = ["-y", "@upstash/context7-mcp"]
startup_timeout_sec = 30
tool_timeout_sec = 120
required = false

[mcp_servers.sequential_thinking]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-sequential-thinking@latest"]
startup_timeout_sec = 30
tool_timeout_sec = 120
required = false

[mcp_servers.playwright]
command = "npx"
args = ["-y", "@playwright/mcp@latest", "--isolated"]
startup_timeout_sec = 30
tool_timeout_sec = 180
required = false

[mcp_servers.chrome_devtools]
command = "bash"
args = ["-lc", "if [ -n \"\${CHROME_MCP_BROWSER_URL:-}\" ]; then exec npx -y chrome-devtools-mcp@latest --no-usage-statistics --browser-url=\"\$CHROME_MCP_BROWSER_URL\"; else exec npx -y chrome-devtools-mcp@latest --no-usage-statistics; fi"]
env_vars = ["CHROME_MCP_BROWSER_URL"]
startup_timeout_sec = 30
tool_timeout_sec = 180
required = false
EOF_CONFIG

if [ -n "${GITHUB_PAT:-}" ]; then
  cat >> "$CODEX_HOME/config.toml" <<EOF_GITHUB

[mcp_servers.github]
url = "$GITHUB_MCP_URL"
bearer_token_env_var = "GITHUB_PAT"
tool_timeout_sec = 180
required = false
EOF_GITHUB
fi

cat > "$CODEX_HOME/AGENTS.md" <<'EOF_GLOBAL_AGENTS'
# Global Codex rules for Node.js and JavaScript work

## Core workflow

- Prefer the smallest defensible patch that fixes the root cause.
- Keep unrelated files untouched.
- Do not revert user changes you did not make unless explicitly asked.
- For non-trivial work, inspect package.json, lockfiles, tsconfig, lint config, test config, and build config before editing.
- In monorepos, target the relevant package or app first.
- After code changes, run the smallest useful validation that proves the change.
- If validation cannot run, say exactly why.
- In the final answer always include: root cause, files changed, validation, and remaining risks.

## MCP usage policy for all agents

All agents inherit the same MCP access from the main session. Use MCP only when it materially reduces uncertainty or gives evidence you cannot get reliably from the local repo.

Use MCP in this order:
1. Local repo and tests first.
2. Use sequential_thinking only for ambiguous, multi-step, or design-heavy tasks.
3. Use openaiDeveloperDocs only for OpenAI, Codex, MCP, or SDK questions.
4. Use context7 only for external libraries, frameworks, or version-specific API behavior not clear from local code.
5. Use playwright or chrome_devtools only for UI, browser, network, console, rendering, or performance debugging.
6. Use github only when the needed context lives in PRs, issues, Actions, discussions, or remote repo metadata beyond local git history.

Do not call MCP just because it exists. Prefer local evidence when sufficient.
EOF_GLOBAL_AGENTS

cat > "$REPO_ABS/AGENTS.md" <<EOF_REPO_AGENTS
# AGENTS.md

## Repository rules

- Respect the existing architecture and naming.
- Avoid broad refactors unless explicitly requested.
- Prefer safe incremental fixes over clever rewrites.
- If public behavior changes, update docs or examples when appropriate.
$MONOREPO_NOTE

## Validation commands
- Install: $INSTALL_CMD
- Lint: $LINT_CMD
- Typecheck: $TYPECHECK_CMD
- Unit tests: $UNIT_TEST_CMD
- Integration or E2E: $E2E_CMD
- Build: $BUILD_CMD
- Dev: $DEV_CMD

## Delivery format
- State root cause first.
- Then summarize the patch.
- Then report validation and residual risk.
EOF_REPO_AGENTS

cat > "$REPO_CODEX_DIR/config.toml" <<'EOF_REPO_CONFIG'
review_model = "gpt-5.4"

[agents]
max_threads = 6
max_depth = 1
EOF_REPO_CONFIG

cat > "$GLOBAL_AGENTS_DIR/explorer.toml" <<'EOF_EXPLORER'
name = "explorer"
description = "Read-only codebase explorer for mapping entry points, ownership, and execution paths."
model = "gpt-5.4-mini"
model_reasoning_effort = "medium"
sandbox_mode = "read-only"
developer_instructions = """
Stay in exploration mode.

Goals:
- map the real execution path
- identify entry points, key symbols, and owning files
- call out hidden risks, flags, env vars, and data flow
- recommend the smallest set of files to inspect next

Prefer local repo evidence first.
Use MCP only if local code is insufficient.
Do not edit files.
"""
nickname_candidates = ["Scout", "Radar", "Trace"]
EOF_EXPLORER

cat > "$GLOBAL_AGENTS_DIR/planner.toml" <<'EOF_PLANNER'
name = "planner"
description = "Structured planning agent for ambiguous or multi-step work before implementation."
model = "gpt-5.4"
model_reasoning_effort = "high"
sandbox_mode = "read-only"
developer_instructions = """
Plan first.

Produce:
- goal and constraints
- concrete task breakdown
- recommended order of execution
- validation plan
- key risks and fallback path

Use sequential_thinking only when the task is genuinely ambiguous or complex.
Do not edit files.
"""
nickname_candidates = ["North", "Atlas", "Vector"]
EOF_PLANNER

cat > "$GLOBAL_AGENTS_DIR/architect.toml" <<'EOF_ARCHITECT'
name = "architect"
description = "High-judgment design and refactor specialist for tradeoffs, interfaces, and migration plans."
model = "gpt-5.4"
model_reasoning_effort = "high"
sandbox_mode = "read-only"
developer_instructions = """
Focus on design quality, maintainability, and rollout risk.

Produce:
- one recommended approach
- one conservative fallback when relevant
- impacted modules and interfaces
- migration or rollout risks
- validation strategy

Use sequential_thinking only when it improves a non-trivial design decision.
Do not edit code unless explicitly asked.
Prefer incremental refactors over rewrites.
"""
nickname_candidates = ["Keystone", "Harbor", "Frame"]
EOF_ARCHITECT

cat > "$GLOBAL_AGENTS_DIR/worker.toml" <<'EOF_WORKER'
name = "worker"
description = "Default implementation agent for targeted code changes."
model = "gpt-5.4"
model_reasoning_effort = "medium"
sandbox_mode = "workspace-write"
developer_instructions = """
Own implementation once the task is understood.

Rules:
- make the smallest defensible change
- preserve existing style and architecture
- avoid touching unrelated files
- do not revert user changes you did not make
- after editing, run the most relevant targeted validation

Prefer local repo evidence first.
Use MCP only when it removes real uncertainty or is needed for evidence.

Return:
- root cause
- files changed
- why this patch is minimal
- validation results
- remaining risks
"""
nickname_candidates = ["Forge", "Patch", "Bolt"]
EOF_WORKER

cat > "$GLOBAL_AGENTS_DIR/reviewer.toml" <<'EOF_REVIEWER'
name = "reviewer"
description = "Final code reviewer focused on correctness, regressions, security, and missing tests."
model = "gpt-5.4"
model_reasoning_effort = "high"
sandbox_mode = "read-only"
developer_instructions = """
Review like an owner.

Prioritize:
- correctness bugs
- regressions
- security issues
- race conditions
- missing edge cases
- missing or weak tests

Use Context7 or OpenAI docs only when the patch depends on external or version-specific behavior.
Avoid style-only feedback unless it hides a real defect.
Do not edit files.
"""
nickname_candidates = ["Aegis", "Delta", "Sentinel"]
EOF_REVIEWER

cat > "$GLOBAL_AGENTS_DIR/tester.toml" <<'EOF_TESTER'
name = "tester"
description = "Validation specialist for reproducing bugs, running tests, and checking what actually changed."
model = "gpt-5.4-mini"
model_reasoning_effort = "medium"
sandbox_mode = "workspace-write"
developer_instructions = """
Focus on evidence.

Tasks:
- reproduce the issue or confirm the target behavior
- run the smallest useful test, lint, typecheck, or build command
- capture exact failures and exact passes
- prefer targeted commands over broad expensive runs
- do not change source code unless explicitly asked by the parent agent

Use browser MCP only for real UI or browser debugging.
Return:
- commands run
- result
- relevant output summary
- confidence level
"""
nickname_candidates = ["Probe", "Check", "Pulse"]
EOF_TESTER

cat > "$GLOBAL_AGENTS_DIR/docs_researcher.toml" <<'EOF_DOCS'
name = "docs_researcher"
description = "Documentation specialist for Node.js, JavaScript libraries, and OpenAI or Codex docs."
model = "gpt-5.4-mini"
model_reasoning_effort = "medium"
sandbox_mode = "read-only"
developer_instructions = """
Verify assumptions before implementation.

Check, in order:
- repo docs and local markdown
- package manifests, lockfiles, config files, and schemas
- Context7 for version-specific library or framework docs
- OpenAI docs MCP for OpenAI, Codex, MCP, or SDK questions

Return concise answers with exact references when available.
Do not edit code.
"""
nickname_candidates = ["Index", "Manual", "Spec"]
EOF_DOCS

cat > "$GLOBAL_AGENTS_DIR/browser_debugger.toml" <<'EOF_BROWSER'
name = "browser_debugger"
description = "Browser and UI debugger that reproduces issues and gathers evidence with Playwright and Chrome DevTools."
model = "gpt-5.4"
model_reasoning_effort = "high"
sandbox_mode = "workspace-write"
developer_instructions = """
Reproduce the issue in the browser and gather concrete evidence.

Prefer:
- Playwright MCP for deterministic flows and repeated repro steps
- Chrome DevTools MCP for console, network, screenshots, and performance details

Do not edit application code.
Report exact steps, observed behavior, and likely failure point.
"""
nickname_candidates = ["Viewport", "Console", "Replay"]
EOF_BROWSER

cat > "$GLOBAL_AGENTS_DIR/github_reader.toml" <<'EOF_GITHUB_AGENT'
name = "github_reader"
description = "GitHub specialist for reading PRs, issues, Actions, and remote repo metadata."
model = "gpt-5.4-mini"
model_reasoning_effort = "medium"
sandbox_mode = "read-only"
developer_instructions = """
Use GitHub MCP when the needed context lives in PRs, issues, workflow runs, discussions, or remote repo metadata.

Rules:
- prefer read-only investigation unless explicitly asked for a mutation
- summarize findings crisply
- if GitHub auth is unavailable, say so clearly
"""
nickname_candidates = ["Octo", "Merge", "Checks"]
EOF_GITHUB_AGENT

if [ "$ENABLE_FAST_PATCHER" = "1" ]; then
  cat > "$GLOBAL_AGENTS_DIR/fast_patcher.toml" <<'EOF_FAST'
name = "fast_patcher"
description = "Optional ultra-fast patcher for tiny, well-understood edits."
model = "gpt-5.3-codex-spark"
model_reasoning_effort = "medium"
sandbox_mode = "workspace-write"
developer_instructions = """
Use only when the issue is already understood and the patch is small.

Good fits:
- renames
- typo fixes
- tiny guard clauses
- narrow config edits
- small test updates

Bad fits:
- architecture changes
- ambiguous bugs
- security-sensitive work
- multi-module redesign

Keep the patch tiny.
Run only targeted validation.
"""
nickname_candidates = ["Flash", "Quickfix", "Snap"]
EOF_FAST
else
  rm -f "$GLOBAL_AGENTS_DIR/fast_patcher.toml"
fi

cat > "$REPO_PLAYBOOK_DIR/node-bugfix.md" <<'EOF_BUGFIX'
# Node.js bugfix playbook

Use this workflow:

1. Spawn explorer and tester in parallel.
2. If the task is ambiguous, also spawn planner in parallel.
3. If external framework behavior matters, also spawn docs_researcher.
4. Wait for all planning agents.
5. Use worker to implement the smallest fix.
6. Use tester to rerun the most relevant validation.
7. Use reviewer for a final pass if the change is non-trivial.
8. Use browser_debugger only for UI, browser, console, network, or performance issues.
9. Use github_reader only when PR, issue, or Actions context matters.

Return:
- root cause
- patch summary
- files changed
- validation
- remaining risks
EOF_BUGFIX

cat > "$REPO_PLAYBOOK_DIR/node-feature.md" <<'EOF_FEATURE'
# Node.js feature playbook

Use this workflow:

1. Spawn planner, explorer, and reviewer in parallel.
2. If the feature depends on an external library or framework, also spawn docs_researcher.
3. Wait for all planning agents.
4. If the design has meaningful tradeoffs, spawn architect.
5. Use worker to implement in small increments.
6. Use tester for targeted validation.
7. Use reviewer for a final pass.
8. Use browser_debugger only for browser-facing behavior.
9. Use github_reader only for remote project context.

Return:
- implementation plan used
- files changed
- validation
- follow-up debt or nice-to-haves
EOF_FEATURE

cat > "$REPO_PLAYBOOK_DIR/node-refactor.md" <<'EOF_REFACTOR'
# Node.js refactor playbook

Use this workflow:

1. Spawn planner, explorer, architect, and reviewer in parallel.
2. If external API behavior matters, also spawn docs_researcher.
3. Wait for all planning agents.
4. Produce a conservative refactor plan with rollback points.
5. Use worker to implement in small safe steps.
6. Use tester after each meaningful step or at least at the end.
7. Use reviewer again for a final pass.

Return:
- refactor goal
- migration steps performed
- validation
- residual risk
EOF_REFACTOR

cat > "$REPO_PLAYBOOK_DIR/prompts-cs.md" <<'EOF_PROMPTS'
# Ceske prompty pro paralelni subagenty

## Kratky univerzalni prompt

Pouzij paralelni subagenty. Nejdriv spust planner, explorer a reviewer soucasne. Kdyz jde o externi framework nebo knihovnu, pridej i docs_researcher. Pockej na vsechny vysledky, spoj zavery do jednoho planu a az potom implementuj pres worker. Nakonec proved cilenou validaci pres tester a vypis: root cause, zmenene soubory, validaci a zbyvajici rizika.

## Bugfix

Pouzij playbook .codex/playbooks/node-bugfix.md pro tento ukol: <sem vloz zadani>. Pracuj paralelne, pockej na vsechny subagenty a teprve potom implementuj.

## Feature

Pouzij playbook .codex/playbooks/node-feature.md pro tento ukol: <sem vloz zadani>. Pracuj paralelne, pockej na vsechny subagenty a teprve potom implementuj.

## Refactor

Pouzij playbook .codex/playbooks/node-refactor.md pro tento ukol: <sem vloz zadani>. Pracuj paralelne, pockej na vsechny subagenty a teprve potom implementuj.
EOF_PROMPTS

cat > "$REPO_CODEX_DIR/CODEX_SETUP.md" <<EOF_SETUP
# Codex setup summary

This repo was configured by codex_portable_node_all_agents_mcp.sh.

## What was set up

- Global config: $CODEX_HOME/config.toml
- Global rules: $CODEX_HOME/AGENTS.md
- Global custom agents: $GLOBAL_AGENTS_DIR
- Repo rules: $REPO_ABS/AGENTS.md
- Repo playbooks: $REPO_PLAYBOOK_DIR

## Available agents

- explorer
- planner
- architect
- worker
- reviewer
- tester
- docs_researcher
- browser_debugger
- github_reader
EOF_SETUP

if [ "$ENABLE_FAST_PATCHER" = "1" ]; then
  cat >> "$REPO_CODEX_DIR/CODEX_SETUP.md" <<'EOF_FAST_NOTE'
- fast_patcher
EOF_FAST_NOTE
fi

cat >> "$REPO_CODEX_DIR/CODEX_SETUP.md" <<EOF_SETUP2

## MCP notes

These MCP servers are configured at the top level so all agents can inherit them:
- openaiDeveloperDocs
- context7
- sequential_thinking
- playwright
- chrome_devtools
EOF_SETUP2

if [ -n "${GITHUB_PAT:-}" ]; then
  cat >> "$REPO_CODEX_DIR/CODEX_SETUP.md" <<'EOF_SETUP_GITHUB'
- github
EOF_SETUP_GITHUB
else
  cat >> "$REPO_CODEX_DIR/CODEX_SETUP.md" <<'EOF_SETUP_GITHUB_NOTE'

GitHub MCP was not enabled because GITHUB_PAT was not set when the script ran.
If you want GitHub MCP later, export GITHUB_PAT and re-run this script.
EOF_SETUP_GITHUB_NOTE
fi

cat >> "$REPO_CODEX_DIR/CODEX_SETUP.md" <<'EOF_SETUP3'

## Recommended verification

1. Restart Codex completely.
2. Run /status
3. Run /mcp
4. Ask Codex to summarize the current rules.
5. Use one of the prompts in .codex/playbooks/prompts-cs.md
EOF_SETUP3

printf '\n[OK] Portable Codex Node.js setup installed.\n'
printf 'Repo: %s\n' "$REPO_ABS"
printf 'Global config: %s/config.toml\n' "$CODEX_HOME"
printf 'Global agents: %s\n' "$GLOBAL_AGENTS_DIR"
printf 'Repo playbooks: %s\n' "$REPO_PLAYBOOK_DIR"
if [ -n "${GITHUB_PAT:-}" ]; then
  printf 'GitHub MCP: enabled via GITHUB_PAT\n'
else
  printf 'GitHub MCP: not enabled (export GITHUB_PAT and re-run if you want it)\n'
fi
printf '\nNext steps:\n'
printf '1) Restart Codex completely.\n'
printf '2) Start Codex in the repo.\n'
printf '3) Run /mcp and /status.\n'
printf '4) Use .codex/playbooks/prompts-cs.md as your prompt source.\n\n'
