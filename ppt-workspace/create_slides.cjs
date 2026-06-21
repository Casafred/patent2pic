const pptxgen = require("pptxgenjs");

// ── Theme ──────────────────────────────────────────────────────────────
const COLORS = {
  primary: "1a3a5c",
  accent: "2d6aa6",
  lightBlue: "4a90d9",
  green: "52c41a",
  orange: "fa8c16",
  purple: "722ed1",
  red: "f5222d",
  white: "FFFFFF",
  lightGray: "F5F7FA",
  midGray: "E8ECF0",
  darkText: "1F2937",
  subText: "6B7280",
  blueBg: "e8f4fd",
  greenBg: "f6ffed",
  orangeBg: "fff7e6",
  purpleBg: "f9f0ff",
};

const FONT = "Microsoft YaHei";
const FONT_EN = "Segoe UI";

// ── Deck ───────────────────────────────────────────────────────────────
const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5
pptx.author = "Patent2Pic";
pptx.subject = "Patent2Pic 功能特性与工作流程";

// ══════════════════════════════════════════════════════════════════════
// Slide 1 — Cover
// ══════════════════════════════════════════════════════════════════════
function buildCover() {
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.primary };

  // Accent stripe
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.8, y: 2.1, w: 0.08, h: 3.2,
    fill: { color: COLORS.lightBlue }, rectRadius: 0.04,
  });

  slide.addText("Patent2Pic", {
    x: 1.2, y: 2.1, w: 10, h: 1.2,
    fontSize: 48, fontFace: FONT_EN,
    color: COLORS.white, bold: true,
  });

  slide.addText("专利功能分解图生成工具", {
    x: 1.2, y: 3.2, w: 10, h: 0.7,
    fontSize: 26, fontFace: FONT,
    color: COLORS.lightBlue,
  });

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 1.2, y: 4.1, w: 2.5, h: 0.03,
    fill: { color: COLORS.lightBlue }, rectRadius: 0.015,
  });

  slide.addText("将专利权利要求文本自动转换为可视化结构图", {
    x: 1.2, y: 4.35, w: 10, h: 0.6,
    fontSize: 16, fontFace: FONT,
    color: "A0B4CC",
  });

  slide.addText("功能特性 & 工作流程概览", {
    x: 1.2, y: 5.8, w: 5, h: 0.5,
    fontSize: 14, fontFace: FONT,
    color: "7A9AB8",
  });
}

// ══════════════════════════════════════════════════════════════════════
// Slide 2 — 产品定位
// ══════════════════════════════════════════════════════════════════════
function buildProductOverview() {
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.white };

  // Header bar
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 13.33, h: 1.1,
    fill: { color: COLORS.primary },
  });
  slide.addText("产品定位", {
    x: 0.8, y: 0.2, w: 5, h: 0.7,
    fontSize: 28, fontFace: FONT, color: COLORS.white, bold: true,
  });

  // Main description card
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.8, y: 1.5, w: 11.7, h: 1.6,
    fill: { color: COLORS.blueBg },
    line: { color: COLORS.accent, width: 1.5 },
    rectRadius: 0.15,
  });
  slide.addText([
    { text: "Patent2Pic ", options: { fontSize: 20, fontFace: FONT_EN, bold: true, color: COLORS.primary } },
    { text: "是一款面向专利从业人员的专业工具软件，能够将专利独立权利要求文本自动转换为可视化结构图（功能分解图）。", options: { fontSize: 16, fontFace: FONT, color: COLORS.darkText } },
  ], { x: 1.2, y: 1.7, w: 11, h: 1.2, valign: "middle" });

  // 3 value cards
  const cards = [
    { icon: "AI", title: "AI 驱动", desc: "集成多种大语言模型\n智能提取技术特征与结构关系", color: COLORS.green, bg: COLORS.greenBg },
    { icon: "VIZ", title: "可视化", desc: "基于图形编辑器\n自动生成清晰规范的专利功能分解图", color: COLORS.accent, bg: COLORS.blueBg },
    { icon: "EFF", title: "高效能", desc: "从文本到图形一键生成\n大幅提升专利分析效率与准确性", color: COLORS.orange, bg: COLORS.orangeBg },
  ];

  cards.forEach((c, i) => {
    const cx = 0.8 + i * 4.05;
    slide.addShape(pptx.ShapeType.roundRect, {
      x: cx, y: 3.6, w: 3.75, h: 2.8,
      fill: { color: c.bg },
      line: { color: c.color, width: 1.5 },
      rectRadius: 0.15,
    });
    slide.addShape(pptx.ShapeType.ellipse, {
      x: cx + 1.45, y: 3.85, w: 0.85, h: 0.85,
      fill: { color: c.color },
    });
    slide.addText(c.icon, {
      x: cx + 1.45, y: 3.85, w: 0.85, h: 0.85,
      fontSize: 16, fontFace: FONT_EN, color: COLORS.white, bold: true, align: "center", valign: "middle",
    });
    slide.addText(c.title, {
      x: cx + 0.2, y: 4.9, w: 3.35, h: 0.5,
      fontSize: 18, fontFace: FONT, color: c.color, bold: true, align: "center",
    });
    slide.addText(c.desc, {
      x: cx + 0.3, y: 5.45, w: 3.15, h: 0.8,
      fontSize: 12, fontFace: FONT, color: COLORS.darkText, align: "center", valign: "top",
    });
  });
}

// ══════════════════════════════════════════════════════════════════════
// Slide 3 — 核心功能架构
// ══════════════════════════════════════════════════════════════════════
function buildCoreFeatures() {
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.white };

  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 13.33, h: 1.1,
    fill: { color: COLORS.primary },
  });
  slide.addText("核心功能架构", {
    x: 0.8, y: 0.2, w: 5, h: 0.7,
    fontSize: 28, fontFace: FONT, color: COLORS.white, bold: true,
  });

  // Center hub
  slide.addShape(pptx.ShapeType.ellipse, {
    x: 5.65, y: 2.9, w: 2.0, h: 2.0,
    fill: { color: COLORS.accent },
  });
  slide.addText("Patent2Pic", {
    x: 5.65, y: 3.2, w: 2.0, h: 1.0,
    fontSize: 16, fontFace: FONT_EN, color: COLORS.white, bold: true, align: "center", valign: "middle",
  });

  // 5 feature nodes
  const features = [
    { title: "智能解析", desc: "自动识别权利要求\n多条同时处理", x: 1.5, y: 1.5, color: "1890FF", bg: COLORS.blueBg },
    { title: "AI 抽取", desc: "DeepSeek / OpenAI / 智谱\n特征+关系自动提取", x: 9.3, y: 1.5, color: COLORS.green, bg: COLORS.greenBg },
    { title: "可视化编辑", desc: "拖拽 · 缩放 · 布局\n样式自定义", x: 1.5, y: 5.0, color: COLORS.orange, bg: COLORS.orangeBg },
    { title: "多格式导出", desc: "PNG · SVG · JSON\n项目文件保存", x: 9.3, y: 5.0, color: COLORS.purple, bg: COLORS.purpleBg },
    { title: "权利要求翻译", desc: "逐句对照 · 高亮同步\n6种语言 · 独立模型", x: 5.4, y: 5.8, color: COLORS.red, bg: "fff1f0" },
  ];

  features.forEach((f) => {
    slide.addShape(pptx.ShapeType.roundRect, {
      x: f.x, y: f.y, w: 2.5, h: 1.5,
      fill: { color: f.bg },
      line: { color: f.color, width: 2 },
      rectRadius: 0.12,
    });
    slide.addText(f.title, {
      x: f.x + 0.1, y: f.y + 0.15, w: 2.3, h: 0.45,
      fontSize: 16, fontFace: FONT, color: f.color, bold: true, align: "center",
    });
    slide.addText(f.desc, {
      x: f.x + 0.1, y: f.y + 0.6, w: 2.3, h: 0.8,
      fontSize: 10, fontFace: FONT, color: COLORS.darkText, align: "center", valign: "top",
    });
  });

  // Arrows from center
  slide.addShape(pptx.ShapeType.rightArrow, { x: 4.0, y: 2.55, w: 1.6, h: 0.06, fill: { color: "1890FF" } });
  slide.addShape(pptx.ShapeType.rightArrow, { x: 7.7, y: 2.55, w: 1.6, h: 0.06, fill: { color: COLORS.green } });
  slide.addShape(pptx.ShapeType.rightArrow, { x: 4.0, y: 5.55, w: 1.6, h: 0.06, fill: { color: COLORS.orange } });
  slide.addShape(pptx.ShapeType.rightArrow, { x: 7.7, y: 5.55, w: 1.6, h: 0.06, fill: { color: COLORS.purple } });
  slide.addShape(pptx.ShapeType.downArrow, { x: 6.6, y: 4.95, w: 0.06, h: 0.8, fill: { color: COLORS.red } });
}

// ══════════════════════════════════════════════════════════════════════
// Slide 4 — 完整工作流程
// ══════════════════════════════════════════════════════════════════════
function buildWorkflow() {
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.white };

  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 13.33, h: 1.1,
    fill: { color: COLORS.primary },
  });
  slide.addText("完整工作流程", {
    x: 0.8, y: 0.2, w: 5, h: 0.7,
    fontSize: 28, fontFace: FONT, color: COLORS.white, bold: true,
  });

  const steps = [
    { num: "01", title: "配置 AI", desc: "选择服务商\n填写 API Key\n测试连接", color: "1890FF", bg: COLORS.blueBg },
    { num: "02", title: "输入文本", desc: "粘贴权利要求\n自动识别分段\n字数统计", color: "1890FF", bg: COLORS.blueBg },
    { num: "03", title: "选择要求", desc: "多条权利要求\n列表切换\n目标选择", color: "1890FF", bg: COLORS.blueBg },
    { num: "04", title: "AI 分析", desc: "特征抽取\n关系识别\n翻译(并行)", color: COLORS.green, bg: COLORS.greenBg },
    { num: "05", title: "编辑调整", desc: "拖拽/缩放\n样式自定义\n自动布局", color: COLORS.orange, bg: COLORS.orangeBg },
    { num: "06", title: "导出保存", desc: "PNG/SVG/JSON\n项目文件(.p2p)\n自动保存", color: COLORS.purple, bg: COLORS.purpleBg },
  ];

  const stepW = 1.7;
  const gap = 0.28;
  const totalW = steps.length * stepW + (steps.length - 1) * gap;
  const startX = (13.33 - totalW) / 2;

  steps.forEach((s, i) => {
    const sx = startX + i * (stepW + gap);

    slide.addShape(pptx.ShapeType.roundRect, {
      x: sx, y: 1.6, w: stepW, h: 3.6,
      fill: { color: s.bg },
      line: { color: s.color, width: 1.5 },
      rectRadius: 0.12,
    });

    slide.addShape(pptx.ShapeType.ellipse, {
      x: sx + stepW / 2 - 0.35, y: 1.85, w: 0.7, h: 0.7,
      fill: { color: s.color },
    });
    slide.addText(s.num, {
      x: sx + stepW / 2 - 0.35, y: 1.85, w: 0.7, h: 0.7,
      fontSize: 18, fontFace: FONT_EN, color: COLORS.white, bold: true, align: "center", valign: "middle",
    });

    slide.addText(s.title, {
      x: sx + 0.1, y: 2.7, w: stepW - 0.2, h: 0.5,
      fontSize: 16, fontFace: FONT, color: s.color, bold: true, align: "center",
    });

    slide.addText(s.desc, {
      x: sx + 0.1, y: 3.3, w: stepW - 0.2, h: 1.5,
      fontSize: 11, fontFace: FONT, color: COLORS.darkText, align: "center", valign: "top",
    });

    if (i < steps.length - 1) {
      slide.addShape(pptx.ShapeType.rightArrow, {
        x: sx + stepW + 0.02, y: 3.3, w: gap - 0.04, h: 0.05,
        fill: { color: COLORS.accent },
      });
    }
  });

  slide.addText("AI 抽取与翻译并行执行，翻译不增加分解图生成等待时间", {
    x: 1, y: 5.7, w: 11.33, h: 0.5,
    fontSize: 12, fontFace: FONT, color: COLORS.subText, align: "center", italic: true,
  });
}

// ══════════════════════════════════════════════════════════════════════
// Slide 5 — AI 抽取详解
// ══════════════════════════════════════════════════════════════════════
function buildAIExtraction() {
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.white };

  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 13.33, h: 1.1,
    fill: { color: COLORS.primary },
  });
  slide.addText("AI 智能抽取 — 核心引擎", {
    x: 0.8, y: 0.2, w: 8, h: 0.7,
    fontSize: 28, fontFace: FONT, color: COLORS.white, bold: true,
  });

  // Flow: 权利要求文本 → AI分析 → 结构化结果 → 可视化图形
  const flowItems = [
    { label: "权利要求文本", sub: "原始输入", color: "1890FF", bg: COLORS.blueBg },
    { label: "AI 分析", sub: "特征抽取+关系识别", color: COLORS.green, bg: COLORS.greenBg },
    { label: "结构化结果", sub: "节点+边+分组", color: COLORS.orange, bg: COLORS.orangeBg },
    { label: "可视化图形", sub: "交互式分解图", color: COLORS.purple, bg: COLORS.purpleBg },
  ];

  const flowW = 2.4;
  const flowGap = 0.6;
  const flowTotal = flowItems.length * flowW + (flowItems.length - 1) * flowGap;
  const flowStartX = (13.33 - flowTotal) / 2;

  flowItems.forEach((f, i) => {
    const fx = flowStartX + i * (flowW + flowGap);
    slide.addShape(pptx.ShapeType.roundRect, {
      x: fx, y: 1.5, w: flowW, h: 1.2,
      fill: { color: f.bg },
      line: { color: f.color, width: 2 },
      rectRadius: 0.1,
    });
    slide.addText(f.label, {
      x: fx + 0.1, y: 1.55, w: flowW - 0.2, h: 0.55,
      fontSize: 15, fontFace: FONT, color: f.color, bold: true, align: "center",
    });
    slide.addText(f.sub, {
      x: fx + 0.1, y: 2.1, w: flowW - 0.2, h: 0.4,
      fontSize: 10, fontFace: FONT, color: COLORS.subText, align: "center",
    });
    if (i < flowItems.length - 1) {
      slide.addShape(pptx.ShapeType.rightArrow, {
        x: fx + flowW + 0.05, y: 2.0, w: flowGap - 0.1, h: 0.05,
        fill: { color: COLORS.accent },
      });
    }
  });

  // AI 抽取内容 — 2x4 grid
  const extractItems = [
    { title: "部件节点", desc: "技术部件/组成部分", color: "1890FF" },
    { title: "子系统节点", desc: "多部件组成的模块", color: COLORS.orange },
    { title: "特征节点", desc: "具体技术特征/属性", color: COLORS.green },
    { title: "位置关系", desc: "空间位置关系", color: "1890FF" },
    { title: "动作关系", desc: "功能动作关系", color: COLORS.green },
    { title: "包含关系", desc: "层级包含关系", color: COLORS.orange },
    { title: "逻辑关系", desc: "条件/因果逻辑", color: COLORS.purple },
    { title: "限定框/分组", desc: "相关部件归类", color: COLORS.accent },
  ];

  const gridCols = 4;
  const cellW = 2.7;
  const cellH = 1.1;
  const gridGapX = 0.25;
  const gridGapY = 0.2;
  const gridTotalW = gridCols * cellW + (gridCols - 1) * gridGapX;
  const gridStartX = (13.33 - gridTotalW) / 2;
  const gridStartY = 3.2;

  slide.addText("AI 自动识别内容", {
    x: gridStartX, y: 2.9, w: 3, h: 0.35,
    fontSize: 14, fontFace: FONT, color: COLORS.primary, bold: true,
  });

  extractItems.forEach((item, idx) => {
    const row = Math.floor(idx / gridCols);
    const col = idx % gridCols;
    const cx = gridStartX + col * (cellW + gridGapX);
    const cy = gridStartY + row * (cellH + gridGapY);

    slide.addShape(pptx.ShapeType.roundRect, {
      x: cx, y: cy, w: cellW, h: cellH,
      fill: { color: COLORS.lightGray },
      line: { color: item.color, width: 1 },
      rectRadius: 0.08,
    });
    slide.addShape(pptx.ShapeType.ellipse, {
      x: cx + 0.15, y: cy + 0.3, w: 0.35, h: 0.35,
      fill: { color: item.color },
    });
    slide.addText(item.title, {
      x: cx + 0.6, y: cy + 0.15, w: cellW - 0.8, h: 0.4,
      fontSize: 13, fontFace: FONT, color: COLORS.darkText, bold: true, valign: "middle",
    });
    slide.addText(item.desc, {
      x: cx + 0.6, y: cy + 0.55, w: cellW - 0.8, h: 0.4,
      fontSize: 10, fontFace: FONT, color: COLORS.subText, valign: "top",
    });
  });
}

// ══════════════════════════════════════════════════════════════════════
// Slide 6 — AI 服务商 & 翻译功能
// ══════════════════════════════════════════════════════════════════════
function buildAIAndTranslation() {
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.white };

  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 13.33, h: 1.1,
    fill: { color: COLORS.primary },
  });
  slide.addText("AI 服务 & 翻译功能", {
    x: 0.8, y: 0.2, w: 8, h: 0.7,
    fontSize: 28, fontFace: FONT, color: COLORS.white, bold: true,
  });

  // Left: AI 服务商
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.6, y: 1.4, w: 5.8, h: 5.5,
    fill: { color: COLORS.blueBg },
    line: { color: COLORS.accent, width: 1.5 },
    rectRadius: 0.15,
  });
  slide.addText("支持的 AI 服务商", {
    x: 0.9, y: 1.55, w: 5.2, h: 0.5,
    fontSize: 18, fontFace: FONT, color: COLORS.primary, bold: true,
  });

  const providers = [
    { name: "智谱 AI (GLM)", model: "glm-4-flash", desc: "国产大模型，推荐使用", color: COLORS.accent },
    { name: "DeepSeek", model: "deepseek-chat", desc: "深度求索大模型", color: COLORS.green },
    { name: "OpenAI 兼容", model: "gpt-4o", desc: "支持所有 OpenAI API 格式服务", color: COLORS.orange },
  ];

  providers.forEach((p, i) => {
    const py = 2.3 + i * 1.45;
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 1.0, y: py, w: 5.0, h: 1.2,
      fill: { color: COLORS.white },
      line: { color: p.color, width: 1.5 },
      rectRadius: 0.1,
    });
    slide.addShape(pptx.ShapeType.ellipse, {
      x: 1.2, y: py + 0.25, w: 0.6, h: 0.6,
      fill: { color: p.color },
    });
    slide.addText((i + 1).toString(), {
      x: 1.2, y: py + 0.25, w: 0.6, h: 0.6,
      fontSize: 18, fontFace: FONT_EN, color: COLORS.white, bold: true, align: "center", valign: "middle",
    });
    slide.addText(p.name, {
      x: 2.0, y: py + 0.15, w: 3.8, h: 0.4,
      fontSize: 14, fontFace: FONT, color: COLORS.darkText, bold: true,
    });
    slide.addText(`推荐模型: ${p.model}  |  ${p.desc}`, {
      x: 2.0, y: py + 0.6, w: 3.8, h: 0.4,
      fontSize: 10, fontFace: FONT, color: COLORS.subText,
    });
  });

  // Right: 翻译功能
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 6.8, y: 1.4, w: 5.8, h: 5.5,
    fill: { color: COLORS.greenBg },
    line: { color: COLORS.green, width: 1.5 },
    rectRadius: 0.15,
  });
  slide.addText("权利要求翻译", {
    x: 7.1, y: 1.55, w: 5.2, h: 0.5,
    fontSize: 18, fontFace: FONT, color: "237804", bold: true,
  });

  // Translation flow
  const transFlow = [
    { label: "原文", color: "1890FF" },
    { label: "AI 翻译", color: COLORS.green },
    { label: "对照阅读", color: COLORS.orange },
  ];
  transFlow.forEach((t, i) => {
    const tx = 7.2 + i * 1.7;
    slide.addShape(pptx.ShapeType.roundRect, {
      x: tx, y: 2.3, w: 1.4, h: 0.7,
      fill: { color: t.color },
      rectRadius: 0.08,
    });
    slide.addText(t.label, {
      x: tx, y: 2.3, w: 1.4, h: 0.7,
      fontSize: 12, fontFace: FONT, color: COLORS.white, bold: true, align: "center", valign: "middle",
    });
    if (i < 2) {
      slide.addText("\u2192", {
        x: tx + 1.4, y: 2.3, w: 0.3, h: 0.7,
        fontSize: 16, fontFace: FONT_EN, color: COLORS.accent, align: "center", valign: "middle",
      });
    }
  });

  // Translation features
  const transFeatures = [
    { title: "逐句对照", desc: "原文与翻译一句一对照呈现" },
    { title: "高亮同步", desc: "选中节点时原文翻译同步高亮" },
    { title: "6种语言", desc: "中/英/日/韩/德/法" },
    { title: "独立模型", desc: "翻译可使用不同AI模型" },
    { title: "并行执行", desc: "翻译与抽取并行，零额外等待" },
    { title: "容错重试", desc: "单句失败可独立重试" },
  ];

  transFeatures.forEach((f, i) => {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const fx = 7.1 + col * 2.7;
    const fy = 3.3 + row * 1.15;
    slide.addShape(pptx.ShapeType.roundRect, {
      x: fx, y: fy, w: 2.5, h: 0.95,
      fill: { color: COLORS.white },
      line: { color: COLORS.green, width: 1 },
      rectRadius: 0.08,
    });
    slide.addText(f.title, {
      x: fx + 0.1, y: fy + 0.05, w: 2.3, h: 0.4,
      fontSize: 12, fontFace: FONT, color: "237804", bold: true,
    });
    slide.addText(f.desc, {
      x: fx + 0.1, y: fy + 0.45, w: 2.3, h: 0.4,
      fontSize: 10, fontFace: FONT, color: COLORS.subText,
    });
  });
}

// ══════════════════════════════════════════════════════════════════════
// Slide 7 — 可视化编辑 & 图例
// ══════════════════════════════════════════════════════════════════════
function buildVisualization() {
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.white };

  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 13.33, h: 1.1,
    fill: { color: COLORS.primary },
  });
  slide.addText("可视化编辑 & 图例体系", {
    x: 0.8, y: 0.2, w: 8, h: 0.7,
    fontSize: 28, fontFace: FONT, color: COLORS.white, bold: true,
  });

  // Left: 编辑能力
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.6, y: 1.4, w: 5.8, h: 5.5,
    fill: { color: COLORS.orangeBg },
    line: { color: COLORS.orange, width: 1.5 },
    rectRadius: 0.15,
  });
  slide.addText("编辑能力", {
    x: 0.9, y: 1.55, w: 5.2, h: 0.5,
    fontSize: 18, fontFace: FONT, color: "D46B08", bold: true,
  });

  const editFeatures = [
    { title: "画布操作", items: "缩放 / 平移 / 适配 / 居中  |  右键菜单  |  自动布局（DAG）" },
    { title: "节点编辑", items: "双击编辑名称/类型/对照  |  拖拽移动  |  添加连接/限定框" },
    { title: "样式自定义", items: "填充/边框/圆角/尺寸  |  字体/字号/颜色  |  线条/箭头/标签" },
    { title: "多标签页", items: "每条权利要求独立标签  |  切换时自动保存状态" },
  ];

  editFeatures.forEach((f, i) => {
    const fy = 2.3 + i * 1.15;
    slide.addText(f.title, {
      x: 1.0, y: fy, w: 1.6, h: 0.35,
      fontSize: 13, fontFace: FONT, color: COLORS.orange, bold: true,
    });
    slide.addText(f.items, {
      x: 2.7, y: fy, w: 3.4, h: 0.35,
      fontSize: 10, fontFace: FONT, color: COLORS.darkText, valign: "middle",
    });
    if (i < editFeatures.length - 1) {
      slide.addShape(pptx.ShapeType.roundRect, {
        x: 1.0, y: fy + 0.95, w: 5.0, h: 0.01,
        fill: { color: "E8D5B0" }, rectRadius: 0,
      });
    }
  });

  // Right: 图例体系
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 6.8, y: 1.4, w: 5.8, h: 5.5,
    fill: { color: COLORS.lightGray },
    line: { color: COLORS.accent, width: 1.5 },
    rectRadius: 0.15,
  });
  slide.addText("图例体系", {
    x: 7.1, y: 1.55, w: 5.2, h: 0.5,
    fontSize: 18, fontFace: FONT, color: COLORS.primary, bold: true,
  });

  slide.addText("节点类型", {
    x: 7.1, y: 2.2, w: 2, h: 0.35,
    fontSize: 14, fontFace: FONT, color: COLORS.primary, bold: true,
  });

  const nodeTypes = [
    { label: "部件", sub: "component", color: "1890FF", bg: COLORS.blueBg },
    { label: "子系统", sub: "subsystem", color: COLORS.orange, bg: COLORS.orangeBg },
    { label: "特征", sub: "feature", color: COLORS.green, bg: COLORS.greenBg },
  ];
  nodeTypes.forEach((n, i) => {
    const nx = 7.1 + i * 1.8;
    slide.addShape(pptx.ShapeType.roundRect, {
      x: nx, y: 2.6, w: 1.6, h: 0.7,
      fill: { color: n.bg },
      line: { color: n.color, width: 2 },
      rectRadius: 0.08,
    });
    slide.addText(n.label, {
      x: nx, y: 2.6, w: 1.6, h: 0.45,
      fontSize: 13, fontFace: FONT, color: n.color, bold: true, align: "center",
    });
    slide.addText(n.sub, {
      x: nx, y: 3.0, w: 1.6, h: 0.25,
      fontSize: 8, fontFace: FONT_EN, color: COLORS.subText, align: "center",
    });
  });

  slide.addText("关系类型", {
    x: 7.1, y: 3.55, w: 2, h: 0.35,
    fontSize: 14, fontFace: FONT, color: COLORS.primary, bold: true,
  });

  const relTypes = [
    { label: "位置关系", line: "实线 + 实心三角", color: "1890FF" },
    { label: "动作关系", line: "实线 + 实心三角", color: COLORS.green },
    { label: "包含关系", line: "虚线 + 空心三角", color: COLORS.orange },
    { label: "逻辑关系", line: "点划线 + 菱形", color: COLORS.purple },
  ];
  relTypes.forEach((r, i) => {
    const ry = 4.0 + i * 0.65;
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 7.1, y: ry, w: 0.25, h: 0.25,
      fill: { color: r.color }, rectRadius: 0.04,
    });
    slide.addText(r.label, {
      x: 7.5, y: ry - 0.02, w: 1.8, h: 0.3,
      fontSize: 12, fontFace: FONT, color: COLORS.darkText, bold: true,
    });
    slide.addText(r.line, {
      x: 9.4, y: ry - 0.02, w: 3, h: 0.3,
      fontSize: 10, fontFace: FONT, color: COLORS.subText,
    });
  });
}

// ══════════════════════════════════════════════════════════════════════
// Slide 8 — 导出 & 项目管理
// ══════════════════════════════════════════════════════════════════════
function buildExportAndProject() {
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.white };

  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 13.33, h: 1.1,
    fill: { color: COLORS.primary },
  });
  slide.addText("导出 & 项目管理", {
    x: 0.8, y: 0.2, w: 8, h: 0.7,
    fontSize: 28, fontFace: FONT, color: COLORS.white, bold: true,
  });

  // Left: 导出格式
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.6, y: 1.4, w: 5.8, h: 5.5,
    fill: { color: COLORS.purpleBg },
    line: { color: COLORS.purple, width: 1.5 },
    rectRadius: 0.15,
  });
  slide.addText("多格式导出", {
    x: 0.9, y: 1.55, w: 5.2, h: 0.5,
    fontSize: 18, fontFace: FONT, color: "531DAB", bold: true,
  });

  const exports = [
    { format: "PNG", ext: ".png", desc: "位图图片，适合插入文档、演示文稿", color: "1890FF", icon: "IMG" },
    { format: "SVG", ext: ".svg", desc: "矢量图，适合高质量打印和进一步编辑", color: COLORS.green, icon: "VEC" },
    { format: "JSON", ext: ".json", desc: "结构化数据，适合程序处理和数据交换", color: COLORS.orange, icon: "DAT" },
  ];

  exports.forEach((e, i) => {
    const ey = 2.3 + i * 1.4;
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 1.0, y: ey, w: 5.0, h: 1.15,
      fill: { color: COLORS.white },
      line: { color: e.color, width: 1.5 },
      rectRadius: 0.1,
    });
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 1.2, y: ey + 0.2, w: 0.8, h: 0.7,
      fill: { color: e.color }, rectRadius: 0.08,
    });
    slide.addText(e.icon, {
      x: 1.2, y: ey + 0.2, w: 0.8, h: 0.7,
      fontSize: 14, fontFace: FONT_EN, color: COLORS.white, bold: true, align: "center", valign: "middle",
    });
    slide.addText(e.format, {
      x: 2.2, y: ey + 0.15, w: 1.5, h: 0.4,
      fontSize: 16, fontFace: FONT_EN, color: e.color, bold: true,
    });
    slide.addText(e.ext, {
      x: 3.7, y: ey + 0.15, w: 1.0, h: 0.4,
      fontSize: 12, fontFace: FONT_EN, color: COLORS.subText,
    });
    slide.addText(e.desc, {
      x: 2.2, y: ey + 0.6, w: 3.6, h: 0.4,
      fontSize: 10, fontFace: FONT, color: COLORS.subText,
    });
  });

  // Right: 项目管理
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 6.8, y: 1.4, w: 5.8, h: 5.5,
    fill: { color: COLORS.blueBg },
    line: { color: COLORS.accent, width: 1.5 },
    rectRadius: 0.15,
  });
  slide.addText("项目管理", {
    x: 7.1, y: 1.55, w: 5.2, h: 0.5,
    fontSize: 18, fontFace: FONT, color: COLORS.primary, bold: true,
  });

  const projectFeatures = [
    { title: "项目文件 (.p2p)", desc: "保存完整编辑状态\n包含原文、图形数据、标签页", color: COLORS.accent },
    { title: "自动保存", desc: "每 30 秒自动保存\n关闭时自动保存\n下次启动自动恢复", color: COLORS.green },
    { title: "撤销 / 重做", desc: "Ctrl+Z 撤销\nCtrl+Shift+Z / Ctrl+Y 重做", color: COLORS.orange },
    { title: "快捷键", desc: "Ctrl+A 全选 | Delete 删除\nEsc 取消选中", color: COLORS.purple },
  ];

  projectFeatures.forEach((f, i) => {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const fx = 7.1 + col * 2.7;
    const fy = 2.3 + row * 2.3;
    slide.addShape(pptx.ShapeType.roundRect, {
      x: fx, y: fy, w: 2.5, h: 2.0,
      fill: { color: COLORS.white },
      line: { color: f.color, width: 1.5 },
      rectRadius: 0.1,
    });
    slide.addShape(pptx.ShapeType.ellipse, {
      x: fx + 0.9, y: fy + 0.15, w: 0.55, h: 0.55,
      fill: { color: f.color },
    });
    slide.addText(f.title.charAt(0), {
      x: fx + 0.9, y: fy + 0.15, w: 0.55, h: 0.55,
      fontSize: 16, fontFace: FONT, color: COLORS.white, bold: true, align: "center", valign: "middle",
    });
    slide.addText(f.title, {
      x: fx + 0.1, y: fy + 0.8, w: 2.3, h: 0.35,
      fontSize: 12, fontFace: FONT, color: f.color, bold: true, align: "center",
    });
    slide.addText(f.desc, {
      x: fx + 0.1, y: fy + 1.15, w: 2.3, h: 0.75,
      fontSize: 9, fontFace: FONT, color: COLORS.subText, align: "center", valign: "top",
    });
  });
}

// ══════════════════════════════════════════════════════════════════════
// Slide 9 — 技术栈
// ══════════════════════════════════════════════════════════════════════
function buildTechStack() {
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.white };

  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 13.33, h: 1.1,
    fill: { color: COLORS.primary },
  });
  slide.addText("技术栈 & 架构", {
    x: 0.8, y: 0.2, w: 8, h: 0.7,
    fontSize: 28, fontFace: FONT, color: COLORS.white, bold: true,
  });

  const techs = [
    { category: "前端框架", items: ["Vue 3", "TypeScript", "Vite"], color: "42b883", bg: "f0faf5" },
    { category: "UI 组件", items: ["Element Plus", "响应式布局", "三栏式架构"], color: "409EFF", bg: COLORS.blueBg },
    { category: "图形引擎", items: ["AntV X6", "ELK 布局", "DAG 算法"], color: COLORS.orange, bg: COLORS.orangeBg },
    { category: "状态管理", items: ["Pinia", "LocalStorage", "自动持久化"], color: "FFD859", bg: "FFFBE6" },
    { category: "桌面框架", items: ["Tauri 2.0", "Rust 后端", "跨平台"], color: COLORS.accent, bg: COLORS.blueBg },
    { category: "AI 服务", items: ["DeepSeek", "OpenAI API", "智谱 GLM"], color: COLORS.green, bg: COLORS.greenBg },
  ];

  const techCols = 3;
  const techW = 3.6;
  const techH = 2.3;
  const techGapX = 0.4;
  const techGapY = 0.35;
  const techTotalW = techCols * techW + (techCols - 1) * techGapX;
  const techStartX = (13.33 - techTotalW) / 2;

  techs.forEach((t, idx) => {
    const row = Math.floor(idx / techCols);
    const col = idx % techCols;
    const tx = techStartX + col * (techW + techGapX);
    const ty = 1.5 + row * (techH + techGapY);

    slide.addShape(pptx.ShapeType.roundRect, {
      x: tx, y: ty, w: techW, h: techH,
      fill: { color: t.bg },
      line: { color: t.color, width: 1.5 },
      rectRadius: 0.12,
    });
    slide.addText(t.category, {
      x: tx + 0.2, y: ty + 0.15, w: techW - 0.4, h: 0.45,
      fontSize: 16, fontFace: FONT, color: t.color, bold: true,
    });
    slide.addShape(pptx.ShapeType.roundRect, {
      x: tx + 0.2, y: ty + 0.65, w: techW - 0.4, h: 0.02,
      fill: { color: t.color }, rectRadius: 0,
    });

    t.items.forEach((item, ii) => {
      slide.addText("\u2022  " + item, {
        x: tx + 0.3, y: ty + 0.8 + ii * 0.4, w: techW - 0.6, h: 0.35,
        fontSize: 12, fontFace: FONT, color: COLORS.darkText,
      });
    });
  });

  slide.addText("三栏式布局：左侧权利要求输入  |  中间画布工作区  |  右侧样式编辑", {
    x: 1, y: 6.6, w: 11.33, h: 0.4,
    fontSize: 11, fontFace: FONT, color: COLORS.subText, align: "center", italic: true,
  });
}

// ══════════════════════════════════════════════════════════════════════
// Slide 10 — 总结
// ══════════════════════════════════════════════════════════════════════
function buildSummary() {
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.primary };

  slide.addText("Patent2Pic \u2014 价值总结", {
    x: 0.8, y: 0.6, w: 11.73, h: 0.8,
    fontSize: 32, fontFace: FONT, color: COLORS.white, bold: true, align: "center",
  });

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 5.5, y: 1.5, w: 2.33, h: 0.03,
    fill: { color: COLORS.lightBlue }, rectRadius: 0.015,
  });

  const values = [
    { num: "AI", title: "智能驱动", desc: "多种大模型自动提取\n技术特征与结构关系", color: COLORS.green },
    { num: "1\u2192N", title: "一键生成", desc: "从文本到可视化图形\n自动布局，即时呈现", color: COLORS.lightBlue },
    { num: "WYS", title: "所见即所得", desc: "拖拽编辑 \u00b7 样式自定义\n实时预览 \u00b7 多格式导出", color: COLORS.orange },
    { num: "i18n", title: "多语言翻译", desc: "6种语言逐句对照\n高亮同步 \u00b7 独立模型", color: COLORS.purple },
  ];

  const valW = 2.6;
  const valGap = 0.4;
  const valTotal = values.length * valW + (values.length - 1) * valGap;
  const valStartX = (13.33 - valTotal) / 2;

  values.forEach((v, i) => {
    const vx = valStartX + i * (valW + valGap);
    slide.addShape(pptx.ShapeType.roundRect, {
      x: vx, y: 2.0, w: valW, h: 3.5,
      fill: { color: "243B55" },
      line: { color: v.color, width: 2 },
      rectRadius: 0.15,
    });
    slide.addShape(pptx.ShapeType.ellipse, {
      x: vx + valW / 2 - 0.45, y: 2.3, w: 0.9, h: 0.9,
      fill: { color: v.color },
    });
    slide.addText(v.num, {
      x: vx + valW / 2 - 0.45, y: 2.3, w: 0.9, h: 0.9,
      fontSize: 16, fontFace: FONT_EN, color: COLORS.white, bold: true, align: "center", valign: "middle",
    });
    slide.addText(v.title, {
      x: vx + 0.1, y: 3.4, w: valW - 0.2, h: 0.5,
      fontSize: 18, fontFace: FONT, color: v.color, bold: true, align: "center",
    });
    slide.addText(v.desc, {
      x: vx + 0.15, y: 4.0, w: valW - 0.3, h: 1.2,
      fontSize: 12, fontFace: FONT, color: "A0B4CC", align: "center", valign: "top",
    });
  });

  slide.addText("让专利分析更高效、更直观、更智能", {
    x: 1, y: 6.2, w: 11.33, h: 0.6,
    fontSize: 18, fontFace: FONT, color: COLORS.lightBlue, align: "center", italic: true,
  });
}

// ══════════════════════════════════════════════════════════════════════
// Build all slides
// ══════════════════════════════════════════════════════════════════════
buildCover();
buildProductOverview();
buildCoreFeatures();
buildWorkflow();
buildAIExtraction();
buildAIAndTranslation();
buildVisualization();
buildExportAndProject();
buildTechStack();
buildSummary();

// Save
pptx.writeFile({ fileName: "/workspace/ppt-workspace/Patent2Pic-功能特性与工作流程.pptx" })
  .then(() => console.log("PPTX saved successfully!"))
  .catch((err) => console.error("Error:", err));
