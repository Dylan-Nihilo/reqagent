from __future__ import annotations

import html
import re
import shutil
import tempfile
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_CANDIDATES = [
    ROOT
    / ".reqagent"
    / "workspaces"
    / "ws_77420f3f-2cde-47b7-8b0c-c03abe621356-636865ed732e"
    / "docs"
    / "零售业务需求说明书_精细模板.docx",
    ROOT
    / ".reqagent"
    / "workspaces"
    / "ws_e2e_502d792d79cd-aac0f0cc7e41"
    / "docs"
    / "零售业务需求说明书_精细模板.docx",
]
OUTPUT = ROOT / "docs" / "零售业务需求说明书_精细模板_clean.docx"
LEGACY_TERMS = [
    "注意：此项必填",
    "注意：仅涉及到使用并不涉及商务采购的也算使用",
    "数据流向如下流程图",
    "零售水晶球",
    "新增代发管理",
    "非标准化代发",
    "非标代发",
    "零售集市",
]


def resolve_source() -> Path:
    for candidate in SOURCE_CANDIDATES:
        if candidate.exists():
            return candidate
    raise FileNotFoundError("未找到可清洗的零售业务需求说明书模板")


def extract_xml_text(xml: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", xml)).replace("\xa0", " ").strip()


def remove_legacy_paragraphs(document_xml: str) -> str:
    def _replace(match: re.Match[str]) -> str:
        paragraph_xml = match.group(0)
        text = re.sub(r"\s+", " ", extract_xml_text(paragraph_xml)).strip()
        if not text and ("<w:object" in paragraph_xml or "<w:pict" in paragraph_xml):
            return ""
        if any(term in text for term in LEGACY_TERMS):
            return ""
        if text.startswith("SR_") or "SR_{{" in text:
            return ""
        if "根据业务流程，进行简要的业务功能划分。" in text:
            return ""
        if "<w:object" in paragraph_xml or "<w:pict" in paragraph_xml:
            return ""
        return paragraph_xml

    return re.sub(r"<w:p\b[\s\S]*?</w:p>", _replace, document_xml)


def collect_table_ranges(xml: str) -> list[tuple[int, int]]:
    ranges: list[tuple[int, int]] = []
    depth = 0
    start = 0
    for match in re.finditer(r"<(/?)w:tbl\b[^>]*>", xml):
        is_close = bool(match.group(1))
        if not is_close:
            if depth == 0:
                start = match.start()
            depth += 1
        else:
            depth -= 1
            if depth == 0:
                ranges.append((start, match.end()))
    return ranges


def remove_empty_paragraphs(document_xml: str) -> str:
    table_ranges = collect_table_ranges(document_xml)

    def is_inside_table(position: int) -> bool:
        return any(start <= position < end for start, end in table_ranges)

    def _replace(match: re.Match[str]) -> str:
        paragraph_xml = match.group(0)
        if is_inside_table(match.start()):
            return paragraph_xml
        if extract_xml_text(paragraph_xml):
            return paragraph_xml
        if any(marker in paragraph_xml for marker in ["<w:fldChar", "<w:instrText", "<w:sectPr", '<w:br w:type="page"']):
            return paragraph_xml
        return ""

    return re.sub(r"<w:p\b[\s\S]*?</w:p>", _replace, document_xml)


def clean_relationships(temp_dir: Path, document_xml: str) -> tuple[list[str], list[str]]:
    word_dir = temp_dir / "word"
    rels_path = word_dir / "_rels" / "document.xml.rels"
    rels_xml = rels_path.read_text("utf-8")
    referenced_ids = set(re.findall(r'\br:(?:id|embed|link)="([^"]+)"', document_xml))
    removed_ids: list[str] = []
    missing_targets: list[str] = []
    kept_targets: set[Path] = set()

    relationships = list(
        re.finditer(
            r'<Relationship\b[^>]*Id="([^"]+)"[^>]*Type="([^"]+)"[^>]*Target="([^"]+)"[^>]*/>',
            rels_xml,
        )
    )
    kept_xml: list[str] = []
    for match in relationships:
        rel_id, rel_type, target = match.group(1), match.group(2), match.group(3)
        is_remote = target.startswith("http://") or target.startswith("https://")
        target_path = (word_dir / target).resolve()
        exists = is_remote or target_path.exists()
        if not exists:
            missing_targets.append(target)
        is_media = rel_type.endswith("/image") or rel_type.endswith("/oleObject")
        should_remove = (not exists) or (is_media and rel_id not in referenced_ids)
        if should_remove:
            removed_ids.append(rel_id)
            continue
        kept_xml.append(match.group(0))
        if target.startswith("media/") or target.startswith("embeddings/"):
            kept_targets.add(target_path)

    if relationships:
        prefix = rels_xml[: relationships[0].start()]
        suffix = rels_xml[relationships[-1].end() :]
        rels_path.write_text(prefix + "".join(kept_xml) + suffix, "utf-8")

    for folder_name in ["media", "embeddings"]:
        folder = word_dir / folder_name
        if not folder.exists():
            continue
        for file_path in folder.rglob("*"):
            if file_path.is_dir():
                continue
            if file_path.resolve() not in kept_targets:
                file_path.unlink(missing_ok=True)

    return removed_ids, missing_targets


def repack_docx(temp_dir: Path, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as archive:
        for file_path in temp_dir.rglob("*"):
            if file_path.is_dir():
                continue
            archive.write(file_path, file_path.relative_to(temp_dir))


def main() -> None:
    source = resolve_source()
    with tempfile.TemporaryDirectory(prefix="reqagent-clean-shell-") as temp_dir_raw:
        temp_dir = Path(temp_dir_raw)
        with zipfile.ZipFile(source) as archive:
            archive.extractall(temp_dir)

        document_path = temp_dir / "word" / "document.xml"
        document_xml = document_path.read_text("utf-8")
        document_xml = remove_legacy_paragraphs(document_xml)
        document_xml = remove_empty_paragraphs(document_xml)
        document_path.write_text(document_xml, "utf-8")

        removed_ids, missing_targets = clean_relationships(temp_dir, document_xml)
        repack_docx(temp_dir, OUTPUT)

    print(f"source={source}")
    print(f"output={OUTPUT}")
    print(f"removed_relationship_ids={len(removed_ids)}")
    print(f"missing_targets={len(missing_targets)}")


if __name__ == "__main__":
    main()
