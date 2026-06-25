# 文档技能运行时 (skills-runtime)

> 为 `.claude/skills/` 下的 **文档产出技能** (docx / pptx / xlsx / pdf) 提供隔离的 Python 运行环境。
> 不污染系统 Python（本机为 Apple CLT Python 3.9.6）。

## venv 路径与用法

```
.claude/skills-runtime/venv/bin/python
```

⚠️ **关键**：docx/pptx/xlsx/pdf 技能的 SKILL.md 里写的是通用 `python scripts/...`。
在本项目中执行这些脚本时，**必须用本 venv 的解释器**，否则找不到依赖库：

```bash
# 正确（用 venv 解释器）
.claude/skills-runtime/venv/bin/python .claude/skills/docx/scripts/office/unpack.py document.docx unpacked/

# 错误（系统 python3 没装这些库）
python3 .claude/skills/docx/scripts/...
```

## 已安装依赖（已验证可用）

| 库 | 版本 | 服务技能 |
|----|------|----------|
| python-docx | 1.2.0 | docx |
| python-pptx | 1.0.2 | pptx |
| openpyxl | 3.1.5 | xlsx |
| pypdf | 6.14.2 | pdf |
| pdfplumber | 0.11.8 | pdf（读取/抽取表格） |
| reportlab | 5.0.0 | pdf（生成） |
| Pillow | 11.3.0 | 图片处理 |
| lxml / defusedxml | 6.1.1 / 0.7.1 | 底层 XML |
| pandas | 2.3.3 | xlsx 数据处理 |
| pdf2image | latest | pdf→图片（需 poppler，见下） |

重装：`.claude/skills-runtime/venv/bin/python -m pip install -r .claude/skills-runtime/requirements.txt`

## 可选的系统级依赖（当前未装，按需补）

这些不影响绝大多数功能，仅特定操作需要：

- **poppler**（`pdftoppm`）— 仅 PDF→图片栅格化需要。读/合并/拆分/表单填写**不需要**。
  安装：`brew install poppler`
- **LibreOffice**（`soffice`）— 仅旧版 `.doc → .docx` 转换需要。直接生成新 .docx **不需要**。
  安装：`brew install --cask libreoffice`
- **markitdown** — 需 Python ≥ 3.10，本机 3.9 无法安装，已跳过。如需可用更高版本 Python 重建 venv。

## 不在 git 跟踪

`venv/` 体积大且与机器绑定，已通过 `.claude/skills-runtime/.gitignore` 排除。
团队其他成员克隆后，按上方"重装"命令本地重建即可。
