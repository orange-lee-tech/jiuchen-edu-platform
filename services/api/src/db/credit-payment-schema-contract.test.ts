import assert from 'node:assert/strict'
import test from 'node:test'
import {
  validateCreditPaymentSchemaSnapshot,
  type CreditPaymentSchemaSnapshot,
  type CommercialTableSnapshot,
} from './credit-payment-schema-contract.js'

function table(input: {
  columns: Array<[string, string, boolean]>
  indexes: Array<[string, string, number]>
  foreignKeys?: Array<[string, string, string]>
}): CommercialTableSnapshot {
  return {
    tableExists: true,
    columns: input.columns.map(([name, dataType, nullable]) => ({
      name,
      dataType,
      nullable,
    })),
    indexes: input.indexes.map(([name, column, sequence]) => ({
      name,
      column,
      sequence,
    })),
    foreignKeys: (input.foreignKeys ?? []).map(
      ([column, referencedTable, referencedColumn]) => ({
        column,
        referencedTable,
        referencedColumn,
      }),
    ),
  }
}

function readySnapshot(): CreditPaymentSchemaSnapshot {
  return {
    payment_orders: table({
      columns: [
        ['id','varchar',false],['user_id','varchar',false],['out_trade_no','varchar',false],
        ['provider','enum',false],['status','enum',false],['amount_fen','int',false],
        ['credit_amount','int',false],['provider_transaction_id','varchar',true],
        ['paid_at','timestamp',true],['expires_at','timestamp',true],
        ['created_at','timestamp',false],['updated_at','timestamp',false],
      ],
      indexes: [
        ['PRIMARY','id',1],
        ['payment_orders_out_trade_no_uq','out_trade_no',1],
        ['payment_orders_provider_transaction_id_uq','provider_transaction_id',1],
        ['payment_orders_user_id_idx','user_id',1],
      ],
      foreignKeys: [['user_id','users','id']],
    }),
    credit_ledger_entries: table({
      columns: [
        ['id','varchar',false],['user_id','varchar',false],['type','enum',false],
        ['delta','int',false],['assessment_id','varchar',true],
        ['payment_order_id','varchar',true],['idempotency_key','varchar',false],
        ['note','varchar',true],['created_at','timestamp',false],
      ],
      indexes: [
        ['PRIMARY','id',1],
        ['credit_ledger_entries_idempotency_key_uq','idempotency_key',1],
        ['credit_ledger_entries_user_id_idx','user_id',1],
        ['credit_ledger_entries_assessment_id_idx','assessment_id',1],
        ['credit_ledger_entries_payment_order_id_idx','payment_order_id',1],
      ],
      foreignKeys: [
        ['user_id','users','id'],
        ['assessment_id','assessments','id'],
        ['payment_order_id','payment_orders','id'],
      ],
    }),
    credit_reservations: table({
      columns: [
        ['id','varchar',false],['user_id','varchar',false],
        ['assessment_id','varchar',false],['amount','int',false],
        ['status','enum',false],['expires_at','timestamp',false],
        ['created_at','timestamp',false],['updated_at','timestamp',false],
      ],
      indexes: [
        ['PRIMARY','id',1],
        ['credit_reservations_assessment_id_uq','assessment_id',1],
        ['credit_reservations_user_id_idx','user_id',1],
      ],
      foreignKeys: [
        ['user_id','users','id'],
        ['assessment_id','assessments','id'],
      ],
    }),
    payment_notifications: table({
      columns: [
        ['id','varchar',false],['provider','enum',false],
        ['notification_id','varchar',false],['out_trade_no','varchar',true],
        ['provider_transaction_id','varchar',true],['payload_hash','varchar',false],
        ['status','enum',false],['processed_at','timestamp',true],
        ['created_at','timestamp',false],
      ],
      indexes: [
        ['PRIMARY','id',1],
        ['payment_notifications_notification_id_uq','notification_id',1],
        ['payment_notifications_out_trade_no_idx','out_trade_no',1],
      ],
    }),
  }
}

test('credit/payment schema contract accepts the production shape', () => {
  assert.deepEqual(validateCreditPaymentSchemaSnapshot(readySnapshot()), [])
})

test('credit/payment schema contract detects missing commercial tables', () => {
  const snapshot = readySnapshot()
  snapshot.credit_reservations = {
    tableExists: false,
    columns: [],
    indexes: [],
    foreignKeys: [],
  }
  assert.ok(
    validateCreditPaymentSchemaSnapshot(snapshot).includes(
      'missing_table:credit_reservations',
    ),
  )
})

test('credit/payment schema contract detects idempotency and FK drift', () => {
  const snapshot = readySnapshot()
  snapshot.credit_ledger_entries.indexes =
    snapshot.credit_ledger_entries.indexes.filter(
      (index) =>
        index.name !== 'credit_ledger_entries_idempotency_key_uq',
    )
  snapshot.credit_ledger_entries.foreignKeys =
    snapshot.credit_ledger_entries.foreignKeys.filter(
      (foreignKey) => foreignKey.column !== 'assessment_id',
    )

  const issues = validateCreditPaymentSchemaSnapshot(snapshot)
  assert.ok(
    issues.some((issue) =>
      issue.startsWith(
        'index_mismatch:credit_ledger_entries.credit_ledger_entries_idempotency_key_uq',
      ),
    ),
  )
  assert.ok(
    issues.includes(
      'foreign_key_missing:credit_ledger_entries.assessment_id->assessments.id',
    ),
  )
})
