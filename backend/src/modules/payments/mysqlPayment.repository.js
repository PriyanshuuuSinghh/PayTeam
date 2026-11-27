import { createHash } from "node:crypto";
import pool from "../../config/db.js";
import ApiError from "../../utils/ApiError.js";
import { unavailable, conflict, invalid, notConfigured } from "./payment.errors.js";

const PAYMENT_SELECT = `SELECT * FROM payment_transactions`;
const JSON_FIELDS = ["configuration_snapshot", "charges_snapshot", "gateway_response"];

function createMysqlPaymentRepository(db = pool) {
  db = guardDatabaseErrors(db);
  async function transaction(work) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const result = await work(connection);
      await connection.commit();
      return result;
    } catch (error) {
      try { await connection.rollback(); } catch { /* Preserve the original failure. */ }
      throw error;
    } finally {
      connection.release();
    }
  }

  async function findSchemeConfiguration({ userId, serviceCode, operator, includeCommissions }) {
    const [rows] = await db.execute(
      `SELECT s.id AS schemeId, c.id AS configurationId, c.configuration_version AS configurationVersion,
              c.service_charge_type AS serviceChargeType, CAST(c.service_charge_value AS CHAR) AS serviceChargeValue,
              c.instant_charge_type AS instantChargeType, CAST(c.instant_charge_value AS CHAR) AS instantChargeValue
         FROM users u
         LEFT JOIN scheme_assignments sa ON sa.user_id = u.id
         JOIN schemes s ON s.id = COALESCE(sa.scheme_id,
           (SELECT d.id FROM schemes d WHERE d.is_default = 1 AND d.status = 'ACTIVE' LIMIT 1))
         JOIN service_operators so ON so.service_code = ? AND so.operator_code = ? AND so.status = 'ACTIVE'
         JOIN scheme_operator_configurations c ON c.scheme_id = s.id
              AND c.service_operator_id = so.id AND c.is_current = 1
        WHERE u.id = ? AND u.status = 'active' AND s.status = 'ACTIVE'
        LIMIT 1`,
      [serviceCode, operator, userId],
    );
    const row = rows[0];
    if (!row) return null;
    const result = {
      schemeId: row.schemeId,
      configurationId: row.configurationId,
      configurationVersion: row.configurationVersion,
      serviceCharge: { type: row.serviceChargeType, value: row.serviceChargeValue },
      instantCharge: row.instantChargeType === null ? null : { type: row.instantChargeType, value: row.instantChargeValue },
    };
    if (includeCommissions) {
      const [rates] = await db.execute(
        `SELECT hierarchy_level AS hierarchyLevel, rate_type AS type, CAST(rate_value AS CHAR) AS value
           FROM scheme_commission_rates WHERE configuration_id = ? ORDER BY hierarchy_level`,
        [row.configurationId],
      );
      result.commissions = rates;
    }
    return result;
  }

  async function getPaymentForScope(connection, { userId, operation, idempotencyKey }, lock = false) {
    const [rows] = await connection.execute(
      `${PAYMENT_SELECT} WHERE user_id = ? AND operation = ? AND idempotency_key = ?${lock ? " FOR UPDATE" : ""}`,
      [userId, operation, idempotencyKey],
    );
    return mapPayment(rows[0]);
  }

  async function insertPayment(connection, data, { gatewayFallback = null } = {}) {
    const charges = data.charges || {};
    const values = [
      data.user_id,
      data.initiator_user_id || data.user_id,
      data.customer_user_id || null,
      data.operation,
      data.gateway || gatewayFallback,
      data.request_id,
      data.gateway_order_id || null,
      data.txn_id || null,
      data.idempotency_key,
      data.idempotency_payload_hash,
      data.amount_paise ?? null,
      data.currency || "INR",
      data.status || "PENDING",
      data.initiation_status_code || null,
      data.settlement_status || (data.operation === "ADD_MONEY_DIAMOND_4" ? "UNCONFIRMED" : "NOT_APPLICABLE"),
      data.intended_settlement_mode || "NOT_APPLICABLE",
      data.settlement_amount_paise || null,
      charges.serviceChargePaise || "0",
      charges.instantChargePaise || "0",
      data.payment_url || null,
      data.payment_mode || null,
      data.utr || null,
      data.provider_reference || null,
      data.scheme_id || null,
      data.scheme_configuration_id || null,
      data.service_code || null,
      data.operator || data.operator_code || null,
      jsonParam(data.configuration_snapshot),
      jsonParam(charges),
      jsonParam(data.gateway_response),
      Boolean(data.reconciliation_required),
    ];
    const [result] = await connection.execute(
      `INSERT INTO payment_transactions
       (user_id, initiator_user_id, customer_user_id, operation, gateway, request_id, gateway_order_id, txn_id,
        idempotency_key, idempotency_payload_hash, amount_paise, currency, status, initiation_status_code,
        settlement_status, intended_settlement_mode, settlement_amount_paise, service_charge_paise,
        instant_charge_paise, payment_url, payment_mode, utr, provider_reference, scheme_id,
        scheme_configuration_id, service_code, operator_code, configuration_snapshot,
        charges_snapshot, gateway_response, reconciliation_required)
       VALUES (${values.map(() => "?").join(", ")})`,
      values,
    );
    const [rows] = await connection.execute(`${PAYMENT_SELECT} WHERE id = ?`, [result.insertId]);
    return mapPayment(rows[0]);
  }

  async function persistUniquePayment(data, options) {
    return transaction(async (connection) => {
      try {
        const stored = await insertPayment(connection, data, options);
        return { created: true, transaction: stored };
      } catch (error) {
        if (error.code !== "ER_DUP_ENTRY") throw error;
        const stored = await getPaymentForScope(connection, {
          userId: data.user_id,
          operation: data.operation,
          idempotencyKey: data.idempotency_key,
        }, true);
        if (!stored) throw error; // For example, a request_id collision, not an idempotency replay.
        return { created: false, transaction: stored };
      }
    });
  }

  async function patchPayment(requestId, patch, operation = null) {
    const allowed = new Map([
      ["gateway_order_id", "gateway_order_id"], ["txn_id", "txn_id"], ["payment_url", "payment_url"],
      ["initiation_status_code", "initiation_status_code"], ["status", "status"],
      ["settlement_status", "settlement_status"], ["settlement_amount_paise", "settlement_amount_paise"],
      ["payment_mode", "payment_mode"], ["utr", "utr"], ["provider_reference", "provider_reference"],
      ["reconciliation_required", "reconciliation_required"],
    ]);
    const entries = Object.entries(patch).filter(([key]) => allowed.has(key));
    if (patch.gateway_response !== undefined) entries.push(["gateway_response", patch.gateway_response]);
    if (entries.length === 0) return null;
    const set = entries.map(([key]) => `\`${allowed.get(key) || key}\` = ?`).join(", ");
    const values = entries.map(([key, value]) => key === "gateway_response" ? jsonParam(value) : value);
    const params = [...values, requestId];
    let where = "request_id = ?";
    if (operation) { where += " AND operation = ?"; params.push(operation); }
    await db.execute(`UPDATE payment_transactions SET ${set} WHERE ${where}`, params);
    const [rows] = await db.execute(`${PAYMENT_SELECT} WHERE request_id = ?${operation ? " AND operation = ?" : ""} LIMIT 1`, operation ? [requestId, operation] : [requestId]);
    return mapPayment(rows[0]);
  }

  async function persistProductChild({ transactionData, gatewayFallback, childSql, childValues, selectSql, selectValues, resultKey }) {
    return transaction(async (connection) => {
      try {
        const stored = await insertPayment(connection, transactionData, { gatewayFallback });
        await connection.execute(childSql, [stored.id, ...childValues]);
        return { created: true, [resultKey]: stored };
      } catch (error) {
        if (error.code !== "ER_DUP_ENTRY") throw error;
        const [rows] = await connection.execute(selectSql, selectValues);
        if (!rows[0]) throw error;
        return { created: false, [resultKey]: mapPayment(rows[0]) };
      }
    });
  }

  return Object.freeze({
    async listAvailableSchemesForUser(userId) {
      const [rows] = await db.execute(
        `SELECT s.id, s.name, s.is_default AS isDefault
           FROM users u LEFT JOIN scheme_assignments sa ON sa.user_id = u.id
           JOIN schemes s ON s.id = COALESCE(sa.scheme_id,
             (SELECT d.id FROM schemes d WHERE d.is_default = 1 AND d.status = 'ACTIVE' LIMIT 1))
          WHERE u.id = ? AND u.status = 'active' AND s.status = 'ACTIVE'`,
        [userId],
      );
      return rows;
    },
    async listAllSchemes() {
      const [rows] = await db.execute("SELECT id, name, is_default AS isDefault FROM schemes ORDER BY id");
      return rows;
    },
    async createScheme({ name, isDefault }) {
      try {
        return await transaction(async (connection) => {
          const [control] = await connection.execute("SELECT id FROM scheme_control WHERE id = 1 FOR UPDATE");
          if (!control.length) throw unavailable("Scheme default control is not initialized");
          if (isDefault) await connection.execute("UPDATE schemes SET is_default = 0 WHERE is_default = 1");
          const [result] = await connection.execute("INSERT INTO schemes (name, is_default) VALUES (?, ?)", [name, isDefault ? 1 : 0]);
          const [rows] = await connection.execute("SELECT id, name, is_default AS isDefault FROM schemes WHERE id = ?", [result.insertId]);
          return rows[0];
        });
      } catch (error) {
        if (error.code === "ER_DUP_ENTRY") throw conflict("A scheme with that name already exists", "SCHEME_NAME_CONFLICT");
        throw error;
      }
    },
    async renameScheme(schemeId, name) {
      try {
        const [result] = await db.execute("UPDATE schemes SET name = ? WHERE id = ?", [name, schemeId]);
        if (!result.affectedRows) {
          const [existing] = await db.execute("SELECT id FROM schemes WHERE id = ?", [schemeId]);
          if (!existing.length) return null;
        }
        const [rows] = await db.execute("SELECT id, name, is_default AS isDefault FROM schemes WHERE id = ?", [schemeId]);
        return rows[0] || null;
      } catch (error) {
        if (error.code === "ER_DUP_ENTRY") throw conflict("A scheme with that name already exists", "SCHEME_NAME_CONFLICT");
        throw error;
      }
    },
    async setDefaultScheme(schemeId) {
      return transaction(async (connection) => {
        const [control] = await connection.execute("SELECT id FROM scheme_control WHERE id = 1 FOR UPDATE");
        if (!control.length) throw unavailable("Scheme default control is not initialized");
        const [target] = await connection.execute("SELECT id FROM schemes WHERE id = ? AND status = 'ACTIVE' FOR UPDATE", [schemeId]);
        if (!target.length) return null;
        await connection.execute("UPDATE schemes SET is_default = 0 WHERE is_default = 1");
        await connection.execute("UPDATE schemes SET is_default = 1 WHERE id = ?", [schemeId]);
        const [rows] = await connection.execute("SELECT id, name, is_default AS isDefault FROM schemes WHERE id = ?", [schemeId]);
        return rows[0];
      });
    },
    async assignScheme({ actorId, userId, schemeId }) {
      return transaction(async (connection) => {
        const [actorRows] = await connection.execute("SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ? AND r.slug = 'AD' AND u.status = 'active' FOR UPDATE", [actorId]);
        if (!actorRows.length) throw new ApiError(403, "Only an active administrator can assign schemes", [], "FORBIDDEN");
        const [targetRows] = await connection.execute("SELECT id FROM users WHERE id = ? AND status = 'active' FOR UPDATE", [userId]);
        const [schemeRows] = await connection.execute("SELECT id FROM schemes WHERE id = ? AND status = 'ACTIVE' FOR UPDATE", [schemeId]);
        if (!targetRows.length || !schemeRows.length) return null;
        const [currentRows] = await connection.execute("SELECT scheme_id FROM scheme_assignments WHERE user_id = ? FOR UPDATE", [userId]);
        const oldSchemeId = currentRows[0]?.scheme_id ?? null;
        await connection.execute(
          `INSERT INTO scheme_assignments (user_id, scheme_id, assigned_by) VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE scheme_id = VALUES(scheme_id), assigned_by = VALUES(assigned_by), updated_at = CURRENT_TIMESTAMP`,
          [userId, schemeId, actorId],
        );
        await connection.execute("INSERT INTO scheme_assignment_history (user_id, old_scheme_id, new_scheme_id, changed_by) VALUES (?, ?, ?, ?)", [userId, oldSchemeId, schemeId, actorId]);
        return { userId, schemeId, assignedBy: actorId };
      });
    },
    async findAssignedScheme(userId) {
      const [rows] = await db.execute(
        `SELECT s.id, s.name, s.is_default AS isDefault
           FROM users u LEFT JOIN scheme_assignments sa ON sa.user_id = u.id
           JOIN schemes s ON s.id = COALESCE(sa.scheme_id,
             (SELECT d.id FROM schemes d WHERE d.is_default = 1 AND d.status = 'ACTIVE' LIMIT 1))
          WHERE u.id = ? AND u.status = 'active' AND s.status = 'ACTIVE'
          LIMIT 1`,
        [userId],
      );
      return rows[0] || null;
    },
    async findSafeConfigurationForUser(args) { return findSchemeConfiguration({ ...args, includeCommissions: false }); },
    async findApplicableConfiguration(args) { return findSchemeConfiguration({ ...args, includeCommissions: true }); },
    async setApplicableConfiguration({ schemeId, serviceCode, operator, configuration, createdBy }) {
      return transaction(async (connection) => {
        const [scheme] = await connection.execute("SELECT id FROM schemes WHERE id = ? AND status = 'ACTIVE' FOR UPDATE", [schemeId]);
        if (!scheme.length) return null;
        const [mapping] = await connection.execute("SELECT id FROM service_operators WHERE service_code = ? AND operator_code = ? AND status = 'ACTIVE' FOR UPDATE", [serviceCode, operator]);
        if (!mapping.length) return null;
        const [current] = await connection.execute("SELECT id, configuration_version FROM scheme_operator_configurations WHERE scheme_id = ? AND service_operator_id = ? AND is_current = 1 FOR UPDATE", [schemeId, mapping[0].id]);
        const nextVersion = Number(current[0]?.configuration_version || 0) + 1;
        if (current[0]) await connection.execute("UPDATE scheme_operator_configurations SET is_current = 0, effective_to = CURRENT_TIMESTAMP WHERE id = ?", [current[0].id]);
        const [created] = await connection.execute(
          `INSERT INTO scheme_operator_configurations
             (scheme_id, service_operator_id, configuration_version, service_charge_type, service_charge_value,
              instant_charge_type, instant_charge_value, is_current, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
          [schemeId, mapping[0].id, nextVersion, configuration.serviceCharge.type, configuration.serviceCharge.value,
            configuration.instantCharge?.type || null, configuration.instantCharge?.value || null, createdBy],
        );
        for (const rate of configuration.commissions) {
          await connection.execute("INSERT INTO scheme_commission_rates (configuration_id, hierarchy_level, rate_type, rate_value) VALUES (?, ?, ?, ?)", [created.insertId, rate.hierarchyLevel, rate.type, rate.value]);
        }
        return { schemeId, serviceCode, operator, configurationId: created.insertId, configurationVersion: nextVersion, configuration };
      });
    },
    async findIdempotentInitiation(scope) {
      const [rows] = await db.execute(`${PAYMENT_SELECT} WHERE user_id = ? AND operation = ? AND idempotency_key = ? LIMIT 1`, [scope.userId, scope.operation, scope.idempotencyKey]);
      return mapPayment(rows[0]);
    },
    async persistInitiation(data) { return persistUniquePayment(data); },
    async findTransactionForUser(userId, requestId) {
      const [rows] = await db.execute(`${PAYMENT_SELECT} WHERE request_id = ? AND (user_id = ? OR initiator_user_id = ?) LIMIT 1`, [requestId, userId, userId]);
      return mapPayment(rows[0]);
    },
    async updateInitiation(requestId, patch) { return patchPayment(requestId, patch, "ADD_MONEY_DIAMOND_4"); },
    async processCallbackAtomically(input) {
      const result = await transaction(async (connection) => {
        const [rows] = await connection.execute(
          `SELECT id, status, settlement_status, amount_paise, gateway_order_id FROM payment_transactions
            WHERE gateway = ? AND request_id = ? FOR UPDATE`,
          [input.gateway, input.requestId],
        );
        const current = rows[0];
        const mismatchCode = !current || String(current.gateway_order_id || "") !== input.gatewayOrderId
          ? "PAYMENT_CALLBACK_MISMATCH"
          : String(current.amount_paise) !== String(input.amountPaise)
            ? "PAYMENT_AMOUNT_MISMATCH"
            : null;
        if (mismatchCode) {
          await connection.execute(
            `INSERT IGNORE INTO payment_webhook_events (payment_transaction_id, gateway, request_id, gateway_order_id, event_fingerprint, sanitized_payload, authentication_verified, processing_status, processed_at)
             VALUES (?, ?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP)`,
            [current?.id || null, input.gateway, input.requestId, input.gatewayOrderId, input.event.fingerprint, jsonParam(input.event.payload), mismatchCode === "PAYMENT_AMOUNT_MISMATCH" ? "REJECTED_AMOUNT_MISMATCH" : "REJECTED_MISMATCH"],
          );
          return { rejectedCode: mismatchCode };
        }
        const [duplicates] = await connection.execute("SELECT id FROM payment_webhook_events WHERE gateway = ? AND event_fingerprint = ? LIMIT 1", [input.gateway, input.event.fingerprint]);
        if (duplicates.length) return { duplicate: true, status: current.status, settlement_status: current.settlement_status };
        const nextStatus = input.transitionStatus(current.status);
        await connection.execute(
          `INSERT INTO payment_webhook_events (payment_transaction_id, gateway, request_id, gateway_order_id, event_fingerprint, sanitized_payload, authentication_verified, processing_status, processed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [current.id, input.gateway, input.requestId, input.gatewayOrderId, input.event.fingerprint, jsonParam(input.event.payload), Boolean(input.event.authenticationVerified), input.event.processingStatus],
        );
        await connection.execute("UPDATE payment_transactions SET status = ? WHERE id = ?", [nextStatus, current.id]);
        return { duplicate: false, status: nextStatus, settlement_status: current.settlement_status };
      });
      if (result.rejectedCode === "PAYMENT_AMOUNT_MISMATCH") throw new ApiError(409, "Payment callback amount does not match", [], result.rejectedCode);
      if (result.rejectedCode) throw new ApiError(409, "Payment callback does not match a transaction", [], result.rejectedCode);
      return result;
    },
    async recordRejectedCallback(event) {
      await db.execute(
        `INSERT IGNORE INTO payment_webhook_events (gateway, request_id, gateway_order_id, event_fingerprint, sanitized_payload, authentication_verified, processing_status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [event.gateway, event.payload?.requestId || null, event.payload?.orderId || null, event.fingerprint, jsonParam(event.payload), false, event.processingStatus],
      );
    },
    async findReconciliationCandidates({ olderThanMinutes, limit }) {
      const [rows] = await db.execute(
        `SELECT id, request_id, gateway, operation, status, initiation_status_code, settlement_status, created_at, updated_at
           FROM payment_transactions WHERE (reconciliation_required = 1 OR status IN ('PENDING', 'UNKNOWN'))
          AND updated_at <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? MINUTE)
          ORDER BY updated_at LIMIT ?`,
        [olderThanMinutes, limit],
      );
      return rows;
    },
    async beginReconciliationAttempt({ requestId, capability }) {
      if (typeof capability !== "string" || !/^[A-Za-z0-9_.:-]{1,80}$/.test(capability)) throw invalid("Invalid reconciliation capability");
      return transaction(async (connection) => {
        const [payments] = await connection.execute("SELECT id, status, reconciliation_required FROM payment_transactions WHERE request_id = ? FOR UPDATE", [requestId]);
        if (!payments.length || (!payments[0].reconciliation_required && !["PENDING", "UNKNOWN"].includes(payments[0].status))) return null;
        const [attempts] = await connection.execute("SELECT COALESCE(MAX(attempt_number), 0) AS lastAttempt FROM payment_reconciliation_attempts WHERE payment_transaction_id = ?", [payments[0].id]);
        const attemptNumber = Number(attempts[0].lastAttempt) + 1;
        const [created] = await connection.execute("INSERT INTO payment_reconciliation_attempts (payment_transaction_id, attempt_number, status, capability) VALUES (?, ?, 'STARTED', ?)", [payments[0].id, attemptNumber, capability]);
        return { id: created.insertId, request_id: requestId, attempt_number: attemptNumber, status: "STARTED", capability };
      });
    },
    async finishReconciliationAttempt({ attemptId, status, evidenceFingerprint = null, sanitizedResult = null }) {
      if (!["MATCHED", "UNRESOLVED", "FAILED"].includes(status)) throw invalid("Invalid reconciliation outcome");
      if (evidenceFingerprint !== null && !/^[a-f0-9]{64}$/i.test(evidenceFingerprint)) throw invalid("Invalid reconciliation evidence fingerprint");
      return transaction(async (connection) => {
        const [current] = await connection.execute("SELECT id, payment_transaction_id, status FROM payment_reconciliation_attempts WHERE id = ? FOR UPDATE", [attemptId]);
        if (!current.length) return null;
        if (current[0].status !== "STARTED") return { id: current[0].id, status: current[0].status, duplicate: true };
        await connection.execute("UPDATE payment_reconciliation_attempts SET status = ?, evidence_fingerprint = ?, sanitized_result = ? WHERE id = ?", [status, evidenceFingerprint, jsonParam(safeReconciliationResult(sanitizedResult)), attemptId]);
        const [updated] = await connection.execute("SELECT id, payment_transaction_id, status, capability, evidence_fingerprint, attempted_at FROM payment_reconciliation_attempts WHERE id = ?", [attemptId]);
        return updated[0];
      });
    },
    async listEligibleAncestors({ userId, hierarchyLevels = [] }) {
      const wantedLevels = [...new Set(hierarchyLevels.map(Number))];
      if (wantedLevels.some((n) => !Number.isSafeInteger(n) || n < 1)) throw invalid("Invalid eligible hierarchy levels", "HIERARCHY_CONFIGURATION_INVALID");
      const [rows] = await db.execute(
        `WITH RECURSIVE ancestors AS (
           SELECT parent.id, parent.parent_id, parent.role_id, child.role_id AS child_role_id, 1 AS hierarchy_level,
                  (rh.parent_role_id IS NOT NULL) AS edge_valid,
                  CAST(CONCAT('/', child.id, '/', parent.id, '/') AS CHAR(4096)) AS id_path,
                  (child.id = parent.id) AS cycle_found
             FROM users child JOIN users parent ON parent.id = child.parent_id
             LEFT JOIN role_hierarchy rh ON rh.parent_role_id = parent.role_id AND rh.child_role_id = child.role_id
            WHERE child.id = ?
           UNION ALL
           SELECT parent.id, parent.parent_id, parent.role_id, a.role_id, a.hierarchy_level + 1,
                  (rh.parent_role_id IS NOT NULL),
                  CONCAT(a.id_path, parent.id, '/'),
                  (LOCATE(CONCAT('/', parent.id, '/'), a.id_path) > 0)
             FROM ancestors a JOIN users parent ON parent.id = a.parent_id
             LEFT JOIN role_hierarchy rh ON rh.parent_role_id = parent.role_id AND rh.child_role_id = a.role_id
            WHERE a.cycle_found = 0 AND a.hierarchy_level < 128
         ) SELECT id, parent_id, role_id, hierarchy_level, edge_valid, cycle_found FROM ancestors ORDER BY hierarchy_level`,
        [userId],
      );
      if (rows.some((row) => !row.edge_valid || row.cycle_found)) throw invalid("User hierarchy could not be verified", "HIERARCHY_CONFIGURATION_INVALID");
      if (Number(rows.at(-1)?.hierarchy_level) === 128 && rows.at(-1)?.parent_id != null) {
        throw invalid("User hierarchy exceeds the supported verification depth", "HIERARCHY_CONFIGURATION_INVALID");
      }
      const selected = rows.filter((row) => wantedLevels.includes(Number(row.hierarchy_level)));
      return { eligibilityResolved: true, ancestors: selected.map((row) => ({ userId: row.id, roleId: row.role_id, hierarchyLevel: Number(row.hierarchy_level) })) };
    },
    async updateSettlement(requestId, { status, amountPaise, evidenceType, evidenceReference, gateway = "PREMIUM_PG_3", providerSettlementReference = null }) {
      const allowed = ["SETTLEMENT_PENDING", "SETTLED", "SETTLEMENT_FAILED", "UNCONFIRMED"];
      if (!allowed.includes(status)) throw invalid("Invalid settlement status", "SETTLEMENT_STATUS_INVALID");
      return transaction(async (connection) => {
        const [rows] = await connection.execute("SELECT id, status AS paymentStatus, settlement_status AS settlementStatus FROM payment_transactions WHERE request_id = ? AND gateway = ? FOR UPDATE", [requestId, gateway]);
        if (!rows.length) return null;
        if (status === "SETTLED" && rows[0].paymentStatus !== "SUCCESS") throw invalid("Settlement cannot be confirmed before payment success", "PAYMENT_NOT_SUCCESSFUL");
        const amount = amountPaise == null ? null : String(amountPaise);
        const fingerprint = digest(JSON.stringify({ requestId, gateway, providerSettlementReference, status, amount, evidenceType: evidenceType || "INTERNAL", evidenceReference: evidenceReference || null }));
        const [duplicate] = await connection.execute("SELECT id FROM payment_settlements WHERE gateway = ? AND settlement_fingerprint = ? LIMIT 1", [gateway, fingerprint]);
        if (duplicate.length) return { request_id: requestId, settlement_status: rows[0].settlementStatus, payment_status: rows[0].paymentStatus, duplicate: true };
        const nextSettlementStatus = transitionSettlement(rows[0].settlementStatus, status);
        await connection.execute("UPDATE payment_transactions SET settlement_status = ?, settlement_amount_paise = ? WHERE id = ?", [nextSettlementStatus, amount, rows[0].id]);
        await connection.execute(
          `INSERT INTO payment_settlements (payment_transaction_id, gateway, provider_settlement_reference, settlement_fingerprint, status, amount_paise, evidence_type, evidence_reference)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [rows[0].id, gateway, providerSettlementReference, fingerprint, nextSettlementStatus === "SETTLED" ? "SETTLED" : nextSettlementStatus === "SETTLEMENT_FAILED" ? "FAILED" : nextSettlementStatus === "SETTLEMENT_PENDING" ? "PENDING" : "UNKNOWN", amount, evidenceType || "INTERNAL", evidenceReference || null],
        );
        return { request_id: requestId, settlement_status: nextSettlementStatus, payment_status: rows[0].paymentStatus };
      });
    },
    async postWalletLedgerCommissionsAtomically({ requestId, walletCreditPaise }) {
      const credit = String(walletCreditPaise ?? "");
      if (!/^\d+$/.test(credit) || BigInt(credit) <= 0n) throw invalid("An approved wallet credit amount in paise is required", "WALLET_CREDIT_AMOUNT_INVALID");
      return transaction(async (connection) => {
        const [rows] = await connection.execute("SELECT * FROM payment_transactions WHERE request_id = ? FOR UPDATE", [requestId]);
        const payment = rows[0];
        if (!payment || payment.operation !== "ADD_MONEY_DIAMOND_4" || payment.status !== "SUCCESS" || payment.settlement_status !== "SETTLED") throw invalid("Wallet and commission posting requires a settled Add Money transaction", "PAYMENT_NOT_SETTLED");
        const [already] = await connection.execute("SELECT id, entry_type, amount_paise, posting_key, source_type FROM wallet_ledger_entries WHERE source_request_id = ?", [requestId]);
        const charges = parseJson(payment.charges_snapshot) || {};
        const payableCommissions = (charges.commissions || []).filter((item) => String(item.amountPaise) !== "0");
        if (already.length) {
          const principal = already.find((entry) => entry.source_type === "ADD_MONEY");
          if (!principal || String(principal.amount_paise) !== credit || already.length !== 1 + payableCommissions.length) throw invalid("Financial posting record is incomplete or conflicts with replay", "FINANCIAL_POSTING_CONFLICT");
          return { duplicate: true, request_id: requestId };
        }
        const ownerWalletId = await getActiveWallet(connection, payment.user_id);
        const walletCreditKey = digest(`${requestId}:wallet-credit:${payment.user_id}`);
        await connection.execute("INSERT INTO wallet_ledger_entries (wallet_id, user_id, entry_type, amount_paise, source_type, source_request_id, posting_key) VALUES (?, ?, 'CREDIT', ?, 'ADD_MONEY', ?, ?)", [ownerWalletId, payment.user_id, credit, requestId, walletCreditKey]);
        await connection.execute("UPDATE wallets SET balance_paise = balance_paise + ? WHERE id = ?", [credit, ownerWalletId]);
        for (const commission of charges.commissions || []) {
          const amount = String(commission.amountPaise || "");
          const payeeId = commission.userId;
          const level = Number(commission.hierarchyLevel);
          if (!/^\d+$/.test(amount) || !/^\d+$/.test(String(payeeId)) || String(payeeId) === String(payment.initiator_user_id) || !Number.isSafeInteger(level) || level < 1 || !payment.scheme_configuration_id) {
            throw invalid("Stored commission attribution is incomplete", "COMMISSION_POSTING_INVALID");
          }
          if (BigInt(amount) === 0n) continue;
          const commissionWalletId = await getActiveWallet(connection, payeeId);
          const postingKey = digest(`${requestId}:commission:${payeeId}:${level}`);
          await connection.execute("INSERT INTO hierarchy_commission_entries (payee_user_id, configuration_id, hierarchy_level, amount_paise, source_request_id, posting_key) VALUES (?, ?, ?, ?, ?, ?)", [payeeId, payment.scheme_configuration_id, level, amount, requestId, postingKey]);
          await connection.execute("INSERT INTO wallet_ledger_entries (wallet_id, user_id, entry_type, amount_paise, source_type, source_request_id, posting_key) VALUES (?, ?, 'CREDIT', ?, 'HIERARCHY_COMMISSION', ?, ?)", [commissionWalletId, payeeId, amount, requestId, digest(`${postingKey}:ledger`)]);
          await connection.execute("UPDATE wallets SET balance_paise = balance_paise + ? WHERE id = ?", [amount, commissionWalletId]);
        }
        return { duplicate: false, request_id: requestId };
      });
    },
    async listBeneficiaries({ userId }) {
      const [rows] = await db.execute("SELECT id, gateway, display_name, masked_account_reference, verification_status, status, created_at FROM payout_beneficiaries WHERE user_id = ? ORDER BY id DESC", [userId]);
      return rows;
    },
    async findBeneficiaryForUser({ userId, beneficiaryId }) {
      const [rows] = await db.execute("SELECT id, user_id, gateway, provider_beneficiary_reference, display_name, masked_account_reference, verification_status, status FROM payout_beneficiaries WHERE id = ? AND user_id = ? LIMIT 1", [beneficiaryId, userId]);
      return rows[0] || null;
    },
    async assertPayoutBeneficiaryEligible() { throw notConfigured("Payout beneficiary eligibility policy"); },
    async recordBeneficiaryVerification({ userId, beneficiaryId, normalizedResult }) {
      const status = normalizedResult?.status;
      if (!["PENDING", "VERIFIED", "FAILED", "UNKNOWN"].includes(status)) throw invalid("Provider returned an invalid beneficiary verification status");
      const [result] = await db.execute("UPDATE payout_beneficiaries SET verification_status = ? WHERE id = ? AND user_id = ?", [status, beneficiaryId, userId]);
      return result.affectedRows ? this.findBeneficiaryForUser({ userId, beneficiaryId }) : null;
    },
    async verifyBeneficiary(args) { return this.recordBeneficiaryVerification(args); },
    async createBeneficiary({ userId, normalized }) {
      if (!normalized || typeof normalized.providerReference !== "string" || !normalized.providerReference || normalized.providerReference.length > 255) throw invalid("Provider beneficiary reference is invalid");
      const gateway = typeof normalized.gateway === "string" ? normalized.gateway : "UNCONFIGURED";
      const verification = ["NOT_VERIFIED", "PENDING", "VERIFIED", "FAILED", "UNKNOWN"].includes(normalized.verificationStatus) ? normalized.verificationStatus : "UNKNOWN";
      const [result] = await db.execute("INSERT INTO payout_beneficiaries (user_id, gateway, provider_beneficiary_reference, display_name, masked_account_reference, verification_status) VALUES (?, ?, ?, ?, ?, ?)", [userId, gateway, normalized.providerReference, boundedText(normalized.displayName, 120), boundedText(normalized.maskedAccountReference, 80), verification]);
      return this.findBeneficiaryForUser({ userId, beneficiaryId: result.insertId });
    },
    async findIdempotentPayout(scope) {
      const [rows] = await db.execute(`SELECT p.* FROM payment_transactions p JOIN payouts o ON o.payment_transaction_id = p.id WHERE p.user_id = ? AND p.operation = ? AND p.idempotency_key = ? LIMIT 1`, [scope.userId, scope.operation, scope.idempotencyKey]);
      return mapPayment(rows[0]);
    },
    async findPayoutBeneficiary({ userId, beneficiaryId }) { return this.findBeneficiaryForUser({ userId, beneficiaryId }); },
    async persistPayout(data) {
      const transactionData = { ...data, gateway: data.gateway || "PAYOUT_UNCONFIGURED", intended_settlement_mode: "NOT_APPLICABLE" };
      const childSql = "INSERT INTO payouts (payment_transaction_id, user_id, beneficiary_id) VALUES (?, ?, ?)";
      const selectSql = "SELECT p.* FROM payment_transactions p JOIN payouts o ON o.payment_transaction_id = p.id WHERE p.user_id = ? AND p.operation = ? AND p.idempotency_key = ? LIMIT 1";
      const result = await persistProductChild({ transactionData, gatewayFallback: "PAYOUT_UNCONFIGURED", childSql, childValues: [data.user_id, data.beneficiary_id], selectSql, selectValues: [data.user_id, data.operation, data.idempotency_key], resultKey: "transaction" });
      return result;
    },
    async updatePayout(requestId, patch) {
      return transaction(async (connection) => {
        const [rows] = await connection.execute("SELECT id, status FROM payment_transactions WHERE request_id = ? AND operation = 'PAYOUT' FOR UPDATE", [requestId]);
        if (!rows.length) return null;
        const next = monotonicProductStatus(rows[0].status, patch.status);
        await connection.execute("UPDATE payment_transactions SET status = ?, reconciliation_required = ? WHERE id = ?", [next, Boolean(patch.reconciliation_required), rows[0].id]);
        await connection.execute("UPDATE payouts SET provider_reference = ? WHERE payment_transaction_id = ?", [patch.provider_reference || null, rows[0].id]);
        const [updated] = await connection.execute(`${PAYMENT_SELECT} WHERE id = ?`, [rows[0].id]);
        return mapPayment(updated[0]);
      });
    },
    async createPayout(data) { return this.persistPayout(data); },
    async findPayoutForUser({ userId, payoutId }) {
      const [rows] = await db.execute("SELECT p.* FROM payment_transactions p JOIN payouts o ON o.payment_transaction_id = p.id WHERE p.id = ? AND p.user_id = ? LIMIT 1", [payoutId, userId]);
      return mapPayment(rows[0]);
    },
    async findPayout({ requestId }) {
      const [rows] = await db.execute("SELECT p.* FROM payment_transactions p JOIN payouts o ON o.payment_transaction_id = p.id WHERE p.request_id = ? LIMIT 1", [requestId]);
      return mapPayment(rows[0]);
    },
    async findIdempotentBillEnquiry(scope) {
      const [rows] = await db.execute("SELECT * FROM credit_card_bill_enquiries WHERE user_id = ? AND idempotency_key = ? LIMIT 1", [scope.userId, scope.idempotencyKey]);
      return mapEnquiry(rows[0]);
    },
    async persistBillEnquiry(enquiry) {
      return transaction(async (connection) => {
        try {
          const [result] = await connection.execute("INSERT INTO credit_card_bill_enquiries (user_id, request_id, idempotency_key, idempotency_payload_hash, customer_reference_hash, status) VALUES (?, ?, ?, ?, ?, ?)", [enquiry.user_id, enquiry.request_id, enquiry.idempotency_key, enquiry.idempotency_payload_hash, enquiry.customer_reference_hash, enquiry.status]);
          const [rows] = await connection.execute("SELECT * FROM credit_card_bill_enquiries WHERE id = ?", [result.insertId]);
          return { created: true, enquiry: mapEnquiry(rows[0]) };
        } catch (error) {
          if (error.code !== "ER_DUP_ENTRY") throw error;
          const [rows] = await connection.execute("SELECT * FROM credit_card_bill_enquiries WHERE user_id = ? AND idempotency_key = ? FOR UPDATE", [enquiry.user_id, enquiry.idempotency_key]);
          if (!rows[0]) throw error;
          return { created: false, enquiry: mapEnquiry(rows[0]) };
        }
      });
    },
    async updateBillEnquiry(requestId, patch) {
      return transaction(async (connection) => {
        const [rows] = await connection.execute("SELECT id, status FROM credit_card_bill_enquiries WHERE request_id = ? FOR UPDATE", [requestId]);
        if (!rows.length) return null;
        const status = ["PENDING", "COMPLETED", "FAILED", "UNKNOWN"].includes(patch.status) ? monotonicEnquiryStatus(rows[0].status, patch.status) : rows[0].status;
        const snapshot = status === "COMPLETED" ? patch.snapshot : null;
        await connection.execute("UPDATE credit_card_bill_enquiries SET status = ?, snapshot = COALESCE(?, snapshot), reconciliation_required = ? WHERE id = ?", [status, jsonParam(snapshot), Boolean(patch.reconciliation_required), rows[0].id]);
        const [updated] = await connection.execute("SELECT * FROM credit_card_bill_enquiries WHERE id = ?", [rows[0].id]);
        return mapEnquiry(updated[0]);
      });
    },
    async findBillEnquiryForUser({ userId, enquiryId }) {
      const [rows] = await db.execute("SELECT * FROM credit_card_bill_enquiries WHERE id = ? AND user_id = ? LIMIT 1", [enquiryId, userId]);
      return mapEnquiry(rows[0]);
    },
    async createBillEnquiry(enquiry) { return this.persistBillEnquiry(enquiry); },
    async findBillEnquiry({ requestId }) { return this.findBillEnquiryByRequestId(requestId); },
    async findBillEnquiryByRequestId(requestId) {
      const [rows] = await db.execute("SELECT * FROM credit_card_bill_enquiries WHERE request_id = ? LIMIT 1", [requestId]);
      return mapEnquiry(rows[0]);
    },
    async findIdempotentBillPayment(scope) {
      const [rows] = await db.execute("SELECT p.* FROM payment_transactions p JOIN credit_card_bill_payments b ON b.payment_transaction_id = p.id WHERE p.user_id = ? AND p.operation = ? AND p.idempotency_key = ? LIMIT 1", [scope.userId, scope.operation, scope.idempotencyKey]);
      return mapPayment(rows[0]);
    },
    async persistBillPayment(data) {
      const transactionData = { ...data, gateway: data.gateway || "CREDIT_CARD_BILL_UNCONFIGURED", intended_settlement_mode: "NOT_APPLICABLE" };
      const childSql = "INSERT INTO credit_card_bill_payments (payment_transaction_id, enquiry_id, user_id) VALUES (?, ?, ?)";
      const selectSql = "SELECT p.* FROM payment_transactions p JOIN credit_card_bill_payments b ON b.payment_transaction_id = p.id WHERE p.user_id = ? AND p.operation = ? AND p.idempotency_key = ? LIMIT 1";
      return persistProductChild({ transactionData, gatewayFallback: "CREDIT_CARD_BILL_UNCONFIGURED", childSql, childValues: [data.enquiry_id, data.user_id], selectSql, selectValues: [data.user_id, data.operation, data.idempotency_key], resultKey: "payment" });
    },
    async createBillPayment(data) { return this.persistBillPayment(data); },
    async updateBillPayment(requestId, patch) {
      return transaction(async (connection) => {
        const [rows] = await connection.execute("SELECT id, status FROM payment_transactions WHERE request_id = ? AND operation = 'CREDIT_CARD_BILL_2_PAYMENT' FOR UPDATE", [requestId]);
        if (!rows.length) return null;
        const next = monotonicProductStatus(rows[0].status, patch.status);
        await connection.execute("UPDATE payment_transactions SET status = ?, provider_reference = ?, reconciliation_required = ? WHERE id = ?", [next, patch.provider_reference || null, Boolean(patch.reconciliation_required), rows[0].id]);
        const [updated] = await connection.execute(`${PAYMENT_SELECT} WHERE id = ?`, [rows[0].id]);
        return mapPayment(updated[0]);
      });
    },
    async findBillPaymentForUser({ userId, paymentId }) {
      const [rows] = await db.execute("SELECT p.* FROM payment_transactions p JOIN credit_card_bill_payments b ON b.payment_transaction_id = p.id WHERE p.id = ? AND p.user_id = ? LIMIT 1", [paymentId, userId]);
      return mapPayment(rows[0]);
    },
  });
}

function mapPayment(row) {
  if (!row) return null;
  const result = { ...row, amount_paise: row.amount_paise == null ? null : String(row.amount_paise), settlement_amount_paise: row.settlement_amount_paise == null ? null : String(row.settlement_amount_paise) };
  for (const field of JSON_FIELDS) result[field] = parseJson(row[field]);
  result.charges = result.charges_snapshot;
  return result;
}

function mapEnquiry(row) {
  return row ? { ...row, snapshot: parseJson(row.snapshot) } : null;
}
function parseJson(value) {
  if (value == null || typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return null; }
}
function jsonParam(value) { return value == null ? null : JSON.stringify(value); }
function digest(value) { return createHash("sha256").update(String(value)).digest("hex"); }
function boundedText(value, max) { return typeof value === "string" ? value.slice(0, max) : null; }
function safeReconciliationResult(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = {};
  if (typeof value.status === "string" && /^[A-Z_]{1,32}$/.test(value.status)) result.status = value.status;
  if (typeof value.matched === "boolean") result.matched = value.matched;
  if (typeof value.amountPaise === "string" && /^\d{1,20}$/.test(value.amountPaise)) result.amountPaise = value.amountPaise;
  if (["UNCONFIRMED", "SETTLEMENT_PENDING", "SETTLED", "SETTLEMENT_FAILED"].includes(value.settlementStatus)) result.settlementStatus = value.settlementStatus;
  return result;
}
function monotonicProductStatus(current, incoming) {
  if (!["PENDING", "UNKNOWN", "SUCCESS", "FAILED"].includes(incoming)) throw invalid("Invalid product transaction status");
  if (current === "SUCCESS" || current === "FAILED") return current;
  return incoming;
}
function monotonicEnquiryStatus(current, incoming) {
  if (current === "COMPLETED" || current === "FAILED") return current;
  if (incoming === "UNKNOWN") return current;
  return incoming;
}
function transitionSettlement(current, incoming) {
  if (["SETTLED", "SETTLEMENT_FAILED"].includes(current)) return current;
  if (incoming === "UNCONFIRMED") return current;
  return incoming;
}
async function getActiveWallet(connection, userId) {
  await connection.execute("INSERT INTO wallets (user_id, currency) VALUES (?, 'INR') ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)", [userId]);
  const [rows] = await connection.execute("SELECT id, status FROM wallets WHERE user_id = ? AND currency = 'INR' FOR UPDATE", [userId]);
  if (!rows[0] || rows[0].status !== "ACTIVE") throw invalid("Wallet is unavailable for financial posting", "WALLET_UNAVAILABLE");
  return rows[0].id;
}
function guardDatabaseErrors(raw) {
  const guarded = {
    execute: (...args) => guardedCall(() => raw.execute(...args)),
    getConnection: async () => {
      const connection = await guardedCall(() => raw.getConnection());
      return new Proxy(connection, {
        get(target, property) {
          const value = Reflect.get(target, property);
          if (property === "execute" || property === "query" || property === "beginTransaction" || property === "commit" || property === "rollback") {
            return (...args) => guardedCall(() => value.apply(target, args));
          }
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    },
  };
  return guarded;
}
async function guardedCall(work) {
  try { return await work(); }
  catch (error) {
    if (error instanceof ApiError || error.code === "ER_DUP_ENTRY") throw error;
    throw unavailable("Payment database is unavailable or its required schema is not initialized");
  }
}

export { createMysqlPaymentRepository, mapPayment, mapEnquiry };
export default createMysqlPaymentRepository;
