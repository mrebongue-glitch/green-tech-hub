-- =============================================================
--  GREEN MARKET TECHNOLOGY — Script SQL complet (MySQL / MAMP)
--  Encodage : utf8mb4_unicode_ci
--  Exécuter via : phpMyAdmin > Onglet SQL > Coller > Exécuter
-- =============================================================

-- ─────────────────────────────────────────────
-- 0. Création et sélection de la base
-- ─────────────────────────────────────────────
CREATE DATABASE IF NOT EXISTS `green_market_db`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `green_market_db`;

-- ─────────────────────────────────────────────
-- 1. TABLE : users
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `users` (
  `id`             CHAR(36)        NOT NULL DEFAULT (UUID()),
  `email`          VARCHAR(255)    NOT NULL,
  `password_hash`  VARCHAR(255)    NOT NULL,
  `full_name`      VARCHAR(150)    NOT NULL,
  `role`           ENUM('CUSTOMER','ADMIN','SUPER_ADMIN') NOT NULL DEFAULT 'CUSTOMER',
  `is_active`      TINYINT(1)      NOT NULL DEFAULT 1,
  `date_creation`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────
-- 2. TABLE : products
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `products` (
  `id`              CHAR(36)        NOT NULL DEFAULT (UUID()),
  `sku`             VARCHAR(100)    NOT NULL,
  `nom`             VARCHAR(255)    NOT NULL,
  `description`     TEXT,
  `prix`            DECIMAL(12,2)   NOT NULL,
  `currency`        CHAR(3)         NOT NULL DEFAULT 'XAF',
  `stock`           INT UNSIGNED    NOT NULL DEFAULT 0,
  `empreinte_co2`   DECIMAL(8,4)    DEFAULT NULL COMMENT 'kg CO₂ par unité',
  `eco_score`       TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Score écologique 0-100',
  `image_url`       VARCHAR(500)    DEFAULT NULL,
  `is_active`       TINYINT(1)      NOT NULL DEFAULT 1,
  `date_creation`   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_products_sku` (`sku`),
  KEY `idx_products_eco_score` (`eco_score`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────
-- 3. TABLE : orders
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `orders` (
  `id`              CHAR(36)        NOT NULL DEFAULT (UUID()),
  `order_number`    VARCHAR(50)     NOT NULL,
  `user_id`         CHAR(36)        NOT NULL,
  `subtotal`        DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
  `tax_amount`      DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
  `shipping_amount` DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
  `total_prix`      DECIMAL(12,2)   NOT NULL,
  `currency`        CHAR(3)         NOT NULL DEFAULT 'XAF',
  `statut`          ENUM('PENDING','CONFIRMED','PROCESSING','SHIPPED','DELIVERED','CANCELLED','REFUNDED')
                    NOT NULL DEFAULT 'PENDING',
  `total_carbon_kg` DECIMAL(10,4)   DEFAULT NULL,
  `date_commande`   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_orders_number` (`order_number`),
  KEY `idx_orders_user_id` (`user_id`),
  KEY `idx_orders_statut`  (`statut`),
  CONSTRAINT `fk_orders_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────
-- 4. TABLE : order_items
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `order_items` (
  `id`            CHAR(36)      NOT NULL DEFAULT (UUID()),
  `order_id`      CHAR(36)      NOT NULL,
  `product_id`    CHAR(36)      NOT NULL,
  `name_snapshot` VARCHAR(255)  NOT NULL COMMENT 'Nom du produit figé à la commande',
  `quantite`      INT UNSIGNED  NOT NULL DEFAULT 1,
  `prix_unitaire` DECIMAL(12,2) NOT NULL,
  `total_price`   DECIMAL(12,2) NOT NULL,
  `carbon_kg`     DECIMAL(8,4)  DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_order_items_order`   (`order_id`),
  KEY `idx_order_items_product` (`product_id`),
  CONSTRAINT `fk_order_items_order`
    FOREIGN KEY (`order_id`)   REFERENCES `orders`   (`id`) ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT `fk_order_items_product`
    FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────
-- 5. DONNÉES DE TEST — 5 produits éco-responsables
-- ─────────────────────────────────────────────
INSERT INTO `products`
  (`id`, `sku`, `nom`, `description`, `prix`, `currency`, `stock`, `empreinte_co2`, `eco_score`, `image_url`)
VALUES
  (
    'prod-eco-001', 'SKU-SOL-001',
    'Lampe solaire rechargeable',
    'Lampe LED alimentée par panneau solaire intégré, autonomie 10h, résistante aux intempéries.',
    18500.00, 'XAF', 120, 0.4200, 92,
    'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400'
  ),
  (
    'prod-eco-002', 'SKU-SAC-002',
    'Sac à dos en coton recyclé',
    'Fabriqué à 100 % à partir de bouteilles PET recyclées, certifié GOTS. Capacité 25 L.',
    12000.00, 'XAF', 85, 1.2000, 88,
    'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400'
  ),
  (
    'prod-eco-003', 'SKU-GOU-003',
    'Gourde isotherme en acier inoxydable',
    'Acier inox 18/8, sans BPA. Garde les boissons froides 24h et chaudes 12h. 500 ml.',
    8500.00, 'XAF', 200, 3.5000, 85,
    'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=400'
  ),
  (
    'prod-eco-004', 'SKU-KIT-004',
    'Kit cuisine zéro déchet (bambou)',
    'Set de 5 ustensiles en bambou naturel : spatule, cuillère, fouet, fourchette, louche.',
    6500.00, 'XAF', 60, 0.8000, 95,
    'https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?w=400'
  ),
  (
    'prod-eco-005', 'SKU-FIL-005',
    'Filtre à eau portable LifeStraw',
    'Filtre 1 000 litres, élimine 99,9 % des bactéries et protozoaires. Idéal randonnée.',
    22000.00, 'XAF', 45, 0.6500, 97,
    'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=400'
  );

-- ─────────────────────────────────────────────
-- 6. Utilisateur de test (mot de passe : Admin@2026!)
--    Hash Argon2id généré via argon2 CLI / bcrypt en ligne
--    NE PAS utiliser ce hash en production — regénérer via l'API
-- ─────────────────────────────────────────────
INSERT INTO `users` (`id`, `email`, `password_hash`, `full_name`, `role`)
VALUES (
  'user-admin-001',
  'admin@greenmarket.cm',
  '$argon2id$v=19$m=65536,t=3,p=4$PLACEHOLDER_HASH_REGENERATE_VIA_API',
  'Administrateur Green Market',
  'ADMIN'
);

-- =============================================================
-- Vérification rapide
-- =============================================================
SELECT 'Tables créées avec succès' AS statut;
SELECT TABLE_NAME, TABLE_ROWS
  FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = 'green_market_db';
