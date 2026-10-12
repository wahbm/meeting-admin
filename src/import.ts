// 文件解析独立加载，避免把表格处理库放入登录和会议列表首屏。
export function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (quoted) throw Error("CSV引号未闭合");
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  if (!rows.length) return [];
  const headers = rows.shift()!.map((v) => v.replace(/^\uFEFF/, "").trim());
  return rows.map((r) =>
    Object.fromEntries(headers.map((h, i) => [h, r[i] || ""])),
  );
}
export async function parseImport(file: File) {
  if (file.size > 10 * 1024 * 1024) throw Error("名单导入文件不能超过10MB");
  if (file.name.toLowerCase().endsWith(".csv"))
    return parseCSV(await file.text());
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw Error("仅支持CSV/XLSX");
  const { default: ExcelJS } = await import("exceljs");
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await file.arrayBuffer());
  const sheet = book.worksheets[0];
  if (!sheet) return [];
  const headers: string[] = [];
  sheet.getRow(1).eachCell((c, i) => (headers[i - 1] = c.text.trim()));
  const rows: Record<string, string>[] = [];
  sheet.eachRow((row, n) => {
    if (n === 1) return;
    const out: Record<string, string> = {};
    for (const [i, header] of headers.entries())
      if (header) out[header] = row.getCell(i + 1).text;
    rows.push(out);
  });
  return rows;
}
