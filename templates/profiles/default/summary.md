# 默认需求说明书模板

- 适用于银行与大型企业的需求说明书生成。
- 包含前言、业务概述、章节机制、功能说明、数据要求与非功能约束。
- 支持特定 feature block（如 3.2.1）与部门职责表、术语表的模板化填充。
- 推荐在导出前先通过 `writeFile` + `export_docx` 或 `init_document` + `fill_section` + `finalize_document` 配合使用。
