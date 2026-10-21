import {
  RDSDataClient,
  BeginTransactionCommand,
  ExecuteStatementCommand,
  CommitTransactionCommand,
  RollbackTransactionCommand,
  type Field,
  type SqlParameter,
  type ExecuteStatementCommandOutput,
} from "@aws-sdk/client-rds-data";
import { bindParameters } from "./sql";

export interface SqlResult {
  // Queries are internal, static SQL; callers validate untrusted input separately.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[];
  rowCount: number | null;
}
export interface SqlClient {
  query(sql: string, values?: unknown[]): Promise<SqlResult>;
}
export interface DataApiConfig {
  resourceArn: string;
  secretArn: string;
  database: string;
}

function parameter(value: unknown, index: number): SqlParameter {
  const name = `p${index + 1}`;
  if (value === null || value === undefined)
    return { name, value: { isNull: true } };
  if (typeof value === "boolean")
    return { name, value: { booleanValue: value } };
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Invalid SQL number.");
    return {
      name,
      value: Number.isSafeInteger(value)
        ? { longValue: value }
        : { doubleValue: value },
    };
  }
  if (value instanceof Date)
    return { name, value: { stringValue: value.toISOString() } };
  if (typeof value === "object")
    return {
      name,
      typeHint: "JSON",
      value: { stringValue: JSON.stringify(value) },
    };
  if (typeof value !== "string") throw new Error("Unsupported SQL parameter.");
  return { name, value: { stringValue: value } };
}

function decode(field: Field, type?: string): unknown {
  if (field.isNull) return null;
  if (field.stringValue !== undefined) {
    if (type === "json" || type === "jsonb")
      return JSON.parse(field.stringValue);
    return field.stringValue;
  }
  if (field.booleanValue !== undefined) return field.booleanValue;
  if (field.longValue !== undefined) return field.longValue;
  if (field.doubleValue !== undefined) return field.doubleValue;
  throw new Error(
    "Unsupported Data API result type; cast the SQL result explicitly.",
  );
}

export class DataApiTransaction implements SqlClient {
  private transactionId?: string;
  constructor(
    private client: RDSDataClient,
    private connection: DataApiConfig,
  ) {}
  async begin() {
    // Disable SDK retries: an ambiguous write/commit must never be replayed.
    const result = await this.client.send(
      new BeginTransactionCommand(this.connection),
    );
    if (!result.transactionId)
      throw new Error("No database transaction returned.");
    this.transactionId = result.transactionId;
  }
  async query(sql: string, values: unknown[] = []): Promise<SqlResult> {
    if (!this.transactionId)
      throw new Error("An explicit database transaction is required.");
    try {
      const result: ExecuteStatementCommandOutput = await this.client.send(
        new ExecuteStatementCommand({
          ...this.connection,
          transactionId: this.transactionId,
          sql: bindParameters(sql, values.length),
          parameters: values.map(parameter),
          includeResultMetadata: true,
        }),
      );
      const rows = (result.records || []).map((record) =>
        Object.fromEntries(
          record.map((field, index) => {
            const metadata = result.columnMetadata?.[index];
            if (!metadata?.name)
              throw new Error("Missing SQL column metadata.");
            return [metadata.name, decode(field, metadata.typeName)];
          }),
        ),
      );
      return {
        rows,
        rowCount: result.records
          ? rows.length
          : (result.numberOfRecordsUpdated ?? 0),
      };
    } catch (error) {
      // Preserve only SQLSTATE for existing conflict/error handling. Never propagate
      // provider messages containing SQL, parameters, or personal information.
      const code =
        error instanceof Error
          ? /SQLState:\s*([0-9A-Z]{5})\b/i.exec(error.message)?.[1]
          : undefined;
      throw Object.assign(new Error("Database operation failed."), {
        code: code?.toUpperCase(),
      });
    }
  }
  async commit() {
    const id = this.transactionId;
    this.transactionId = undefined;
    await this.client.send(
      new CommitTransactionCommand({ ...this.connection, transactionId: id }),
    );
  }
  async rollback() {
    if (!this.transactionId) return;
    const id = this.transactionId;
    this.transactionId = undefined;
    await this.client.send(
      new RollbackTransactionCommand({ ...this.connection, transactionId: id }),
    );
  }
}
