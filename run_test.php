<?php
header('Content-Type: text/plain');
echo "=== TEST DE L'APPLICATION GREEN MARKET TECHNOLOGY ===\n\n";

// Architecture : React (Vite) + Express.js TypeScript
$mamp_url    = "http://localhost:8888/green-tech-hub"; // MAMP/Apache — scripts PHP
$backend_url = "http://localhost:4000";                // Express.js API
$frontend_url = "http://localhost:5173";               // Vite dev server

function test_endpoint($name, $url) {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 5);
    $response = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($http_code >= 200 && $http_code < 300) {
        echo "✅ [SUCCESS] $name : Status $http_code\n";
        return true;
    } else {
        echo "❌ [FAILED]  $name : Status $http_code (Vérifiez l'URL: $url)\n";
        return false;
    }
}

// --- LISTE DES TESTS ---

// 1. Test de la connexion DB MySQL (MAMP)
test_endpoint("Connexion Base de données", "$mamp_url/check_conn.php");

// 2. Test santé du backend Express.js (port 4000)
test_endpoint("Backend Express (health)", "$backend_url/health");

// 3. Test de l'API Produits — Express.js /api/v1/products
test_endpoint("API Liste des Produits", "$backend_url/api/v1/products");

// 4. Test du frontend React (Vite dev server, port 5173)
test_endpoint("Chargement Frontend (Vite)", "$frontend_url");

// 5. Test de sécurité — /api/v1/admin doit retourner 401 sans token
$ch = curl_init("$backend_url/api/v1/admin");
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 5);
curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
if ($status == 401 || $status == 403) {
    echo "✅ [SECURITY] Accès Admin protégé : Status $status\n";
} else {
    echo "⚠️ [WARNING] Accès Admin non sécurisé : Status $status\n";
}

echo "\n=== FIN DES TESTS ===";
