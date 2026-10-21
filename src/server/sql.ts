// PostgreSQL quoting must survive both migration splitting and Data API binding.
// In particular, PL/pgSQL dollar-quoted bodies are one opaque token.
export function sqlTokens(sql: string): string[] {
  const tokens: string[] = [];
  let index = 0;
  while (index < sql.length) {
    const start = index;
    const rest = sql.slice(index);
    if (rest.startsWith("--")) {
      const end = sql.indexOf("\n", index);
      index = end < 0 ? sql.length : end + 1;
    } else if (rest.startsWith("/*")) {
      let depth = 1;
      index += 2;
      while (depth && index < sql.length) {
        if (sql.startsWith("/*", index)) {
          depth++;
          index += 2;
        } else if (sql.startsWith("*/", index)) {
          depth--;
          index += 2;
        } else index++;
      }
      if (depth) throw new Error("Unclosed SQL comment.");
    } else {
      const dollar = rest.match(/^\$(?:[a-zA-Z_][a-zA-Z_0-9]*)?\$/)?.[0];
      const escaped = /^[eE]'/.test(rest);
      const quote = escaped ? "'" : rest[0];
      if (dollar) {
        const end = sql.indexOf(dollar, index + dollar.length);
        if (end < 0) throw new Error("Unclosed SQL body.");
        index = end + dollar.length;
      } else if (quote === "'" || quote === '"') {
        index += escaped ? 2 : 1;
        let closed = false;
        while (index < sql.length) {
          if (escaped && sql[index] === "\\") index += 2;
          else if (sql[index] === quote) {
            if (sql[index + 1] === quote) index += 2;
            else {
              index++;
              closed = true;
              break;
            }
          } else index++;
        }
        if (!closed) throw new Error("Unclosed SQL quote.");
      } else {
        const parameter = rest.match(/^\$[1-9][0-9]*/)?.[0];
        index += parameter?.length || 1;
      }
    }
    tokens.push(sql.slice(start, index));
  }
  return tokens;
}

export function splitStatements(sql: string) {
  const statements: string[] = [];
  let current = "";
  for (const token of sqlTokens(sql)) {
    if (token === ";") {
      if (current.trim()) statements.push(current.trim());
      current = "";
    } else current += token;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

export function bindParameters(sql: string, count: number) {
  const used = new Set<number>();
  const text = sqlTokens(sql)
    .map((token) => {
      if (!/^\$[1-9][0-9]*$/.test(token)) return token;
      const index = Number(token.slice(1));
      if (index > count) throw new Error("Missing SQL parameter.");
      used.add(index);
      return `:p${index}`;
    })
    .join("");
  if (used.size !== count) throw new Error("Unused SQL parameter.");
  return text;
}
