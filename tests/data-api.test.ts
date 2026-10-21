import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RDSDataClient } from "@aws-sdk/client-rds-data";
import { DataApiTransaction } from "../src/server/data-api";
import { bindParameters, splitStatements } from "../src/server/sql";

test("SQL binding/splitting preserves bodies, quotes and nested comments", () => {
  const sql =
    "SELECT $1, '$2;''x', E'\\\';', \"$4\"; /* outer /* ; */ x */ DO $tag$ BEGIN PERFORM '$1;'; END $tag$; -- $3\n SELECT $1";
  const statements = splitStatements(sql);
  assert.equal(statements.length, 3);
  assert.equal(
    bindParameters(sql, 1),
    sql.replaceAll("SELECT $1", "SELECT :p1"),
  );
  assert.throws(() => bindParameters("SELECT $2", 1));
  assert.throws(() => bindParameters("SELECT 1", 1));
  assert.throws(() => splitStatements("DO $$ broken"));
  assert.throws(() => splitStatements("/* broken"));
  const migration = splitStatements(
    readFileSync("db/migrations/001_foundation.sql", "utf8"),
  );
  assert.ok(
    migration.some((sql) => sql.startsWith("CREATE TABLE hoa.communities")),
  );
  assert.ok(
    migration.some(
      (sql) =>
        sql.includes("CREATE FUNCTION hoa.review_registration") &&
        sql.includes("END $$"),
    ),
  );
});

test("Data API keeps one explicit transaction and preserves parameter/result types", async () => {
  const commands: { name: string; input: Record<string, unknown> }[] = [];
  const client = {
    send: async (command: {
      constructor: { name: string };
      input: Record<string, unknown>;
    }) => {
      commands.push({ name: command.constructor.name, input: command.input });
      if (command.constructor.name === "BeginTransactionCommand")
        return { transactionId: "transaction-1" };
      if (command.constructor.name === "ExecuteStatementCommand")
        return {
          columnMetadata: [
            { name: "document", typeName: "jsonb" },
            { name: "allowed", typeName: "bool" },
          ],
          records: [[{ stringValue: '{"ok":true}' }, { booleanValue: true }]],
        };
      return {};
    },
  } as unknown as RDSDataClient;
  const transaction = new DataApiTransaction(client, {
    resourceArn: "cluster",
    secretArn: "runtime-secret",
    database: "hoa",
  });
  await assert.rejects(transaction.query("SELECT 1"), /explicit/);
  await transaction.begin();
  const result = await transaction.query("SELECT $1::jsonb, $2, $3, $4, $5", [
    { ok: true },
    true,
    12,
    "text",
    null,
  ]);
  assert.deepEqual(result.rows, [{ document: { ok: true }, allowed: true }]);
  await transaction.commit();
  await transaction.rollback();
  assert.equal(commands.length, 3);
  assert.equal(commands[1].input.transactionId, "transaction-1");
  assert.equal(commands[2].input.transactionId, "transaction-1");
  assert.equal(commands[1].input.sql, "SELECT :p1::jsonb, :p2, :p3, :p4, :p5");
  assert.deepEqual(commands[1].input.parameters, [
    { name: "p1", typeHint: "JSON", value: { stringValue: '{"ok":true}' } },
    { name: "p2", value: { booleanValue: true } },
    { name: "p3", value: { longValue: 12 } },
    { name: "p4", value: { stringValue: "text" } },
    { name: "p5", value: { isNull: true } },
  ]);
});

test("Data API sanitizes SQL errors and never replays an ambiguous commit", async () => {
  const names: string[] = [];
  const client = {
    send: async (command: { constructor: { name: string } }) => {
      const name = command.constructor.name;
      names.push(name);
      if (name === "BeginTransactionCommand") return { transactionId: "t" };
      if (name === "ExecuteStatementCommand")
        throw new Error("private query and data; SQLState: 23505");
      throw new Error("response lost");
    },
  } as unknown as RDSDataClient;
  const transaction = new DataApiTransaction(client, {
    resourceArn: "cluster",
    secretArn: "runtime",
    database: "hoa",
  });
  await transaction.begin();
  await assert.rejects(transaction.query("SELECT 1"), (error: unknown) => {
    assert.equal((error as { code: string }).code, "23505");
    assert.equal((error as Error).message, "Database operation failed.");
    return true;
  });
  await assert.rejects(transaction.commit());
  await transaction.rollback();
  assert.deepEqual(names, [
    "BeginTransactionCommand",
    "ExecuteStatementCommand",
    "CommitTransactionCommand",
  ]);
});
