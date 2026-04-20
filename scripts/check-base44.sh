#!/usr/bin/env bash
# =============================================================
# Script de vérification — aucune référence Base44 ne doit
# subsister dans le code source après migration.
# Usage : bash scripts/check-base44.sh
# =============================================================

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/src"
ERRORS=0

echo ""
echo "════════════════════════════════════════════"
echo "  Green Market Technology — Audit Base44"
echo "════════════════════════════════════════════"
echo ""

# ── 1. Imports actifs de @base44/sdk ────────────────────────
echo "▶ 1. Imports actifs de @base44/sdk (hors fichiers stub)"
HITS=$(grep -rn --include="*.{js,jsx,ts,tsx}" "@base44/sdk" "$SRC" \
  | grep -v "base44Client.js" \
  | grep -v "app-params.js")
if [ -z "$HITS" ]; then
  echo "   ✅  Aucune référence active trouvée"
else
  echo "   ❌  Références trouvées :"
  echo "$HITS" | sed 's/^/      /'
  ERRORS=$((ERRORS + 1))
fi
echo ""

# ── 2. Appels base44.entities / base44.auth ──────────────────
echo "▶ 2. Appels base44.entities.* / base44.auth.*"
HITS=$(grep -rn --include="*.{js,jsx,ts,tsx}" "base44\.entities\|base44\.auth\." "$SRC")
if [ -z "$HITS" ]; then
  echo "   ✅  Aucun appel Base44 trouvé"
else
  echo "   ❌  Appels trouvés :"
  echo "$HITS" | sed 's/^/      /'
  ERRORS=$((ERRORS + 1))
fi
echo ""

# ── 3. Import du base44Client (doit seulement exister dans le stub) ──
echo "▶ 3. Imports de @/api/base44Client (hors stub lui-même)"
HITS=$(grep -rn --include="*.{js,jsx,ts,tsx}" "base44Client" "$SRC" \
  | grep -v "src/api/base44Client.js")
if [ -z "$HITS" ]; then
  echo "   ✅  Aucun import résiduel de base44Client"
else
  echo "   ❌  Imports trouvés :"
  echo "$HITS" | sed 's/^/      /'
  ERRORS=$((ERRORS + 1))
fi
echo ""

# ── 4. createAxiosClient de Base44 SDK ──────────────────────
echo "▶ 4. createAxiosClient (Base44 SDK)"
HITS=$(grep -rn --include="*.{js,jsx,ts,tsx}" "createAxiosClient\|createClient" "$SRC")
if [ -z "$HITS" ]; then
  echo "   ✅  Aucune occurrence"
else
  echo "   ❌  Occurrences trouvées :"
  echo "$HITS" | sed 's/^/      /'
  ERRORS=$((ERRORS + 1))
fi
echo ""

# ── 5. Plugin Base44 dans vite.config.js ────────────────────
echo "▶ 5. Plugin @base44/vite-plugin dans vite.config.js"
HITS=$(grep -n "base44\|@base44" "$ROOT/vite.config.js" 2>/dev/null)
if [ -z "$HITS" ]; then
  echo "   ✅  vite.config.js propre"
else
  echo "   ❌  Références trouvées dans vite.config.js :"
  echo "$HITS" | sed 's/^/      /'
  ERRORS=$((ERRORS + 1))
fi
echo ""

# ── 6. Dépendances package.json ──────────────────────────────
echo "▶ 6. Dépendances @base44/* dans package.json"
HITS=$(grep "@base44" "$ROOT/package.json" 2>/dev/null)
if [ -z "$HITS" ]; then
  echo "   ✅  package.json propre"
else
  echo "   ❌  Dépendances trouvées :"
  echo "$HITS" | sed 's/^/      /'
  ERRORS=$((ERRORS + 1))
fi
echo ""

# ── 7. Clés localStorage base44_* ────────────────────────────
echo "▶ 7. Clés localStorage base44_* dans le code actif"
HITS=$(grep -rn --include="*.{js,jsx,ts,tsx}" "base44_" "$SRC" \
  | grep -v "app-params.js")
if [ -z "$HITS" ]; then
  echo "   ✅  Aucune clé localStorage base44_*"
else
  echo "   ❌  Clés trouvées :"
  echo "$HITS" | sed 's/^/      /'
  ERRORS=$((ERRORS + 1))
fi
echo ""

# ── Bilan ────────────────────────────────────────────────────
echo "════════════════════════════════════════════"
if [ "$ERRORS" -eq 0 ]; then
  echo "  ✅  Migration complète — aucune référence Base44 active"
else
  echo "  ❌  $ERRORS vérification(s) échouée(s) — voir détails ci-dessus"
fi
echo "════════════════════════════════════════════"
echo ""
exit $ERRORS
