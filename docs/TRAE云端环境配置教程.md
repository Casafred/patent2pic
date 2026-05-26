# TRAE 云端环境配置教程

本文档说明如何配置 TRAE 云端运行环境，实现开箱即用的 Windows 交叉编译环境。

## 1. TRAE 云端环境概述

TRAE 支持自定义云端运行环境，可以预装项目所需的编程语言和工具，避免每次启动时重新安装依赖。

### 1.1 支持的预装语言

| 语言 | 字段 | 支持的版本 |
|------|------|------------|
| Python | `python_version` | 3.10、3.11、3.12、3.13、3.14 |
| Node.js | `node_version` | 18、20、22、24 |
| Go | `go_version` | 1.22.12、1.23.8、1.24.3、1.25.1 |
| **Rust** | `rust_version` | **1.83.0 ~ 1.92.0** |
| Java | `java_version` | 11、17、21、22、23、24、25 |
| Ruby | `ruby_version` | 3.2.3、3.3.8、3.4.4 |
| PHP | `php_version` | 8.2、8.3、8.4、8.5 |
| Swift | `swift_version` | 5.10、6.1、6.2 |

## 2. Patent2Pic 专用云端环境配置

### 2.1 配置步骤

1. 打开 TRAE SOLO，点击左下角 **头像 > 设置**
2. 选择 **云端运行环境**
3. 点击右上角 **创建** 按钮
4. 填写以下配置

### 2.2 推荐配置

#### 基本信息

| 参数 | 值 |
|------|-----|
| 环境名称 | `Patent2Pic Windows Build` |
| 描述 | `Tauri 2 Windows 交叉编译环境` |

#### 预装依赖

```json
{
  "rust_version": "1.92.0",
  "node_version": "20"
}
```

#### 运行时配置

```json
{
  "install": "apt update && apt install -y nsis zip && rustup target add x86_64-pc-windows-msvc && cargo install cargo-xwin && mkdir -p ~/.cargo && echo '[source.crates-io]\\nreplace-with = \"rsproxy-sparse\"\\n\\n[source.rsproxy-sparse]\\nregistry = \"sparse+https://rsproxy.cn/index/\"\\n\\n[net]\\ngit-fetch-with-cli = true' > ~/.cargo/config.toml && cd /workspace && npm install"
}
```

> **注意**：由于 TRAE 预装的 Rust 已包含基础环境，安装脚本只需补充：
> - Windows 交叉编译 target
> - cargo-xwin 工具
> - NSIS 安装包制作工具
> - 国内镜像配置

#### 网络策略

```json
{
  "mode": 1,
  "allowlist_policy": 0,
  "common_dependencies": ["npm", "crates", "github"]
}
```

## 3. 完整配置 JSON

可直接复制以下 JSON 导入配置：

```json
{
  "name": "Patent2Pic Windows Build",
  "description": "Tauri 2 Windows 交叉编译环境，预装 Rust、Node.js、cargo-xwin、NSIS",
  "preinstalled_packages": {
    "rust_version": "1.92.0",
    "node_version": "20"
  },
  "runtime_config": {
    "install": "apt update && apt install -y nsis zip && rustup target add x86_64-pc-windows-msvc && cargo install cargo-xwin && mkdir -p ~/.cargo && printf '[source.crates-io]\\nreplace-with = \"rsproxy-sparse\"\\n\\n[source.rsproxy-sparse]\\nregistry = \"sparse+https://rsproxy.cn/index/\"\\n\\n[net]\\ngit-fetch-with-cli = true\\n' > ~/.cargo/config.toml && cd /workspace && npm install"
  },
  "network_policy": {
    "mode": 1,
    "allowlist_policy": 0,
    "common_dependencies": ["npm", "crates", "github"]
  }
}
```

## 4. 使用云端环境

### 4.1 网页版

TRAE SOLO 网页版中，在对话框右下方直接选择已创建的云端环境即可。

### 4.2 桌面版

1. 打开从 GitHub 拉取的远程项目
2. 在对话输入框左下角，将运行环境设置为 **云端**
3. 选择 `Patent2Pic Windows Build` 环境

## 5. 打包命令

环境就绪后，执行以下命令进行打包：

```bash
# 构建前端
cd /workspace && npm run build

# 交叉编译 Windows 版本
cd /workspace/src-tauri && cargo xwin build --release --target x86_64-pc-windows-msvc

# 打包便携版
cp /workspace/src-tauri/target/x86_64-pc-windows-msvc/release/patent2pic.exe /workspace/portable-build/
cp /workspace/src-tauri/target/x86_64-pc-windows-msvc/release/patent2pic_lib.dll /workspace/portable-build/
cd /workspace/portable-build
zip -9 /workspace/Patent2Pic_0.2.0_x64-portable.zip patent2pic.exe patent2pic_lib.dll icon.ico 使用说明.txt
```

## 6. 环境变量说明

### 6.1 敏感变量（可选）

如果需要代理或其他敏感配置：

| Key | 示例值 | 用途 |
|-----|--------|------|
| `HTTPS_PROXY` | `http://proxy.example.com:8080` | 代理服务器地址 |

### 6.2 环境变量（可选）

| Key | 示例值 | 用途 |
|-----|--------|------|
| `RUSTUP_DIST_SERVER` | `https://rsproxy.cn` | Rustup 镜像源 |
| `RUSTUP_UPDATE_ROOT` | `https://rsproxy.cn/rustup` | Rustup 更新源 |

## 7. 注意事项

### 7.1 首次启动时间

由于安装脚本需要安装 cargo-xwin 和配置环境，首次启动可能需要 **3-5 分钟**。后续启动会更快。

### 7.2 网络策略

`common_dependencies` 中的 `crates` 对应 Cargo 包管理器源，确保可以下载 Rust 依赖。

### 7.3 使用限制

- 自定义云端运行环境只能在 **Code 模式** 中使用
- 敏感变量最多 50 个，环境变量最多 100 个
- 安装脚本长度不得超过 10KB

## 8. 故障排除

### 8.1 cargo-xwin 安装失败

检查网络策略是否包含 `crates`，确保可以访问 Cargo 源。

### 8.2 MSVC CRT 下载失败

cargo-xwin 首次运行需要下载 MSVC CRT，确保网络畅通。如果在国内，镜像配置应该已经加速了下载。

### 8.3 环境启动超时

如果安装脚本执行超时，可以尝试：
1. 将部分安装步骤移到手动执行
2. 检查网络连接是否正常

## 9. 进阶配置

### 9.1 带启动脚本的配置

如果希望环境启动后自动运行开发服务器：

```json
{
  "name": "Patent2Pic Dev Environment",
  "description": "Tauri 2 开发环境，自动启动前端开发服务器",
  "preinstalled_packages": {
    "rust_version": "1.92.0",
    "node_version": "20"
  },
  "runtime_config": {
    "install": "apt update && apt install -y nsis zip && rustup target add x86_64-pc-windows-msvc && cargo install cargo-xwin && mkdir -p ~/.cargo && printf '[source.crates-io]\\nreplace-with = \"rsproxy-sparse\"\\n\\n[source.rsproxy-sparse]\\nregistry = \"sparse+https://rsproxy.cn/index/\"\\n\\n[net]\\ngit-fetch-with-cli = true\\n' > ~/.cargo/config.toml && cd /workspace && npm install",
    "start": "npm run tauri dev"
  },
  "network_policy": {
    "mode": 1,
    "allowlist_policy": 0,
    "common_dependencies": ["npm", "crates", "github"]
  }
}
```

### 9.2 多终端配置

同时运行前端和后端：

```json
{
  "runtime_config": {
    "install": "npm install",
    "terminals": [
      {
        "name": "Frontend",
        "command": "npm run dev"
      },
      {
        "name": "Tauri",
        "command": "npm run tauri dev"
      }
    ]
  }
}
```
