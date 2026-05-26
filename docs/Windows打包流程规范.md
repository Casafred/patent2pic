# Patent2Pic Windows 应用打包流程规范

本文档描述如何在 Linux 环境下交叉编译并打包 Windows 应用程序。在打包时请严格遵循本规范。

## 1. 项目概述

| 项目 | 说明 |
|------|------|
| 产品名称 | Patent2Pic |
| 技术栈 | Tauri 2 + Vue 3 + Vite + TypeScript |
| 目标平台 | Windows 10 1803+ (x64) |
| 构建方式 | Linux 交叉编译 |

## 2. 环境依赖

### 2.1 必需软件

| 软件 | 用途 | 安装命令 |
|------|------|----------|
| Rust | 后端编译 | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| cargo-xwin | Windows 交叉编译工具 | `cargo install cargo-xwin` |
| NSIS | Windows 安装包制作 | `apt install nsis` (Debian/Ubuntu) |
| Node.js 18+ | 前端构建 | 通过 nvm 或包管理器安装 |
| zip | 便携版打包 | `apt install zip` |

### 2.2 Rust Target

必须安装 Windows MSVC target：

```bash
rustup target add x86_64-pc-windows-msvc
```

### 2.3 验证环境

```bash
# 检查 Rust 版本
rustc --version

# 检查 cargo-xwin
cargo xwin --version

# 检查 NSIS
makensis /VERSION

# 检查 Node.js
node --version
npm --version
```

## 3. 项目结构

```
/workspace/
├── src-tauri/                    # Tauri 后端源码
│   ├── src/
│   │   ├── main.rs              # 入口文件
│   │   └── lib.rs               # 主逻辑
│   ├── Cargo.toml               # Rust 依赖配置
│   ├── build.rs                 # 构建脚本
│   ├── tauri.conf.json          # Tauri 配置
│   └── icons/
│       └── icon.ico             # 应用图标
├── src/                          # Vue 前端源码
├── portable-build/               # 便携版打包目录
│   ├── icon.ico
│   └── 使用说明.txt
├── nsis-build/                   # NSIS 安装包打包目录
│   ├── nsis-installer.nsi       # NSIS 脚本
│   └── icon.ico
├── package.json                  # Node.js 依赖配置
└── vite.config.ts               # Vite 配置
```

## 4. 版本号管理

版本号定义在以下文件中，发布新版本时需同步修改：

| 文件 | 字段/位置 |
|------|-----------|
| `src-tauri/Cargo.toml` | `version = "x.x.x"` |
| `src-tauri/tauri.conf.json` | `"version": "x.x.x"` |
| `package.json` | `"version": "x.x.x"` |
| `nsis-build/nsis-installer.nsi` | `!define PRODUCT_VERSION "x.x.x"` |

## 5. 打包流程

### 5.1 步骤一：安装依赖

```bash
# 安装 Node.js 依赖
cd /workspace
npm install

# 安装 Rust 依赖（首次或 Cargo.lock 变更后）
cd src-tauri
cargo fetch
cd ..
```

### 5.2 步骤二：交叉编译 Windows 版本

```bash
cd /workspace/src-tauri

# 使用 cargo-xwin 交叉编译
cargo xwin build --release --target x86_64-pc-windows-msvc
```

编译产物位于：
```
src-tauri/target/x86_64-pc-windows-msvc/release/
├── patent2pic.exe      # 主程序
└── patent2pic_lib.dll  # 动态链接库
```

### 5.3 步骤三：打包便携版

```bash
# 复制编译产物到便携版目录
cp /workspace/src-tauri/target/x86_64-pc-windows-msvc/release/patent2pic.exe /workspace/portable-build/
cp /workspace/src-tauri/target/x86_64-pc-windows-msvc/release/patent2pic_lib.dll /workspace/portable-build/

# 打包为 ZIP
cd /workspace/portable-build
zip -9 /workspace/Patent2Pic_0.2.0_x64-portable.zip \
    patent2pic.exe \
    patent2pic_lib.dll \
    icon.ico \
    使用说明.txt
```

便携版包含文件：
- `patent2pic.exe` - 主程序
- `patent2pic_lib.dll` - 动态链接库（必须与 exe 同目录）
- `icon.ico` - 应用图标
- `使用说明.txt` - 使用说明

### 5.4 步骤四：打包 NSIS 安装包

```bash
# 复制编译产物到 NSIS 目录
cp /workspace/src-tauri/target/x86_64-pc-windows-msvc/release/patent2pic.exe /workspace/nsis-build/
cp /workspace/src-tauri/target/x86_64-pc-windows-msvc/release/patent2pic_lib.dll /workspace/nsis-build/

# 生成安装包
cd /workspace/nsis-build
makensis nsis-installer.nsi

# 复制到根目录
cp Patent2Pic_0.2.0_x64-setup.exe /workspace/
```

## 6. 输出产物

| 文件名 | 说明 | 预期大小 |
|--------|------|----------|
| `Patent2Pic_X.X.X_x64-portable.zip` | 便携版，解压即用 | ~3.5 MB |
| `Patent2Pic_X.X.X_x64-setup.exe` | NSIS 安装包 | ~3.7 MB |

## 7. NSIS 安装包说明

NSIS 脚本位于 `nsis-build/nsis-installer.nsi`，主要功能：

- 安装到 `C:\Program Files\Patent2Pic\`
- 创建桌面快捷方式
- 创建开始菜单项
- 注册卸载信息到控制面板
- 支持简体中文界面

### 修改版本号

编辑 `nsis-build/nsis-installer.nsi` 第 2 行：

```nsis
!define PRODUCT_VERSION "0.2.0"
```

## 8. 系统要求

运行环境要求：

- Windows 10 1803 (17763) 或更高版本
- x64 架构
- Microsoft Edge WebView2 运行时（Windows 10 2004+ 和 Windows 11 已内置）

## 9. 常见问题

### 9.1 cargo-xwin 下载 MSVC CRT 失败

首次运行 `cargo xwin` 会自动下载 MSVC CRT，需要网络连接。如果下载缓慢，可设置代理：

```bash
export https_proxy=http://your-proxy:port
```

### 9.2 编译产物缺失 .dll 文件

确保 `Cargo.toml` 中包含 cdylib 配置：

```toml
[lib]
name = "patent2pic_lib"
crate-type = ["lib", "cdylib", "staticlib"]
```

### 9.3 NSIS 打包失败

确保 `nsis-build/` 目录中存在以下文件：
- `nsis-installer.nsi`
- `icon.ico`
- `patent2pic.exe`
- `patent2pic_lib.dll`

## 10. 一键打包脚本

可将以下命令整合为脚本：

```bash
#!/bin/bash
set -e

VERSION="0.2.0"
WORKSPACE="/workspace"

echo "=== 开始打包 Patent2Pic v${VERSION} ==="

# 编译
echo "[1/4] 交叉编译 Windows 版本..."
cd ${WORKSPACE}/src-tauri
cargo xwin build --release --target x86_64-pc-windows-msvc

# 便携版
echo "[2/4] 打包便携版..."
cp ${WORKSPACE}/src-tauri/target/x86_64-pc-windows-msvc/release/patent2pic.exe ${WORKSPACE}/portable-build/
cp ${WORKSPACE}/src-tauri/target/x86_64-pc-windows-msvc/release/patent2pic_lib.dll ${WORKSPACE}/portable-build/
cd ${WORKSPACE}/portable-build
rm -f ${WORKSPACE}/Patent2Pic_${VERSION}_x64-portable.zip
zip -9 ${WORKSPACE}/Patent2Pic_${VERSION}_x64-portable.zip \
    patent2pic.exe patent2pic_lib.dll icon.ico 使用说明.txt

# NSIS 安装包
echo "[3/4] 打包 NSIS 安装包..."
cp ${WORKSPACE}/src-tauri/target/x86_64-pc-windows-msvc/release/patent2pic.exe ${WORKSPACE}/nsis-build/
cp ${WORKSPACE}/src-tauri/target/x86_64-pc-windows-msvc/release/patent2pic_lib.dll ${WORKSPACE}/nsis-build/
cd ${WORKSPACE}/nsis-build
makensis nsis-installer.nsi
cp Patent2Pic_${VERSION}_x64-setup.exe ${WORKSPACE}/

# 完成
echo "[4/4] 打包完成！"
ls -lh ${WORKSPACE}/Patent2Pic_${VERSION}_x64-*.zip ${WORKSPACE}/Patent2Pic_${VERSION}_x64-*.exe
```

## 11. 新环境快速部署

在新的云端环境执行以下命令即可完成环境配置：

```bash
# 安装 Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source $HOME/.cargo/env

# 安装 Windows target
rustup target add x86_64-pc-windows-msvc

# 安装 cargo-xwin
cargo install cargo-xwin

# 安装 NSIS (Debian/Ubuntu)
apt update && apt install -y nsis zip

# 安装 Node.js 依赖
cd /workspace && npm install

# 执行打包
./build-windows.sh
```
