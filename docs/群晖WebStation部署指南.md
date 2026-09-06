# Free-Panel 群晖（Synology）Web Station 部署指南

> 适用：DSM 7.x（Web Station 3.x）；DSM 6.2 差异点已在文中标注
> 项目要求：PHP 7.4+（推荐 8.x，本地以 PHP 8.4 验证），需 `pdo_sqlite` / `sqlite3` / `mbstring` 扩展
> 特点：纯 PHP + SQLite，**零外部依赖、无需 MariaDB/MySQL、无需 URL 重写（无 .htaccess）**，非常适合 Web Station 直接托管

---

## 一、部署流程总览

| 步骤 | 操作 | 位置 |
|------|------|------|
| 1 | 安装 Web Station + PHP 套件 | 套件中心 |
| 2 | 上传项目文件到共享文件夹 | File Station 或 SSH |
| 3 | 给 `http` 群组分配读写执行权限 | File Station 属性 |
| 4 | 启用所需 PHP 扩展 | Web Station → 脚本语言设置 |
| 5 | 创建虚拟主机（端口/域名） | Web Station → 网页服务门户 |
| 6 | （可选）防火墙放行端口 | 控制面板 → 安全性 → 防火墙 |
| 7 | 浏览器访问并登录 | http://群晖IP:端口 |

---

## 二、详细步骤

### 步骤 1：安装套件

打开 **套件中心**，搜索并安装：

| 套件 | 说明 |
|------|------|
| **Web Station** | 群晖官方 Web 服务器套件（核心） |
| **PHP 8.x**（如 PHP 8.2 / 8.3） | 脚本语言环境；如套件中心提供 PHP 8.4 可直接选 |

> 不需要安装 MariaDB——本项目使用 SQLite 文件数据库，避免额外运维负担。

### 步骤 2：上传项目文件

将本地 `sun-nav/` 目录内容整体上传到 NAS 共享文件夹，例如：

```
/volume1/web/free-panel/
├── index.php
├── login.php
├── api.php
├── db.php
├── auth.php
├── logout.php
├── config.php
├── assets/        (app.js / style.css)
├── data/          (SQLite 数据库，自动创建，需可写)
└── uploads/       (上传的 LOGO / 背景图，需可写)
```

上传方式二选一：
- **File Station**：进入 `web` 共享文件夹（DSM 6.2）或 `web` / `web_packages`（DSM 7.x），右键 → 上传 → 选择项目文件夹。
- **SSH + git**（推荐，便于日后拉取更新）：
  ```bash
  sudo -i
  cd /volume1/web
  git clone http://munm.top:34568/yaobus/Sun-Nav.git free-panel
  ```

### 步骤 3：设置 http 群组权限（最关键，漏了必出 500/无法写入）

Web Station 以 **`http` 用户组** 执行任务，必须给项目目录 `http` 群组的读写执行权限：

1. 打开 **File Station** → 找到 `free-panel` 文件夹 → 右键 → **属性** → **权限**。
2. 点击 **新增** → 用户或群组选择 **http** → 勾选 **读取 / 写入 / 执行**。
3. 勾选 **「应用到这个文件夹、子文件夹及文件」**（DSM 7.x 为"应用于所有子文件夹及文件"）→ 确定。
4. 重点确认以下目录可写（SQLite 需要建库写库、上传需要落盘）：
   - `data/` —— 数据库文件 `nav.db`（首次访问自动创建）
   - `uploads/` —— 上传的 LOGO / 背景图

> 权限只要给到位即可，无需给 NAS 管理员账号赋权；`http` 群组权限是 Web Station 运行要求，不会暴露敏感文件。

### 步骤 4：启用 PHP 扩展

1. 打开 **Web Station** → 左侧 **脚本语言设置** → **PHP**。
2. 找到要用的 PHP 版本配置文件 → 点击 **编辑**（或右上角编辑按钮）。
3. 切换到 **扩展名** 标签页，至少勾选：

| 扩展 | 用途 | 必须 |
|------|------|------|
| `pdo_sqlite` / `sqlite3` | SQLite 数据库 | ✅ 必须 |
| `mbstring` | 中文截断（mb_substr） | ✅ 必须 |
| `json` | API 数据交换（默认内置，确认已启用） | ✅ 必须 |
| `fileinfo` | 上传文件 MIME 检测 | ✅ 建议 |
| `gd` | 图片尺寸校验（getimagesize） | ⭕ 可选 |

4. 保存。如担心遗漏，也可直接"全选"再保存（Web Station 允许全量启用）。

### 步骤 5：创建虚拟主机

1. 打开 **Web Station** → **网页服务门户** → **新增** → **虚拟主机**。
2. 按需填写：

| 配置项 | 推荐值 | 说明 |
|--------|--------|------|
| 类型 | **基于端口**（局域网使用，无需域名）；有域名选基于名称 | 基于端口最简单 |
| 主机名 | 留空 / 填 NAS IP 或域名 | — |
| 端口 | `8123` 或任意未被占用端口 | 避开 80（Web Station 默认服务占用）；仅内网用则随意 |
| 文档根目录 | `/volume1/web/free-panel` | **必须指向直接包含 index.php 的目录** |
| HTTP 后端服务器 | **Apache HTTP Server 2.4** | 兼容性最佳；Nginx 亦可 |
| PHP 配置文件 | 步骤 4 配置的 **PHP 8.x** | — |
| HTTP/2 | 按需开启 | 局域网可不开 |

3. 点击 **确定** 保存。若提示需要证书（选了 HTTPS），先跳过或后续再配。

### 步骤 6：（可选）防火墙放行

- 仅局域网访问：可跳过（DSM 默认防火墙通常不拦内网）。
- 需要从外网访问：**控制面板 → 安全性 → 防火墙**，新增规则放行步骤 5 的端口（TCP）。

### 步骤 7：访问验证

| 场景 | URL |
|------|-----|
| 局域网 | `http://群晖IP:8123`（如 `http://192.168.1.100:8123`） |
| 带域名 | `http://你的域名:8123` |

- 首次访问自动跳转 `login.php`，用默认账号 **admin / admin123** 登录（**登录后请立即在「设置 → 账号设置」修改密码**）。
- 登录后确认：主页渲染正常、分组卡片显示、上传一张 LOGO 测试 `uploads/` 可写。

---

## 三、常见问题排查

| 现象 | 原因 | 解决 |
|------|------|------|
| 页面 500 / 无法打开 | PHP 扩展未启用（多为 `pdo_sqlite`） | 步骤 4 勾选扩展后保存；或换更高 PHP 版本 |
| 数据库无法创建/保存设置失败 | `data/` 不可写 | 步骤 3 给 http 群组 `data/` 读写权限 |
| 上传 LOGO/背景图失败 | `uploads/` 不可写 | 步骤 3 给 http 群组 `uploads/` 读写权限 |
| 打开是目录列表而非页面 | 文档根目录指错层级 | 文档根目录必须指向**包含 index.php 的那一级** |
| 访问被拒绝（防火墙） | 端口未放行 | 步骤 6 放行端口 |
| 中文乱码 | — | 项目全 UTF-8，一般不会出现；若出现检查浏览器编码 |
| 修改不生效 | PHP OPcache 缓存 | Web Station → PHP 设置关闭 OPcache，或重载 PHP 配置 |

---

## 四、升级与备份

### 升级（SSH）
```bash
cd /volume1/web/free-panel
git pull
# 设置更新会自动 INSERT OR IGNORE 补齐新键，无需手工迁移
```

### 备份（务必！）
SQLite 是单文件数据库，**停服或空闲时**备份这两个文件即可：
```
/volume1/web/free-panel/data/nav.db        # 全部数据（收藏、分组、设置、账号）
/volume1/web/free-panel/uploads/           # 上传的图片资源
```
> SQLite 复制前建议先 `sqlite3 nav.db ".backup nav.db.bak"` 或直接拷贝（WAL 模式下同时拷贝 nav.db-wal / nav.db-shm 更稳妥）。

---

## 五、DSM 6.2 差异速查

| 项 | DSM 7.x | DSM 6.2 |
|----|---------|---------|
| 网站文件默认位置 | `web` / `web_packages` | `web` |
| Web Station 配置入口 | 网页服务门户 → 虚拟主机 | 常规设置 / 虚拟主机 |
| PHP 设置入口 | 脚本语言设置 → PHP | PHP 设置标签页 |
| 权限操作 | 同上（http 群组） | 同上（http 群组） |

---

## 六、安全建议（局域网部署也要注意）

1. **立即修改默认密码** admin/admin123（项目自带登录失败 5 次锁定 5 分钟，防暴力破解）。
2. 如暴露公网：建议开启 HTTPS（控制面板 → 安全性 → 证书，Let's Encrypt 免费证书）并启用 HSTS。
3. 定期更新：`git pull` + DSM 安全更新。
4. 敏感信息（如备份的 `nav.db`）不要放在文档根目录或 web 共享目录内。
