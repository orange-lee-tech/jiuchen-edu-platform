import mysql from 'mysql2/promise'
import 'dotenv/config'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required')
const connection = await mysql.createConnection(databaseUrl)
try {
  await connection.query(`CREATE TABLE IF NOT EXISTS assessment_ai_calls (
    id varchar(36) NOT NULL,
    assessment_id varchar(36) NOT NULL,
    phase enum('initial','repair') NOT NULL,
    request_index tinyint unsigned NOT NULL,
    outcome enum('started','completed','failed') NOT NULL DEFAULT 'started',
    provider varchar(120) NOT NULL,
    model varchar(120) NOT NULL,
    object_id varchar(36) NULL,
    object_version int unsigned NULL,
    prompt_chars int unsigned NULL,
    output_budget int unsigned NULL,
    prompt_tokens bigint unsigned NULL,
    completion_tokens bigint unsigned NULL,
    cache_hit_tokens bigint unsigned NULL,
    cache_miss_tokens bigint unsigned NULL,
    reasoning_tokens bigint unsigned NULL,
    usage_state enum('unknown','returned','awaiting_reconciliation') NOT NULL DEFAULT 'unknown',
    price_version varchar(36) NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at timestamp NULL,
    PRIMARY KEY (id),
    KEY assessment_ai_calls_assessment (assessment_id,created_at),
    KEY assessment_ai_calls_model (provider,model,created_at),
    CONSTRAINT assessment_ai_calls_assessment_fk FOREIGN KEY (assessment_id) REFERENCES assessments (id)
  ) ENGINE=InnoDB`)
  await connection.query(`CREATE TABLE IF NOT EXISTS assessment_ai_price_versions (
    id varchar(36) NOT NULL,
    provider varchar(120) NOT NULL,
    model varchar(120) NOT NULL,
    currency char(3) NOT NULL,
    input_cache_hit_per_million decimal(16,6) NULL,
    input_cache_miss_per_million decimal(16,6) NOT NULL,
    output_per_million decimal(16,6) NOT NULL,
    peak_input_cache_miss_per_million decimal(16,6) NULL,
    peak_output_per_million decimal(16,6) NULL,
    peak_window_utc varchar(120) NULL,
    source_url varchar(500) NOT NULL,
    source_sha256 char(64) NULL,
    effective_at timestamp NOT NULL,
    fetched_at timestamp NULL,
    reviewed_at timestamp NULL,
    reviewed_by varchar(36) NULL,
    review_note varchar(500) NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY assessment_ai_price_lookup (provider,model,effective_at)
  ) ENGINE=InnoDB`)
  await connection.query(`CREATE TABLE IF NOT EXISTS assessment_ai_fx_versions (
    id varchar(36) NOT NULL,
    from_currency char(3) NOT NULL,
    to_currency char(3) NOT NULL,
    rate decimal(18,8) NOT NULL,
    source_url varchar(500) NOT NULL,
    observed_at timestamp NOT NULL,
    reviewed_at timestamp NULL,
    reviewed_by varchar(36) NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY assessment_ai_fx_lookup (from_currency,to_currency,observed_at)
  ) ENGINE=InnoDB`)
  await connection.query(`CREATE TABLE IF NOT EXISTS assessment_ai_price_heads (
    provider varchar(120) NOT NULL,
    model varchar(120) NOT NULL,
    latest_version varchar(36) NULL,
    PRIMARY KEY (provider,model)
  ) ENGINE=InnoDB`)
  await connection.query(`CREATE TABLE IF NOT EXISTS assessment_ai_price_source_checks (
    id varchar(36) NOT NULL,
    source_url varchar(500) NOT NULL,
    source_sha256 char(64) NOT NULL,
    fetched_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY assessment_ai_price_source_recent (fetched_at)
  ) ENGINE=InnoDB`)
  await connection.query(`CREATE TABLE IF NOT EXISTS assessment_ai_cost_audit (
    id varchar(36) NOT NULL,
    actor_user_id varchar(36) NOT NULL,
    action varchar(40) NOT NULL,
    version_id varchar(36) NOT NULL,
    note varchar(500) NOT NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY assessment_ai_cost_audit_version (version_id,created_at)
  ) ENGINE=InnoDB`)
  console.info('assessment_ai_cost_schema_ready')
} finally {
  await connection.end()
}
