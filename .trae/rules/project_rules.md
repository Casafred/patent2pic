# Patent2Pic 项目规则

## 说明书更新规范

### 规则 1：HTML 与 PDF 同步更新

**每次更新用户说明书时，必须同步更新 HTML 和 PDF 两个版本。**

具体要求：

1. **更新顺序**：先更新 `docs/user-manual.html`，再生成 PDF
2. **版本号同步**：HTML 和 PDF 的版本号必须一致，格式为 `VX.X.X`
3. **文件命名**：PDF 文件命名为 `Patent2Pic-用户使用说明书-VX.X.X.pdf`
4. **旧版本处理**：生成新版本 PDF 后，删除旧版本 PDF 文件

### PDF 生成命令

**前置条件**：系统需安装中文字体（如 `fonts-noto-cjk`），否则 PDF 中中文将无法正常显示。

```bash
# 安装中文字体（Ubuntu/Debian）
apt-get install -y fonts-noto-cjk fonts-noto-cjk-extra
fc-cache -f -v
```

```bash
cd /workspace/docs
wkhtmltopdf \
  --enable-local-file-access \
  --page-size A4 \
  --margin-top 25mm \
  --margin-bottom 25mm \
  --margin-left 20mm \
  --margin-right 20mm \
  --encoding UTF-8 \
  user-manual.html \
  Patent2Pic-用户使用说明书-VX.X.X.pdf
```

### 检查清单

更新说明书时，需确认以下事项：

- [ ] HTML 文件版本号已更新
- [ ] HTML 内容已根据最新功能修改
- [ ] PDF 已重新生成
- [ ] 旧版本 PDF 已删除
- [ ] 变更已提交到 main 分支

### 相关文档

- 说明书撰写规范：`docs/说明书撰写规范.md`
- Windows 打包流程规范：`docs/Windows打包流程规范.md`

---

## 代码合并与提交安全规范

### 背景

2026-05-28 发生严重事故：提交 `0865ee8`（fix: 数据持久化保存翻译和折叠状态）在修改文件时，无意中将 `dcf1428`（feat: 翻译合并到AI抽取流程，先翻译再拆句对齐）的核心改动全部回退，导致以下功能丢失：

- `prompt.ts` 中 `translatedClaim` 字段要求和翻译一致性要求被删除
- `types/ai.ts` 中 `translatedClaim` 字段被删除
- `extractor.ts` 中 `translatedClaim` 解析被删除
- `useAIExtract.ts` 中 `alignTranslationToSentences` 对齐逻辑被删除，回退到旧的逐句翻译流程
- `translation-aligner.ts` 中变量名被修改

**根因**：合并/修改时未对比目标分支最新代码，直接基于旧版本文件进行修改，覆盖了中间提交的增量改动。

### 规则 2：合并前必须获取最新代码

**在执行任何合并、cherry-pick、rebase 操作前，必须先拉取远端最新代码。**

```bash
git fetch origin
git pull origin main
```

禁止基于本地缓存的旧版本进行合并操作。

### 规则 3：修改文件前必须对比最新版本

**在修改任何文件之前，必须先确认该文件在目标分支上的最新状态。**

操作步骤：

1. 拉取最新代码后，先用 `git log --oneline -N` 查看最近 N 条提交
2. 对即将修改的每个文件，执行 `git diff HEAD~N HEAD -- <file>` 检查近期是否有其他提交修改了同一文件
3. 如果同一文件近期有其他提交修改，必须基于最新版本进行增量修改，而非基于旧版本覆盖

### 规则 4：合并后自检清单

**每次合并或修改完成后，必须执行以下自检：**

#### 4.1 功能完整性检查

对本次修改涉及的每个功能模块，确认其关键代码仍然存在：

```bash
# 示例：检查翻译对齐功能是否完整
grep -n "translatedClaim" src/types/ai.ts
grep -n "translatedClaim" src/services/ai/prompt.ts
grep -n "translatedClaim" src/services/ai/extractor.ts
grep -n "alignTranslationToSentences" src/composables/useAIExtract.ts
```

#### 4.2 差异对比检查

将修改后的代码与合并前的最新版本进行对比，确认只有预期的变更：

```bash
# 对比工作区与最新提交的差异
git diff HEAD -- src/

# 重点检查是否有意外删除的代码（以 - 开头但非预期的行）
git diff HEAD -- src/ | grep "^-" | grep -v "^---"
```

#### 4.3 构建验证

修改后必须通过完整构建验证：

```bash
cd /workspace && npm run build
```

TypeScript 编译通过仅表示类型正确，不代表功能完整。还需检查构建产物大小是否合理变化。

### 规则 5：打包前功能确认

**在执行打包之前，必须确认以下事项：**

1. 拉取远端最新代码：`git pull origin main`
2. 查看最新提交列表：`git log --oneline -10`
3. 确认所有预期功能的提交都在历史中
4. 对关键功能文件执行 `grep` 检查核心代码是否存在
5. 运行 `npm run build` 确认编译通过

### 规则 6：高敏感文件清单

以下文件在修改时需特别小心，因为它们是多个功能交叉修改的热点文件：

| 文件 | 涉及功能 | 修改时注意事项 |
|------|----------|---------------|
| `src/composables/useAIExtract.ts` | AI抽取、翻译对齐、翻译流程 | 修改前必须检查 `alignTranslationToSentences` 和 `translatedClaim` 相关代码是否完整 |
| `src/services/ai/prompt.ts` | 提示词、翻译一致性要求 | 修改前必须检查四个模板中 `translatedClaim` 相关内容是否完整 |
| `src/services/ai/extractor.ts` | 结果解析 | 修改前必须检查 `translatedClaim` 字段解析是否完整 |
| `src/types/ai.ts` | 类型定义 | 修改前必须检查 `ExtractResult.translatedClaim` 字段是否存在 |
| `src/services/claim/translation-aligner.ts` | 翻译对齐算法 | 修改前必须检查 `alignTranslationToSentences` 导出函数是否完整 |
| `src/stores/translation.ts` | 翻译状态管理 | 修改前必须检查 `toJSON`/`fromJSON`/`updateTranslatedText` 方法是否存在 |
| `src/components/input/ClaimReader.vue` | 阅读器双栏对照 | 修改前必须检查 `translationEnabled`、`hasGraphData`、翻译栏渲染逻辑是否完整 |
| `src/composables/useExportExcel.ts` | Excel导出 | 修改前必须检查 Blob 类型转换逻辑是否完整 |
| `src/composables/useAutoSave.ts` | 自动保存 | 修改前必须检查 `translations` 和 `isInputCollapsed` 持久化逻辑是否完整 |
| `src/composables/useProjectFile.ts` | 项目文件 | 同 useAutoSave |

### 规则 7：禁止全文件覆盖式修改

**严禁用旧版本文件直接覆盖当前版本文件。**

正确做法：
- 使用 `SearchReplace` 进行精确的增量修改
- 每次修改前先 `Read` 当前文件最新内容
- 修改后立即 `git diff` 确认变更范围

错误做法：
- 从某个提交导出文件后直接覆盖当前文件
- 不检查当前文件状态就写入内容
