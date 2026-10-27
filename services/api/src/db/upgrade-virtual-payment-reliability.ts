import mysql from 'mysql2/promise'
import 'dotenv/config'

const url=process.env.DATABASE_URL
if(!url) throw new Error('DATABASE_URL is required')
const connection=await mysql.createConnection(url)
try {
  await connection.query(`CREATE TABLE IF NOT EXISTS virtual_payment_cases (
    id varchar(36) NOT NULL PRIMARY KEY,
    order_id varchar(36) NULL,
    event_key varchar(128) NOT NULL,
    kind enum('late_payment','refund','complaint','delivery','reconciliation') NOT NULL,
    state enum('open','processing','succeeded','failed','resolved') NOT NULL DEFAULT 'open',
    reason_code varchar(80) NOT NULL,
    refund_amount_fen int NULL,
    provider_reference varchar(96) NULL,
    attempt_count int NOT NULL DEFAULT 0,
    last_checked_at timestamp NULL,
    resolved_at timestamp NULL,
    resolved_by varchar(36) NULL,
    review_note varchar(500) NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY virtual_payment_cases_event_key_uq (event_key),
    KEY virtual_payment_cases_order_state_idx (order_id,state),
    KEY virtual_payment_cases_kind_state_idx (kind,state),
    CONSTRAINT virtual_payment_cases_order_fk FOREIGN KEY (order_id) REFERENCES payment_orders(id),
    CONSTRAINT virtual_payment_cases_resolver_fk FOREIGN KEY (resolved_by) REFERENCES users(id)
  ) ENGINE=InnoDB`)
  await connection.query(`CREATE TABLE IF NOT EXISTS virtual_payment_case_actions (
    id varchar(36) NOT NULL PRIMARY KEY,
    case_id varchar(36) NOT NULL,
    actor_user_id varchar(36) NULL,
    action varchar(48) NOT NULL,
    note varchar(500) NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY virtual_payment_case_actions_case_idx (case_id,created_at),
    CONSTRAINT virtual_payment_case_actions_case_fk FOREIGN KEY (case_id) REFERENCES virtual_payment_cases(id),
    CONSTRAINT virtual_payment_case_actions_actor_fk FOREIGN KEY (actor_user_id) REFERENCES users(id)
  ) ENGINE=InnoDB`)
  const [rows]=await connection.query<mysql.RowDataPacket[]>(
    `SELECT TABLE_NAME,COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN
        ('virtual_payment_cases','virtual_payment_case_actions')`)
  const has=(table:string,column:string)=>rows.some(row=>row.TABLE_NAME===table && row.COLUMN_NAME===column)
  for(const [table,column] of [
    ['virtual_payment_cases','event_key'],['virtual_payment_cases','refund_amount_fen'],
    ['virtual_payment_cases','last_checked_at'],['virtual_payment_cases','attempt_count'],
    ['virtual_payment_case_actions','actor_user_id'],
  ]) if(!has(table,column)) throw new Error('virtual_payment_schema_incomplete')
  const [indexes]=await connection.query<mysql.RowDataPacket[]>(
    `SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN
       ('virtual_payment_cases','virtual_payment_case_actions')`)
  for(const [table,name] of [
    ['virtual_payment_cases','virtual_payment_cases_event_key_uq'],
    ['virtual_payment_cases','virtual_payment_cases_order_state_idx'],
    ['virtual_payment_cases','virtual_payment_cases_kind_state_idx'],
    ['virtual_payment_case_actions','virtual_payment_case_actions_case_idx'],
  ]) if(!indexes.some(row=>row.TABLE_NAME===table && row.INDEX_NAME===name))
    throw new Error('virtual_payment_index_incomplete')
  if(!indexes.some(row=>row.TABLE_NAME==='virtual_payment_cases' &&
      row.INDEX_NAME==='virtual_payment_cases_event_key_uq' && Number(row.NON_UNIQUE)===0))
    throw new Error('virtual_payment_event_key_not_unique')
  const [keys]=await connection.query<mysql.RowDataPacket[]>(
    `SELECT CONSTRAINT_NAME FROM information_schema.REFERENTIAL_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME IN
       ('virtual_payment_cases','virtual_payment_case_actions')`)
  for(const name of ['virtual_payment_cases_order_fk','virtual_payment_cases_resolver_fk',
    'virtual_payment_case_actions_case_fk','virtual_payment_case_actions_actor_fk'])
    if(!keys.some(row=>row.CONSTRAINT_NAME===name))
      throw new Error('virtual_payment_foreign_key_incomplete')
  console.log('VIRTUAL_PAYMENT_RELIABILITY_SCHEMA_READY')
} finally { await connection.end() }
