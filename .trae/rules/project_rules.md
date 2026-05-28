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
