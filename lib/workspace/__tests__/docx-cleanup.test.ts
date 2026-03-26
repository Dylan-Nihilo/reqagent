import { describe, it, expect } from "vitest";
import { removeEmptyTableRows } from "../docx-support";
import { removeEmptyParagraphs } from "../docx-support";

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

describe("removeEmptyParagraphs", () => {
  it("removes paragraphs with no text", () => {
    const xml = [
      '<w:p><w:pPr><w:pStyle w:val="a"/></w:pPr></w:p>',
      '<w:p><w:r><w:t>Keep me</w:t></w:r></w:p>',
      '<w:p><w:pPr/></w:p>',
    ].join("");
    const result = removeEmptyParagraphs(xml);
    expect(result).toContain("Keep me");
    expect((result.match(/<w:p[\s>]/g) ?? []).length).toBe(1);
  });

  it("preserves paragraphs with page breaks", () => {
    const xml = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
    const result = removeEmptyParagraphs(xml);
    expect(result).toContain("w:br");
  });

  it("preserves paragraphs with section breaks", () => {
    const xml = '<w:p><w:pPr><w:sectPr/></w:pPr></w:p>';
    const result = removeEmptyParagraphs(xml);
    expect(result).toContain("w:sectPr");
  });

  it("preserves paragraphs with field codes (TOC, PAGEREF)", () => {
    const xml = '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r></w:p>';
    const result = removeEmptyParagraphs(xml);
    expect(result).toContain("w:fldChar");
  });

  it("preserves paragraphs inside table cells", () => {
    const xml = '<w:tbl><w:tr><w:tc><w:p><w:pPr/></w:p></w:tc></w:tr></w:tbl>';
    const result = removeEmptyParagraphs(xml);
    expect(result).toContain("<w:p");
  });

  it("preserves paragraphs with VML images (<w:pict>)", () => {
    const xml = '<w:p><w:r><w:pict><v:shape>img</v:shape></w:pict></w:r></w:p>';
    const result = removeEmptyParagraphs(xml);
    expect(result).toContain("w:pict");
  });

  it("preserves paragraphs inside nested tables", () => {
    const xml = [
      '<w:tbl><w:tr><w:tc>',
      '<w:tbl><w:tr><w:tc><w:p><w:pPr/></w:p></w:tc></w:tr></w:tbl>',
      '</w:tc></w:tr></w:tbl>',
    ].join("");
    const result = removeEmptyParagraphs(xml);
    expect((result.match(/<w:p[\s>]/g) ?? []).length).toBe(1);
  });
});
