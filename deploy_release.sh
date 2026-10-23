#!/usr/bin/env bash
# ==============================================================================
# deploy_release.sh - Build, Package and Release Verkehrssimulation
# ==============================================================================
set -euo pipefail

# ANSI Colors
BOLD='\033[1m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log_info()    { echo -e "${BLUE}${BOLD}[INFO]${NC} $*"; }
log_success() { echo -e "${GREEN}${BOLD}[SUCCESS]${NC} $*"; }
log_warn()    { echo -e "${YELLOW}${BOLD}[WARN]${NC} $*"; }
log_error()   { echo -e "${RED}${BOLD}[ERROR]${NC} $*" >&2; }

# Usage Information
usage() {
    cat <<EOF
Verwendung: ./deploy_release.sh [OPTIONEN] [VERSION]

Optionen:
  -b, --build-only      Nur Release-Archiv in dist/ bauen (Standard)
  -c, --cf-deploy       Release zu Cloudflare Workers ausrollen (wrangler deploy)
  -g, --github-release  Git-Tag setzen, pushen und GitHub-Release erstellen
  -a, --all             Build, Cloudflare Deploy und GitHub Release ausführen
  -h, --help            Diese Hilfe anzeigen

Beispiele:
  ./deploy_release.sh                     # Archiv bauen
  ./deploy_release.sh --cf-deploy         # Archiv bauen & zu Cloudflare deployen
  ./deploy_release.sh --all               # Vollständiger Release-Zyklus (Build, CF & GitHub)
EOF
}

PROJECT_NAME="verkehrssimulation"
AUTHOR_NAME="mrgoldsmitt"
AUTHOR_EMAIL="88801109+mrgoldsmitt@users.noreply.github.com"

# Ensure script is executed from the project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

DO_CF_DEPLOY=false
DO_GH_RELEASE=false
EXPLICIT_VERSION=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        -b|--build-only)
            ;;
        -c|--cf-deploy)
            DO_CF_DEPLOY=true
            ;;
        -g|--github-release)
            DO_GH_RELEASE=true
            ;;
        -a|--all)
            DO_CF_DEPLOY=true
            DO_GH_RELEASE=true
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        v[0-9]*|[0-9]*)
            EXPLICIT_VERSION="$1"
            ;;
        *)
            log_error "Unbekannte Option: $1"
            usage
            exit 1
            ;;
    esac
    shift
done

# 1. Determine Version
if [ -n "${EXPLICIT_VERSION}" ]; then
    VERSION_TAG="${EXPLICIT_VERSION}"
    [[ "${VERSION_TAG}" != v* ]] && VERSION_TAG="v${VERSION_TAG}"
else
    DETECTED=$(grep -o 'class="app-version">v[^<]*' index.html | head -n1 | sed 's/class="app-version">//' || true)
    if [ -z "${DETECTED}" ]; then
        DETECTED=$(grep -o "verkehrssim-v[0-9.]*" sw.js | head -n1 | sed 's/verkehrssim-//' || true)
    fi
    VERSION_TAG="${DETECTED:-v0.1.0}"
fi

RAW_VERSION="${VERSION_TAG#v}"
log_info "Projektversion: ${BOLD}${VERSION_TAG}${NC} (${RAW_VERSION})"

# 2. Check Git Configuration
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    log_info "Initialisiere Git-Repository..."
    git init -b main
fi

git config user.name "${AUTHOR_NAME}"
git config user.email "${AUTHOR_EMAIL}"

# 3. Create Distribution Package
DIST_DIR="${SCRIPT_DIR}/dist"
ARCHIVE_NAME="${PROJECT_NAME}-${VERSION_TAG}.zip"
ARCHIVE_PATH="${DIST_DIR}/${ARCHIVE_NAME}"
CHECKSUM_PATH="${DIST_DIR}/${PROJECT_NAME}-${VERSION_TAG}.sha256"

mkdir -p "${DIST_DIR}"
log_info "Erstelle Release-Paket: ${ARCHIVE_PATH}..."
rm -f "${ARCHIVE_PATH}" "${CHECKSUM_PATH}"

zip -q -r "${ARCHIVE_PATH}" \
    index.html \
    style.css \
    app.js \
    sw.js \
    manifest.json \
    favicon.svg \
    worker.js \
    wrangler.toml \
    README.md \
    LICENSE

# Generate SHA-256 Checksum
if command -v shasum >/dev/null 2>&1; then
    (cd "${DIST_DIR}" && shasum -a 256 "${ARCHIVE_NAME}" > "$(basename "${CHECKSUM_PATH}")")
elif command -v sha256sum >/dev/null 2>&1; then
    (cd "${DIST_DIR}" && sha256sum "${ARCHIVE_NAME}" > "$(basename "${CHECKSUM_PATH}")")
fi

log_success "Paket erfolgreich erstellt ($(du -h "${ARCHIVE_PATH}" | cut -f1))"
if [[ -f "${CHECKSUM_PATH}" ]]; then
    log_info "SHA256: $(cat "${CHECKSUM_PATH}")"
fi

# 4. Optional Cloudflare Deployment
if [[ "${DO_CF_DEPLOY}" == true ]]; then
    log_info "Rolle Anwendung zu Cloudflare Workers aus (wrangler deploy)..."
    npx wrangler deploy
    log_success "Cloudflare Deployment erfolgreich abgeschlossen!"
fi

# 5. Optional Git Commit, Push & GitHub Release
if [[ "${DO_GH_RELEASE}" == true ]]; then
    if [ -n "$(git status --porcelain)" ]; then
        log_info "Committe Änderungen..."
        git add .
        git commit -m "release: ${VERSION_TAG}"
    fi

    if git rev-parse "${VERSION_TAG}" >/dev/null 2>&1; then
        log_warn "Git-Tag ${VERSION_TAG} existiert bereits lokal."
    else
        log_info "Erstelle Git-Tag: ${VERSION_TAG}..."
        git tag -a "${VERSION_TAG}" -m "Release ${VERSION_TAG}"
    fi

    if git remote get-url origin >/dev/null 2>&1; then
        CURRENT_BRANCH=$(git branch --show-current)
        log_info "Pushe Branch '${CURRENT_BRANCH}' und Tags zu 'origin'..."
        git push -u origin "${CURRENT_BRANCH}"
        git push origin "${VERSION_TAG}"

        if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
            log_info "Prüfe GitHub Release ${VERSION_TAG}..."
            NOTES="Verkehrssimulation ${VERSION_TAG}

- Vollständiges Release-Archiv inklusive IDM-Physikmodell, Szenarien & PWA-Assets
- Cloudflare Workers Edge Deployment (https://verkehrssimulation.sebastian-d19.workers.dev)
- SHA-256 Prüfsumme: $(cat "${CHECKSUM_PATH}" 2>/dev/null || echo 'N/A')"

            if gh release view "${VERSION_TAG}" >/dev/null 2>&1; then
                log_info "GitHub Release ${VERSION_TAG} existiert bereits. Aktualisiere Assets..."
                gh release upload "${VERSION_TAG}" "${ARCHIVE_PATH}" "${CHECKSUM_PATH}" --clobber
            else
                log_info "Erstelle GitHub Release ${VERSION_TAG}..."
                gh release create "${VERSION_TAG}" "${ARCHIVE_PATH}" "${CHECKSUM_PATH}" \
                    --title "Verkehrssimulation ${VERSION_TAG}" \
                    --notes "${NOTES}"
            fi
            log_success "GitHub Release ${VERSION_TAG} erfolgreich veröffentlicht!"
        fi
    fi
fi

log_success "Alle Aufgaben für ${VERSION_TAG} abgeschlossen!"
