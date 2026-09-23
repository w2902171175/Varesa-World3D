<div align="center">

<h1><img src="docs/store-mark.svg" width="48" height="48" align="absmiddle" alt="">&nbsp;Varesa World 3D</h1>

**瓦雷莎 · 雨夜便利店**

走进一座微缩的日式雨夜街角，在便利店里逛一逛、拿起物品，再撑伞回到街上。

<p>
  <img src="https://img.shields.io/badge/version-1.0.0-4F7DF3?style=flat-square" alt="项目版本 1.0.0">
  <a href="LICENSE"><img src="https://img.shields.io/badge/Source-MIT-22C55E?style=flat-square" alt="源码采用 MIT License"></a>
  <img src="https://img.shields.io/badge/WebGL-3D-50A9AA?style=flat-square" alt="WebGL 3D">
  <img src="https://img.shields.io/badge/Source-local%20build-D4A36A?style=flat-square" alt="源码仓库，本地构建">
</p>
<p>
  <img src="https://img.shields.io/badge/Three.js-0.170.0-202C37?style=flat-square&amp;logo=threedotjs&amp;logoColor=white" alt="Three.js 0.170.0">
  <img src="https://img.shields.io/badge/Node.js-20%2B-5FA04E?style=flat-square&amp;logo=nodedotjs&amp;logoColor=white" alt="Node.js 20+">
</p>

[场景与玩法](#features) · [快速开始](#quick-start) · [操作指南](#controls) · [开发与检查](#development) · [常见问题](#faq) · [素材来源](#provenance) · [许可证](#license)

</div>

---

Varesa World 3D 是基于 **Three.js** 的第三人称互动场景。便利店、街道、灯光、雨水和大部分道具由代码构建；角色使用瓦雷莎的官方 MMD 模型，走跑动作由 CMU 动捕数据适配。当前版本适合单人探索，浏览器中的进度只保留到本次页面关闭或刷新。

> **关于 GitHub 仓库**：这里提供源码、构建脚本与来源说明。原模型说明禁止二次配布，所以官方角色模型、贴图、内嵌资源以及包含模型的可玩 HTML **不随仓库上传**。克隆仓库后，需要自行从原始发布页取得模型，才能在本地构建游戏。

<a id="features"></a>

## 场景与玩法

| 内容 | 可以做什么 |
| --- | --- |
| **雨夜街角** | 从第三视角探索正方形微缩底座上的便利店、斑马线、后巷、贩卖机和街边设施 |
| **进店购物** | 穿过自动门，查看货架、冷柜、便当、饭团、杂志与收银台；店内商品先放入购物篮，再结账 |
| **物品互动** | 借伞、开关设施、买饮料、煮咖啡、读物、骑自行车、搬动箱子，并处理吃完留下的包装 |
| **背包与手持** | 按分类查看、搜索、取出、收纳和使用物品；雨伞可收纳、合拢手持或撑开 |
| **纯观赏模式** | 隐藏人物与界面，旋转和缩放整个雨夜模型 |

场景包含 **175 个互动目标**，其中 **143 个为可拿取商品**。街角与店内使用不同的灯光和环境声；湿地反光、雨丝、积水波纹与霓虹辉光共同营造动画雨夜氛围。

<a id="quick-start"></a>

## 快速开始

### 从源码构建

需要 **Node.js 20 或更新版本**。先按 [角色来源说明](assets/character/SOURCE.md) 中的原始发布页自行下载官方模型，并将文件完整解压到 `assets/character/official/`。确认该目录直接包含角色 `.pmx`、`skin.bmp`、`hair.bmp`、`tex/` 和 `sph/` 等文件。

在项目根目录执行：

```powershell
npm ci
npm run prepare:character
npm run build
```

构建完成后，双击 **`Output/瓦雷莎·雨夜便利店.html`** 即可离线游玩。`Output/index.html` 是同目录下的轻量入口，会自动打开主游戏。角色、贴图与脚本已内嵌在主 HTML 中，本机双击游玩不需要保持服务运行。

> 已有完整的本地工作目录可以直接打开生成的 HTML。GitHub 克隆只包含源码；如果缺少模型，构建会提示先完成上述本地准备步骤。

### 本机游玩与分享

完成构建后，双击项目根目录的 **`start.bat`**。菜单提供三种方式：

| 选择 | 模式 | 访问方式 |
| --- | --- | --- |
| **1，默认** | 仅本机游玩 | 直接回车；浏览器打开 `127.0.0.1` 地址 |
| **2** | 局域网分享 | 将窗口中的局域网地址发给同一 Wi-Fi／局域网的朋友 |
| **3** | 临时公网分享 | 等窗口显示“**发给朋友的网址**”后再复制链接 |

也可以在终端直接指定模式：

```powershell
.\start.bat --local
.\start.bat --lan
.\start.bat --public
```

启动器会自动打开本机游戏，并将本次地址写入根目录的 `游玩地址.txt`。`127.0.0.1` 只供这台电脑访问。公网模式使用临时 Cloudflare Tunnel：首次需要联网下载连接工具，链接会随重新启动而变化。朋友各自运行独立的单机页面，不同步人物、购物篮或进度。

启动窗口按 **Enter** 可结束这一次服务；双击 **`stop.bat`** 可停止本项目正在运行的本机服务和公网隧道。已经载入浏览器的页面可能继续运行，刷新后将无法连接已停止的服务。再次运行 `start.bat` 即可启动新会话。

<a id="controls"></a>

## 操作指南

| 操作 | 功能 |
| --- | --- |
| **WASD／方向键** | 按当前相机方向移动 |
| **Shift** | 点按一次切换行走／奔跑；松开移动键会停下，奔跑模式仍保留 |
| **鼠标移动／滚轮** | 转动跟随视角／调整相机距离 |
| **按住 Alt** | 显示鼠标并暂停镜头转动，方便点击界面；松开恢复 |
| **F** | 靠近并面向物品后交互 |
| **R** | 使用已付款商品；也用于切换饮品、翻页、下车或放下箱子 |
| **B／U** | 打开背包／撑开或合拢已装备的雨伞 |
| **Tab** | 切换没有人物和界面的观赏模式 |
| **Esc／Home** | 暂停视角并释放鼠标／重置跟随相机 |

店内拿起的商品进入待付款购物篮；到收银台按 **F** 结账后，商品才进入背包。背包支持分类、搜索、查看详情、取出和使用。雨伞收进背包后会从手上隐藏，再装备时先保持合拢。打开背包或阅读时视角暂停；按过 Esc 后，点击场景可恢复鼠标转向。

<a id="development"></a>

## 开发与检查

| 目录／文件 | 用途 |
| --- | --- |
| `src/` | 街景、店铺、角色控制、相机、碰撞、交互、背包与雨夜效果 |
| `assets/motion/` | CMU 原始动作、处理脚本、循环数据及来源说明 |
| `assets/character/` | 模型来源与本地资源生成脚本；实际模型及生成的 `embedded.js` 被 Git 忽略 |
| `tests/`、`qa/` | 自动化测试、手动检查脚本与历史核对记录 |
| `build.mjs`、`serve.mjs` | 将游戏打包为单个离线 HTML；开启本机预览服务 |
| `start.bat`、`stop.bat` | 本机／局域网／公网启动与项目服务停止 |

常用检查命令：

```powershell
npm test
npm run audit:secrets
npm run test:source
npm run serve
```

`npm test` 检查控制、相机、碰撞、背包、交易与角色动作。有本地模型时会运行真实 PMX 骨骼测试；从 GitHub 克隆且尚未安装模型时，该测试明确跳过。`audit:secrets` 扫描 Git 候选文件中的常见密钥格式，仅显示文件名和规则；`test:source` 在临时目录验证只含仓库文件的克隆状态。需要重新生成角色动作预览时，先准备本地模型，再运行 `node qa/motion/build-preview.mjs`。

本地 `Output/`、`node_modules/`、`.runtime/`、`游玩地址.txt` 及测试生成的图片和 HTML 均由 `.gitignore` 排除。**请使用 Git 或 GitHub Desktop 提交文件**；不要把整个本地目录打包或拖入 GitHub 网页上传，因为网页手动上传不会按本地 `.gitignore` 筛选模型和生成页面。

<a id="faq"></a>

## 常见问题

**克隆仓库后为什么没有可玩的 HTML？** 生成的 HTML 内嵌了官方角色模型与贴图，因原模型使用说明禁止二次配布，所以仓库只上传源码。按[快速开始](#quick-start)下载原模型并本地构建即可。

**双击 HTML 和运行 `start.bat` 有什么区别？** 已构建的主 HTML 可以直接离线游玩；`start.bat` 会启动服务，适合自动打开本机页面或给同一局域网、外网的朋友网址。

**朋友能和我一起出现在同一个世界吗？** 当前是各自独立的单人场景。分享功能提供访问链接，不同步人物、物品或进度。

**公网链接打不开？** 等启动窗口明确显示“发给朋友的网址”，并保持电脑和窗口运行。若本机提示域名无法解析，可检查本机 DNS 缓存或代理的 DNS 设置；自己仍可用窗口中的 `127.0.0.1` 地址游玩。

**刷新页面后购物记录还在吗？** 当前游戏状态只保存在页面会话里，刷新或关闭会重置钱包、购物篮和道具位置。

<a id="provenance"></a>

## 素材来源与使用范围

- **角色**：瓦雷莎 MMD 模型由 **miHoYo** 提供、**观海（观海子）** 改造；原始发布页、校验值和转换说明见 [assets/character/SOURCE.md](assets/character/SOURCE.md)。原始说明禁止商用、模型二次配布及拆取部件改造其他模型。本仓库不包含模型、贴图或内嵌模型的离线文件。
- **动作**：步行与跑步使用 Carnegie Mellon University Graphics Lab Motion Capture Database 的 `35_01`、`35_17`，经本项目重定向；跳跃及交互层为项目制作。它们不是从《原神》游戏中提取的动画。来源和使用说明见 [assets/motion/SOURCE.md](assets/motion/SOURCE.md)。
- **Three.js**：使用 npm 安装的 Three.js。执行 `npm run build` 后，其许可文件复制到本地 `Output/THREE-LICENSE.txt`。

The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217.

<a id="license"></a>

## 许可证

本项目采用 [MIT License](LICENSE)，支持在保留版权与许可声明的前提下使用、修改和分发。

Copyright © 2026 [w2902171175](https://github.com/w2902171175)。第三方依赖保留各自的许可证。
