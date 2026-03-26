import { describe, it, expect } from "vitest";
import { removeEmptyTableRows } from "../docx-support";

describe("removeEmptyTableRows", () => {
  it("removes rows where all cells are empty", () => {
    const xml = [
      '<w:tbl>',
      '<w:tr><w:tc><w:p><w:r><w:t>Header</w:t></w:r></w:p></w:tc></w:tr>',
      '<w:tr><w:tc><w:p><w:r><w:t>Data</w:t></w:r></w:p></w:tc></w:tr>',
      '<w:tr><w:tc><w:p><w:pPr/></w:p></w:tc><w:tc><w:p/></w:tc></w:tr>',
      '</w:tbl>',
    ].join("");
    const result = removeEmptyTableRows(xml);
    expect(result).toContain("Header");
    expect(result).toContain("Data");
    expect((result.match(/<w:tr/g) ?? []).length).toBe(2);
  });

  it("preserves rows with at least one non-empty cell", () => {
    const xml = [
      '<w:tbl>',
      '<w:tr><w:tc><w:p><w:r><w:t>1</w:t></w:r></w:p></w:tc><w:tc><w:p/></w:tc></w:tr>',
      '</w:tbl>',
    ].join("");
    const result = removeEmptyTableRows(xml);
    expect((result.match(/<w:tr/g) ?? []).length).toBe(1);
  });

  it("preserves header rows in tables with mixed content", () => {
    const header = '<w:tr><w:tc><w:p><w:r><w:t>序号</w:t></w:r></w:p></w:tc></w:tr>';
    const data = '<w:tr><w:tc><w:p><w:r><w:t>1</w:t></w:r></w:p></w:tc></w:tr>';
    const empty = '<w:tr><w:tc><w:p/></w:tc></w:tr>';
    const xml = `<w:tbl>${header}${data}${empty}${empty}${empty}</w:tbl>`;
    const result = removeEmptyTableRows(xml);
    expect((result.match(/<w:tr/g) ?? []).length).toBe(2);
  });

  it("preserves rows containing nested tables (never remove)", () => {
    const row = [
      '<w:tr><w:tc>',
      '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Nested</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',
      '</w:tc></w:tr>',
    ].join("");
    const xml = `<w:tbl>${row}</w:tbl>`;
    const result = removeEmptyTableRows(xml);
    expect(result).toContain("Nested");
    expect((result.match(/<w:tr/g) ?? []).length).toBe(2);
  });

  it("handles multiple tables independently", () => {
    const table1 = '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p/></w:tc></w:tr></w:tbl>';
    const table2 = '<w:tbl><w:tr><w:tc><w:p/></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>B</w:t></w:r></w:p></w:tc></w:tr></w:tbl>';
    const result = removeEmptyTableRows(table1 + table2);
    expect(result).toContain("A");
    expect(result).toContain("B");
    expect((result.match(/<w:tr/g) ?? []).length).toBe(2);
  });
});
