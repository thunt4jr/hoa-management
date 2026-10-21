import test from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { RDSDataClient, type SqlParameter } from "@aws-sdk/client-rds-data";
import { DataApiTransaction } from "../src/server/data-api";
import { ids } from "../scripts/seed";

test("Data API protocol adapter preserves real PostgreSQL RLS and context cleanup", async () => {
  // Only the AWS envelope is emulated. Every statement/transaction runs against
  // isolated PostgreSQL as hoa_runtime. Live Data API still needs an AWS smoke test.
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const connection = await pool.connect();
  const client = {
    send: async (command: {
      constructor: { name: string };
      input: {
        sql?: string;
        parameters?: SqlParameter[];
        transactionId?: string;
      };
    }) => {
      const name = command.constructor.name;
      if (name === "BeginTransactionCommand") {
        await connection.query("BEGIN");
        return { transactionId: "local-transaction" };
      }
      assert.equal(command.input.transactionId, "local-transaction");
      if (name === "CommitTransactionCommand") {
        await connection.query("COMMIT");
        return {};
      }
      if (name === "RollbackTransactionCommand") {
        await connection.query("ROLLBACK");
        return {};
      }
      const parameters = (command.input.parameters || []).map((parameter) => {
        const value = parameter.value!;
        return value.isNull
          ? null
          : (value.stringValue ??
              value.booleanValue ??
              value.longValue ??
              value.doubleValue);
      });
      const result = await connection.query(
        command.input.sql!.replace(/:p([0-9]+)/g, "$$$1"),
        parameters,
      );
      return {
        columnMetadata: result.fields.map((field) => ({
          name: field.name,
          typeName: field.dataTypeID === 16 ? "bool" : "text",
        })),
        records: result.rows.map((row) =>
          result.fields.map((field) => {
            const value = row[field.name];
            if (value === null) return { isNull: true };
            if (typeof value === "boolean") return { booleanValue: value };
            return { stringValue: String(value) };
          }),
        ),
        numberOfRecordsUpdated: result.rowCount,
      };
    },
  } as unknown as RDSDataClient;
  const transaction = new DataApiTransaction(client, {
    resourceArn: "local-emulation",
    secretArn: "runtime",
    database: "postgres",
  });
  try {
    await transaction.begin();
    await transaction.query(
      "SELECT set_config('app.user_id',$1,true),set_config('app.community_id',$2,true),set_config('app.mfa','true',true)",
      [ids.manager, ids.courtyard],
    );
    const result = await transaction.query("SELECT id FROM hoa.communities");
    assert.deepEqual(result.rows, [{ id: ids.courtyard }]);
    assert.equal(
      (
        await transaction.query(
          "SELECT id FROM hoa.communities WHERE id=$1::uuid",
          [ids.lake],
        )
      ).rowCount,
      0,
    );
    await transaction.commit();
    await transaction.begin();
    assert.equal(
      (await transaction.query("SELECT id FROM hoa.communities")).rowCount,
      0,
    );
    await transaction.query(
      "SELECT set_config('app.user_id',$1,true),set_config('app.community_id',$2,true),set_config('app.mfa','true',true)",
      [ids.manager, ids.lake],
    );
    await transaction.rollback();
    await transaction.begin();
    assert.equal(
      (await transaction.query("SELECT id FROM hoa.communities")).rowCount,
      0,
    );
    await transaction.commit();
  } finally {
    await transaction.rollback();
    connection.release();
    await pool.end();
  }
});
