<?php
$config = [
    'host' => 'localhost',
    'port' => 8889, // Port MySQL par défaut de MAMP
    'db'   => 'green_market_db',
    'user' => 'root',
    'pass' => 'root' // Mot de passe par défaut sur MAMP
];

try {
    $dsn = "mysql:host={$config['host']};port={$config['port']};dbname={$config['db']};charset=utf8mb4";
    $pdo = new PDO($dsn, $config['user'], $config['pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
    ]);
    echo "✅ Succès : Connexion établie avec la base '{$config['db']}'.";
} catch (PDOException $e) {
    echo "❌ Échec : " . $e->getMessage();
}
?>
