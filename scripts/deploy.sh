#!/usr/bin/env bash
#
# Backend deployment — SSH to VPS, git pull, install/migrate if needed, restart pm2.
#
# Usage:
#   npm run deploy           # full deploy
#   npm run deploy -- --no-restart   # skip pm2 restart (for read-only updates)
#
# Reads credentials from .env.deploy (gitignored).
# Assumes you've already pushed your commits to GitHub origin/main.

set -euo pipefail

# ─── Locate repo root ────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env.deploy"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ $ENV_FILE not found."
  echo "   Copy .env.deploy.example to .env.deploy and fill in credentials."
  exit 1
fi

# ─── Load env (export each KEY=VALUE) ────────────────────────────────────────
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${SSH_HOST:?SSH_HOST missing in .env.deploy}"
: "${SSH_USER:?SSH_USER missing in .env.deploy}"
: "${SSH_PASS:?SSH_PASS missing in .env.deploy}"
: "${REMOTE_PATH:?REMOTE_PATH missing in .env.deploy}"
PM2_NAME="${PM2_NAME:-jewelcart-backend}"
GIT_BRANCH="${GIT_BRANCH:-main}"

# ─── Verify sshpass ──────────────────────────────────────────────────────────
if ! command -v sshpass >/dev/null 2>&1; then
  echo "❌ sshpass not installed."
  echo "   macOS: brew install hudochenkov/sshpass/sshpass"
  echo "   Linux: apt install sshpass"
  exit 1
fi

# ─── Warn about uncommitted local changes ────────────────────────────────────
cd "$REPO_ROOT"
if [[ -n "$(git status --porcelain 2>/dev/null || true)" ]]; then
  echo "⚠  You have uncommitted local changes."
  echo "   The deploy will pull whatever's in origin/$GIT_BRANCH on GitHub —"
  echo "   make sure you've pushed your commits first."
  read -rp "Continue anyway? (y/N) " -n 1
  echo
  [[ "${REPLY:-}" =~ ^[Yy]$ ]] || exit 1
fi

LOCAL_HEAD="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
SHORT="$(git log -1 --oneline 2>/dev/null || echo '(no git)')"

echo "→ Deploying $REMOTE_PATH on $SSH_HOST"
echo "  Local HEAD: $SHORT"
echo

# ─── SSH-side script ─────────────────────────────────────────────────────────
SKIP_RESTART="${1:-}"
RESTART_CMD=""
if [[ "$SKIP_RESTART" != "--no-restart" ]]; then
  RESTART_CMD="echo '→ Restarting pm2 ($PM2_NAME)...' && pm2 restart $PM2_NAME --update-env"
fi

REMOTE_SCRIPT=$(cat <<EOF
set -e
cd $REMOTE_PATH

echo "→ Fetching origin/$GIT_BRANCH..."
git fetch origin $GIT_BRANCH

REMOTE_BEFORE=\$(git rev-parse HEAD)
REMOTE_AFTER=\$(git rev-parse origin/$GIT_BRANCH)

if [[ "\$REMOTE_BEFORE" == "\$REMOTE_AFTER" ]]; then
  echo "  already at \$(git log -1 --oneline) — nothing to pull"
else
  echo "→ Pulling \$REMOTE_BEFORE → \$REMOTE_AFTER"
  git pull --ff-only origin $GIT_BRANCH
fi

# Install deps if package.json changed in this pull
if git diff --name-only "\$REMOTE_BEFORE..\$REMOTE_AFTER" 2>/dev/null | grep -qE '(package(-lock)?\.json)$'; then
  echo "→ package.json changed — running npm install"
  npm install --production
fi

# Regenerate Prisma client if schema changed
if git diff --name-only "\$REMOTE_BEFORE..\$REMOTE_AFTER" 2>/dev/null | grep -q 'prisma/schema.prisma'; then
  echo "→ schema.prisma changed — regenerating Prisma client + pushing schema"
  npx prisma generate
  npx prisma db push --skip-generate --accept-data-loss
fi

$RESTART_CMD

echo "✓ Deployed at \$(git log -1 --oneline)"
EOF
)

# ─── Run via sshpass ─────────────────────────────────────────────────────────
sshpass -p "$SSH_PASS" ssh \
  -o StrictHostKeyChecking=no \
  -o ConnectTimeout=15 \
  "$SSH_USER@$SSH_HOST" "$REMOTE_SCRIPT"

echo
echo "✓ Backend deployed to $SSH_HOST"
