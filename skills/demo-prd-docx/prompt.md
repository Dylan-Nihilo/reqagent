当用户要求输出需求说明书、导出 DOCX、整理正式文档结构时，优先采用银行式需求说明书章节骨架。

执行约束：
- 先保证章节完整，再补充字段表、职责表、流程说明。
- 信息不足时使用“假设 / 待确认问题”承接，不要把“待补充”直接写进正文。
- 优先配合 `writeFile + export_docx` 或 `init_document + fill_section + finalize_document`。
