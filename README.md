# Patent2Pic

专利功能分解图生成工具 - 将专利权利要求文本自动转换为可视化结构图

## 功能特性

- **智能解析** - 自动识别和解析专利独立权利要求文本，支持多条权利要求同时处理
- **AI 抽取** - 集成多种 AI 服务（DeepSeek、OpenAI、智谱），智能提取技术特征和结构关系
- **可视化编辑** - 基于 AntV X6 的图形编辑器，支持拖拽、缩放、布局调整等交互操作
- **多格式导出** - 支持导出为 PNG、SVG 等图片格式

## 系统要求

- Windows 10 1803 (17763) 或更高版本
- x64 架构
- Microsoft Edge WebView2 运行时（Windows 10 2004+ 和 Windows 11 已内置）

## 安装使用

### 安装版

1. 下载 `Patent2Pic_x.x.x_x64-setup.exe` 安装程序
2. 双击运行安装程序，按提示完成安装
3. 启动 Patent2Pic

### 便携版

1. 下载并解压 `Patent2Pic-Portable-vx.x.zip` 到任意目录
2. 双击 `patent2pic.exe` 运行
3. 无需安装，删除文件夹即可卸载

## 开发构建

### 环境准备

- Node.js 18+
- Rust (通过 [rustup](https://rustup.rs/) 安装)
- pnpm 或 npm

### 开发运行

```bash
# 安装依赖
npm install

# 开发模式运行
npm run tauri dev
```

### 构建发布

```bash
# 构建生产版本
npm run tauri build
```

构建产物位于 `src-tauri/target/release/bundle/` 目录。

## 技术栈

- **前端框架**: Vue 3 + TypeScript
- **UI 组件**: Element Plus
- **图形引擎**: AntV X6
- **状态管理**: Pinia
- **桌面框架**: Tauri 2.0
- **AI 服务**: DeepSeek / OpenAI / 智谱 AI

## 项目结构

```
├── src/                    # 前端源码
│   ├── components/         # Vue 组件
│   │   ├── ai/            # AI 配置相关
│   │   ├── canvas/        # 画布组件
│   │   ├── input/         # 输入组件
│   │   ├── layout/        # 布局组件
│   │   └── panel/         # 面板组件
│   ├── composables/       # Vue 组合式函数
│   ├── services/          # 业务服务
│   │   ├── ai/            # AI 服务集成
│   │   ├── claim/         # 权利要求解析
│   │   └── graph/         # 图形处理
│   ├── stores/            # Pinia 状态存储
│   └── types/             # TypeScript 类型定义
├── src-tauri/             # Tauri 后端源码
│   ├── src/               # Rust 源码
│   └── tauri.conf.json    # Tauri 配置
└── package.json           # 项目配置
```

## 许可证

MIT License

## 作者

本项目由 **Alfred Shi** 开发维护
