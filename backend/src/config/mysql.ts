/**
 * Connexion MySQL sécurisée pour MAMP — Green Market Technology
 * Utilise mysql2/promise (requêtes préparées natives, protection injection SQL)
 *
 * Installation : npm install mysql2
 * Usage        : import pool from './config/mysql';
 */

import mysql from 'mysql2/promise';
import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';

// ─── Configuration ────────────────────────────────────────────────────────────
const DB_CONFIG: mysql.PoolOptions = {
  host:               process.env.MYSQL_HOST     ?? 'localhost',
  port:               Number(process.env.MYSQL_PORT ?? 8889),   // Port MAMP par défaut
  user:               process.env.MYSQL_USER     ?? 'root',
  password:           process.env.MYSQL_PASSWORD ?? 'root',
  database:           process.env.MYSQL_DATABASE ?? 'green_market_db',
  charset:            'utf8mb4',
  timezone:           '+00:00',
  waitForConnections: true,
  connectionLimit:    10,     // max connexions simultanées
  queueLimit:         0,
  enableKeepAlive:    true,
  keepAliveInitialDelay: 30000,
};

// ─── Pool de connexions ────────────────────────────────────────────────────────
let pool: Pool;

function getPool(): Pool {
  if (!pool) {
    pool = mysql.createPool(DB_CONFIG);
  }
  return pool;
}

// ─── Test de connexion (à appeler au démarrage du serveur) ─────────────────────
export async function testConnection(): Promise<void> {
  let conn: PoolConnection | null = null;
  try {
    conn = await getPool().getConnection();
    const [rows] = await conn.query<RowDataPacket[]>('SELECT 1 + 1 AS result');
    console.log(`✅ MySQL connecté — green_market_db (MAMP :${DB_CONFIG.port}) | test: ${rows[0].result}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`❌ Échec connexion MySQL : ${message}`);
    // On propage pour bloquer le démarrage si la DB est indisponible
    throw new Error(`Connexion MySQL impossible : ${message}`);
  } finally {
    conn?.release();
  }
}

// ─── Requêtes préparées — fonctions utilitaires ────────────────────────────────

/**
 * Exécute un SELECT et retourne les lignes.
 * Les paramètres sont passés via placeholders `?` — jamais interpolés.
 *
 * @example
 * const products = await query<ProductRow>(
 *   'SELECT * FROM products WHERE eco_score > ? AND is_active = ?',
 *   [80, 1]
 * );
 */
export async function query<T extends RowDataPacket>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  try {
    const [rows] = await getPool().execute<T[]>(sql, params);
    return rows;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Erreur requête SQL : ${message}`);
  }
}

/**
 * Exécute un INSERT / UPDATE / DELETE et retourne les métadonnées.
 *
 * @example
 * const result = await execute(
 *   'INSERT INTO users (id, email, password_hash, full_name) VALUES (UUID(), ?, ?, ?)',
 *   [email, hash, fullName]
 * );
 * console.log(result.affectedRows);
 */
export async function execute(
  sql: string,
  params: unknown[] = []
): Promise<ResultSetHeader> {
  try {
    const [result] = await getPool().execute<ResultSetHeader>(sql, params);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Erreur exécution SQL : ${message}`);
  }
}

/**
 * Exécute plusieurs requêtes dans une transaction atomique.
 * Rollback automatique en cas d'erreur.
 *
 * @example
 * await withTransaction(async (conn) => {
 *   await conn.execute('INSERT INTO orders ...', [...]);
 *   await conn.execute('UPDATE stocks SET quantity = quantity - ? WHERE product_id = ?', [qty, id]);
 * });
 */
export async function withTransaction(
  callback: (conn: PoolConnection) => Promise<void>
): Promise<void> {
  const conn = await getPool().getConnection();
  await conn.beginTransaction();
  try {
    await callback(conn);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Transaction annulée : ${message}`);
  } finally {
    conn.release();
  }
}

// ─── Exemples de requêtes métier sécurisées ───────────────────────────────────

export const ProductQueries = {

  /** Récupère tous les produits actifs triés par eco_score */
  findAll: () =>
    query<RowDataPacket>(
      'SELECT id, nom, prix, currency, stock, empreinte_co2, eco_score, image_url FROM products WHERE is_active = ? ORDER BY eco_score DESC',
      [1]
    ),

  /** Recherche par SKU — requête préparée, aucune injection possible */
  findBySku: (sku: string) =>
    query<RowDataPacket>(
      'SELECT * FROM products WHERE sku = ? AND is_active = ? LIMIT 1',
      [sku, 1]
    ),

  /** Mise à jour du stock — transaction recommandée */
  decrementStock: (conn: PoolConnection, productId: string, qty: number) =>
    conn.execute(
      'UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?',
      [qty, productId, qty]
    ),
};

export const OrderQueries = {

  /** Crée une commande + ses lignes dans une transaction */
  create: async (
    userId: string,
    totalPrix: number,
    items: Array<{ productId: string; nom: string; quantite: number; prixUnitaire: number }>
  ): Promise<string> => {
    const orderId = crypto.randomUUID();
    const orderNumber = `ORD-${Date.now()}`;

    await withTransaction(async (conn) => {
      await conn.execute(
        `INSERT INTO orders (id, order_number, user_id, total_prix, subtotal, statut)
         VALUES (?, ?, ?, ?, ?, 'PENDING')`,
        [orderId, orderNumber, userId, totalPrix, totalPrix]
      );

      for (const item of items) {
        await conn.execute(
          `INSERT INTO order_items (id, order_id, product_id, name_snapshot, quantite, prix_unitaire, total_price)
           VALUES (UUID(), ?, ?, ?, ?, ?, ?)`,
          [orderId, item.productId, item.nom, item.quantite, item.prixUnitaire, item.quantite * item.prixUnitaire]
        );
        await ProductQueries.decrementStock(conn, item.productId, item.quantite);
      }
    });

    return orderId;
  },
};

export default getPool;
