import mysql from 'mysql2/promise'
import 'dotenv/config'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required')

const connection = await mysql.createConnection(databaseUrl)

async function execute(sql: string) {
  await connection.query(sql)
}

try {
  await execute(`CREATE TABLE IF NOT EXISTS \`payment_orders\` (
    \`id\` varchar(36) NOT NULL,
    \`user_id\` varchar(36) NOT NULL,
    \`out_trade_no\` varchar(64) NOT NULL,
    \`provider\` enum('wechat_pay') NOT NULL DEFAULT 'wechat_pay',
    \`status\` enum('pending','paid','closed','refunded') NOT NULL DEFAULT 'pending',
    \`amount_fen\` int NOT NULL,
    \`credit_amount\` int NOT NULL,
    \`provider_transaction_id\` varchar(64) NULL,
    \`paid_at\` timestamp NULL,
    \`expires_at\` timestamp NULL,
    \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`payment_orders_out_trade_no_uq\` (\`out_trade_no\`),
    UNIQUE KEY \`payment_orders_provider_transaction_id_uq\` (\`provider_transaction_id\`),
    KEY \`payment_orders_user_id_idx\` (\`user_id\`),
    CONSTRAINT \`payment_orders_user_id_users_id_fk\`
      FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`)
  ) ENGINE=InnoDB`)

  await execute(`CREATE TABLE IF NOT EXISTS \`credit_ledger_entries\` (
    \`id\` varchar(36) NOT NULL,
    \`user_id\` varchar(36) NOT NULL,
    \`type\` enum('free_grant','payment_grant','assessment_debit','admin_adjustment','correction') NOT NULL,
    \`delta\` int NOT NULL,
    \`assessment_id\` varchar(36) NULL,
    \`payment_order_id\` varchar(36) NULL,
    \`idempotency_key\` varchar(160) NOT NULL,
    \`note\` varchar(500) NULL,
    \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`credit_ledger_entries_idempotency_key_uq\` (\`idempotency_key\`),
    KEY \`credit_ledger_entries_user_id_idx\` (\`user_id\`),
    KEY \`credit_ledger_entries_assessment_id_idx\` (\`assessment_id\`),
    KEY \`credit_ledger_entries_payment_order_id_idx\` (\`payment_order_id\`),
    CONSTRAINT \`credit_ledger_entries_user_id_users_id_fk\`
      FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`),
    CONSTRAINT \`credit_ledger_entries_assessment_id_assessments_id_fk\`
      FOREIGN KEY (\`assessment_id\`) REFERENCES \`assessments\` (\`id\`),
    CONSTRAINT \`credit_ledger_entries_payment_order_id_payment_orders_id_fk\`
      FOREIGN KEY (\`payment_order_id\`) REFERENCES \`payment_orders\` (\`id\`)
  ) ENGINE=InnoDB`)

  await execute(`CREATE TABLE IF NOT EXISTS \`credit_reservations\` (
    \`id\` varchar(36) NOT NULL,
    \`user_id\` varchar(36) NOT NULL,
    \`assessment_id\` varchar(36) NOT NULL,
    \`amount\` int NOT NULL DEFAULT 1,
    \`status\` enum('held','consumed','released') NOT NULL DEFAULT 'held',
    \`expires_at\` timestamp NOT NULL,
    \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`credit_reservations_assessment_id_uq\` (\`assessment_id\`),
    KEY \`credit_reservations_user_id_idx\` (\`user_id\`),
    CONSTRAINT \`credit_reservations_user_id_users_id_fk\`
      FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`),
    CONSTRAINT \`credit_reservations_assessment_id_assessments_id_fk\`
      FOREIGN KEY (\`assessment_id\`) REFERENCES \`assessments\` (\`id\`)
  ) ENGINE=InnoDB`)

  await execute(`CREATE TABLE IF NOT EXISTS \`payment_notifications\` (
    \`id\` varchar(36) NOT NULL,
    \`provider\` enum('wechat_pay') NOT NULL DEFAULT 'wechat_pay',
    \`notification_id\` varchar(96) NOT NULL,
    \`out_trade_no\` varchar(64) NULL,
    \`provider_transaction_id\` varchar(64) NULL,
    \`payload_hash\` varchar(64) NOT NULL,
    \`status\` enum('received','processed','rejected') NOT NULL DEFAULT 'received',
    \`processed_at\` timestamp NULL,
    \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`payment_notifications_notification_id_uq\` (\`notification_id\`),
    KEY \`payment_notifications_out_trade_no_idx\` (\`out_trade_no\`)
  ) ENGINE=InnoDB`)

  console.log('✓ credit/payment foundation schema is ready')
} finally {
  await connection.end()
}
