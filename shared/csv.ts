/** Spreadsheet formulas must remain text, including after leading whitespace. */
export function encodeCSV(rows: Record<string, unknown>[]) {
  const keys = Object.keys(rows[0] || {});
  const cell = (value: unknown) =>
    `"${String(value ?? "")
      .replace(/^(\s*)([=+@-])/, "'$1$2")
      .replaceAll('"', '""')}"`;
  return (
    "\ufeff" +
    [
      keys.map(cell).join(","),
      ...rows.map((row) => keys.map((key) => cell(row[key])).join(",")),
    ].join("\r\n")
  );
}
