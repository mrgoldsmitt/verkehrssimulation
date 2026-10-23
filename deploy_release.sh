#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Deployment & Release Script for Verkehrssimulation
# ==============================================================================

PROJECT_NAME="verkehrssimulation"
AUTHOR_NAME="mrgoldsmitt"
AUTHOR_EMAIL="88801109+mrgoldsmitt@users.noreply.github.com"

# Ensure script is executed from the project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

# 1. Determine Version
if [ -n "${1:-}" ]; then
    VERSION_TAG="${1}"
    # Ensure leading 'v'
    [[ "${VERSION_TAG}" != v* ]] && VERSION_TAG="v${VERSION_TAG}"
else
    # Auto-detect from index.html or sw.js
    DETECTED=$(grep -o 'class="app-version">v[^<]*' index.html | head -n1 | sed 's/class="app-version">//' || true)
    if [ -z "${DETECTED}" ]; then
        DETECTED=$(grep -o "verkehrssim-v[0-9.]*" sw.js | head -n1 | sed 's/verkehrssim-//' || true)
    fi
    VERSION_TAG="${DETECTED:-v1.0.0}"
fi

RAW_VERSION="${VERSION_TAG#v}"
echo "==> Ziel-Version: ${VERSION_TAG} (${RAW_VERSION})"

# 2. Check Git Configuration
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "==> Initialisiere Git-Repository..."
    git init -b main
fi

git config user.name "${AUTHOR_NAME}"
git config user.email "${AUTHOR_EMAIL}"

# 3. Create Distribution Package
DIST_DIR="${SCRIPT_DIR}/dist"
ARCHIVE_NAME="${PROJECT_NAME}-${VERSION_TAG}.zip"
mkdir -p "${DIST_DIR}"

echo "==> Erstelle Release-Paket: dist/${ARCHIVE_NAME}..."
rm -f "${DIST_DIR}/${ARCHIVE_NAME}"
zip -q -r "${DIST_DIR}/${ARCHIVE_NAME}" \
    index.html \
    style.css \
    app.js \
    sw.js \
    manifest.json \
    favicon.svg \
    README.md \
    LICENSE

echo "==> Paket erfolgreich erstellt ($(du -h "${DIST_DIR}/${ARCHIVE_NAME}" | cut -f1))"

# 4. Check Git Status & Commit
if [ -n "$(git status --porcelain)" ]; then
    echo "==> Committe Änderungen..."
    git add .
    git commit -m "release: ${VERSION_TAG}"
fi

# 5. Git Tag
if git rev-parse "${VERSION_TAG}" >/dev/null 2>&1; then
    echo "==> Tag ${VERSION_TAG} existiert bereits lokal."
else
    echo "==> Erstelle Git-Tag: ${VERSION_TAG}..."
    git tag -a "${VERSION_TAG}" -m "Release ${VERSION_TAG}"
fi

# 6. Push to Remote & Create GitHub Release (if remote exists and gh is authenticated)
if git remote get-url origin >/dev/null 2>&1; then
    CURRENT_BRANCH=$(git branch --show-current)
    echo "==> Pushe Branch '${CURRENT_BRANCH}' und Tags zu 'origin'..."
    git push -u origin "${CURRENT_BRANCH}"
    git push origin "${VERSION_TAG}"

    if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
        echo "==> Prüfe GitHub Release..."
        if gh release view "${VERSION_TAG}" >/dev/null 2>&1; then
            echo "==> GitHub Release ${VERSION_TAG} existiert bereits."
        else
            echo "==> Erstelle GitHub Release ${VERSION_TAG} mit Artefakt..."
            gh release create "${VERSION_TAG}" "${DIST_DIR}/${ARCHIVE_NAME}" \
                --title "Verkehrssimulation ${VERSION_TAG}" \
                --generate-notes
            echo "==> GitHub Release erfolgreich veröffentlicht!"
        fi
    fi
else
    echo "==> Hinweis: Kein Remote 'origin' konfiguriert. Push und GitHub Release übersprungen."
fi

echo "==> Fertig!"
