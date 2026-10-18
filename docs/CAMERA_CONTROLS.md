# 相机实时参数

传感器页沿用原预览尺寸。基础区只放自动 / 手动曝光、曝光时间、模拟增益与亮度；其余可用项位于折叠的高级设置。帧率、分辨率、采集模式只读，不接受写入。

## 接入与运行

传感器页通过 `camera-stream.js` 复用官方 mediad WebRTC 信令、SDP / ICE 和视频轨道，不再轮询 PNG。快照按钮从当前视频帧导出 PNG；暂停只冻结本地播放，离页关闭会话、轨道与信令。独立媒体根页面仍保留 `/frame` 诊断预览。参数链路为浏览器 → 同源维护 gateway → 本机媒体 Unix socket → mediad，V4L2 和自动曝光始终由 mediad 持有。没有新增运行依赖，不打开第二路视频采集，也不经过舵机总线。

本轮同时修改了媒体程序与维护 gateway；同步后分别重新编译、重启。仓库根目录执行：

```sh
cd src
cargo build --locked --release -j 2 -p mediad --features board-runtime --bin mediad
cargo build --locked --release -j 2 --bin robotd-maintenance --bin mediad-maintenance
cd ..
```

启动方式沿用 [Radxa 运行指南](RADXA_RUNTIME.md)。无舵机时维护入口继续使用 `--fixture`；舵机 fixture 不妨碍读取或明确修改真实相机参数。打开调试台的“传感器”，点击相机连接按钮查看画面。

媒体端口默认 8080；维护 gateway 将 `HATCHERY_CAMERA_HTTP_PORT` 提供给当前页面，取同一设备的媒体地址。自定义端口需在两边使用一致的环境配置。参数不向浏览器任意填写的其他媒体地址写入。

参数 socket 优先使用 `HATCHERY_FRAME_SOCKET`，其次 `DUCK_RUNTIME_DIR/media-frame.sock`。默认路径与 `run-radxa.py` 一致：systemd 为 `/run/robot/media-frame.sock`，手动启动为 `~/.local/state/microduck-hatchery/run/media-frame.sock`。直接运行 binary 或使用不同用户时显式对齐 socket 路径及 robot 组权限。

## 参数语义

- 原生参数从当前采集节点的 `v4l2-ctl --list-ctrls-menus` 查询，使用设备报告的范围、步长、菜单及只读 / inactive / grabbed 状态。曝光以 lines、增益以 raw 显示，不套用其他内核的数值比例。
- 自动曝光复用现有计量与收敛算法。已确认的固定模式保留原策略；未固定模式只调曝光，按驱动范围 / 步长限制，并保留既有 1200 行曝光预算。自动模式锁定手动曝光和增益写入；切换时从实际回读值开始，与手动写入共用同一把锁。
- 自动模式的亮度是曝光计量目标；手动模式采用设备原生 brightness 或 RKAIQ ISP brightness。两者都不可用时禁用亮度。目标亮度与原生亮度单位分别保留，不用浏览器 CSS 模拟相机修改。
- 高级设置保留对比度、饱和度、锐度、Gamma 模式 / 系数、降噪、时域降噪及白平衡色温的位置；缺少后端能力时显示“未提供”并禁用，不生成虚假参数。其他原生高级控制按实际能力补充。RKAIQ 原 IPC 保留 CPROC 与 AWB；同进程 API2 扩展见下文。白平衡增益和 Gamma 系数分别以三位、两位小数显示，协议仍为 ×0.001 / ×0.01 整数。
- 只读 FPS 为已配置的采集目标，不是实测视频帧率或浏览器刷新率。分辨率和 UYVY 模式来自当前采集配置。
- 设置作用于当前运行会话，不改启动配置；重新启动后沿用原配置。没有固件刷写或持久参数写入。

## 接口与边界

`GET /api/v1/maintenance/camera` 取得 `hatchery-camera/1` 能力与读数，约每 2 秒更新；`POST` 同一路径提交单个 `CameraChange`。复用维护入口的 Host / Origin、会话 cookie、`X-Hatchery-Command: 1`、JSON 类型与 8192 字节限制。静态页面不调用接口。

本机媒体 socket 接受 `hatchery.camera.get` / `hatchery.camera.set`；不加入 WebRTC 控制路由。请求只允许固定参数名，检查 session_id、request_id、数值范围 / 步长 / 菜单，记住最近 64 次写入标识；控制锁最多等待 250 ms，V4L2 调用单次最长 650 ms、输出最多 32 KiB。原生写入成功后必须回读一致；错误或超时只表示结果未确认，不自动重试。

打开页面、轮询、恢复连接和切页不提交设置；离页清理读请求与待处理的网页请求。已交给设备的写入不能由浏览器取消撤销。没有设备或 Windows 本地维护入口无法访问 Radxa socket 时，参数保持不可调；模拟 / test 来源不会冒充实体相机。

本地验证使用明确的浏览器快照和临时 V4L2 工具模拟器；不代表 Radxa 驱动、ISP 控制、曝光效果或实际视频帧率已验收。验证结果见 [Web 状态](../web/docs/LOCAL_STATUS.md)。

## RKAIQ 与流式视频

已确认用户板上的 `rkaiq_3A_server` 监听 `/tmp/UNIX.domain0`。mediad 的 `rkaiq.rs` 按 Rockchip SDK 的 packet / hash / CPROC / AWB 协议做窄接口适配，来源和原文件哈希见 [RKAIQ_IMPORT.json](RKAIQ_IMPORT.json)。沿用板上既有 ISP 服务，不另起 ISP 引擎，不替换调色 / 白平衡算法。Radxa 官方 5.0x1.2-rc2 安装包的离线检查确认包含 AWB unified API；这不是用户板上的读写验收。

默认 socket 可用 `HATCHERY_RKAIQ_SOCKET` 覆盖；另有原生 V4L2 ISP 控制节点时可显式设置 `HATCHERY_CAMERA_ISP_DEVICE`。查询成功才启用能力。CPROC 只接受厂商明确的 4 / 12 字节布局，保留其他字段；JSON 写入只开放白平衡固定路径。设置后必须回读确认，不因未收到结果而重发。当前不把 RKAIQ 调节写入 IQ 文件或持久配置。

mediad 的运行用户须有该 socket 的读写权限。先在板上检查 `ls -l /tmp/UNIX.domain0`；若无权限，需为实际 mediad 用户配置该 socket 的最小访问权限，不能用全局 777 或把 Web 服务改为 root。RKAIQ 重建 socket 后权限可能重置，本轮没有修改板端权限或服务单元。

SSH 使用相同端口转发网页和信令，例如在 Windows / macOS 执行：

```bash
ssh -N -L 8088:127.0.0.1:8088 -L 8080:127.0.0.1:8080 -L 8443:127.0.0.1:8443 duck@192.168.8.2
```

打开 `http://127.0.0.1:8088/#console/sensors`，点击连接。WebRTC 还需要浏览器能够到达板端 ICE 地址，USB 网络 / Wi-Fi 地址可达才可能传输视频；仅有 SSH 的 TCP 转发不保证 UDP 路径。无信令、无 producer、协商超时、断线均显示失败，不自动回退成 PNG 并冒充直播。`run-radxa.py media` 已补入 `/usr/local/lib/gstreamer-1.0` 插件搜索路径。

本轮本地验证包括 WebRTC 信令与 ICE 顺序、轨道清理、参数门控和 SDK 报文检查，ARM64 仅做类型检查（本机 DOCS_RS 跳过 GStreamer 原生链接）；板上流式画面、ISP 效果、socket 权限和实际帧率仍由用户验证。

## ISP21 高级设置：复用同一个 3A 服务

Pollen Microduck 的软件曝光和检测模块已经迁入；成像 Gamma、降噪、白平衡由 Rockchip RKAIQ 执行。用户同版本 `camera-engine-rkaiq-rk3568 5.0x1.2-rc2` 包的离线检查发现：旧版 `rk_aiq_user_api_asharp_GetStrength`、`rk_aiq_user_api_anr_GetLumaSFStrength`、`rk_aiq_user_api_agamma_GetAttrib` 为返回 -255 的兼容占位；部分 JSON 调色工具路径面向 ISP30，不能用于宣称 ISP21 已可调节。

因此保留现有 mediad、维护 gateway 和相机控制协议，仅给官方 3A 程序补固定 API2 参数接口。源码位于 `src/daemons/mediad/rkaiq/`，原媒体枚举、流开始 / 停止事件与 RKAIQ 生命周期保留；匹配用户指定的采集节点，沿用板上已安装的 SDK、IQ 文件和算法库。来源、原始哈希及许可见 [RKAIQ_SERVER_IMPORT.json](RKAIQ_SERVER_IMPORT.json)。没有新增 systemd 服务、运行依赖、第二个 ISP 引擎或视频采集器；不替换系统安装包。原服务仍可恢复运行。

| 高级项 | 调用与回读 |
| --- | --- |
| 锐度 | `rk_aiq_uapi2_set/getSharpness`，0–100 |
| 降噪强度 | `set/getANRStrth`，0–100；沿用 SDK 对降噪通道的分配 |
| 时域降噪 | `set/getMTNRStrth`，0–100；仅 SDK 实际支持时可用 |
| Gamma | ISP21 v10 自动 IQ / 手动；手动调用官方 `setGammaCoef`，回读 45 点 LUT，按 SDK 网格 / 公式核对；恢复自动只切换模式 |
| 白平衡色温 | 手动白平衡下 `setMWBCT`，2800–7500 K；回读 `GetMwbAttrib` 的 CCT 子模式与值 |

Gamma 自动模式锁定系数；明确切换手动时使用 SDK 默认系数 2.20。任意自定义 Gamma 曲线不反推单一系数，显示未知，允许明确输入新系数。编辑色温会进入 CCT 子模式，编辑红蓝增益会进入 gain 子模式，二者不伪装为同一数值；自动白平衡锁定手动参数。百分比读回允许 SDK 整数换算产生最多 1 点差异，页面显示实际读回值；其他字段严格核对。打开、轮询与重连不写入。

同进程接口为本机 Unix socket、0600，固定 HIQ1 报文与 12 个允许项；只允许查询或单字段写入，写后读回，不提供任意函数 / 路径、IQ 写入、网络监听或重试。mediad 优先使用它，未启动时保留原 IPC 与原生 V4L2；一次已发出的写入不会改走其他通道重发。显式 socket 路径由 `HATCHERY_RKAIQ_CONTROL_SOCKET` 指定，默认与 `DUCK_RUNTIME_DIR/rkaiq-control.sock` 对齐。

### 用户上板编译与试运行

本轮没有操作 Radxa。先同步代码，在板上仓库根目录执行；只编译项目中的 3A 程序和 mediad，不安装或启用服务：

```sh
cd ~/microduck-hatchery
python3 scripts/build-rkaiq.py
cd src
cargo build --locked --release -j 2 -p mediad --features board-runtime --bin mediad
cd ..
```

构建使用已安装包的 `/usr/include/rkaiq` 与 `librkaiq.so`，需要本机 C / C++ 编译器；脚本不会下载依赖。缺少匹配头文件或编译器时先核对当前包，不换无关 SDK 版本。

1. 停止当前 mediad 抓流。查询现有 3A 进程所属单元：`systemctl status "$(pgrep -xo rkaiq_3A_server)" --no-pager`，手动停止查到的单元。不要同时运行原 3A 和适配版；启动器检测到已有 3A 会拒绝启动，不替用户停止服务。
2. 在第一个 SSH 终端以前台启动同一官方程序的适配版，先于 mediad 启动：

   ```sh
   HATCHERY_CAMERA_DEVICE=/dev/video0 \
   python3 scripts/run-radxa.py isp --env-file deploy/radxa/hatchery.env.example
   ```

3. 另一个 SSH 终端按原方式启动 mediad，使用同一个用户与运行目录：

   ```sh
   HATCHERY_CAMERA_DEVICE=/dev/video0 \
   HATCHERY_CAMERA_ROTATE=0 \
   HATCHERY_PARAMS="$PWD/deploy/radxa/robotd.toml.example" \
   python3 scripts/run-radxa.py media --env-file deploy/radxa/hatchery.env.example
   ```

4. 原维护 gateway 与 SSH 网页 / 信令转发继续沿用。进入传感器相机的高级设置，先检查真实回读，再逐项明确修改、观察画面与回读；自动白平衡、Gamma 自动恢复也要验证。这里的 `/dev/video0` 采用用户已验证节点，其他机器按实际拓扑配置。
5. 测试结束先停止 mediad，再 Ctrl+C 停止适配版 3A，手动启动原来的 3A 单元即可恢复。没有修改系统 binary、IQ 文件或单元配置。0600 socket 要求同用户；使用不同 systemd 用户的长期部署尚未自动配置。

新版适配 3A 的启动事件、曝光与原 3A 竞争情况、ISP 参数效果及持续运行仍待用户实机验收；本地编译与协议检查不代表这些已经通过。

2026-10-18 本轮已通过 8 项相机参数 Node 测试、9 项直接引用实际源文件的 Rust 相机模块测试、三个 Rust 模块的 ARM64 类型检查，以及同版本 SDK 下 3A 主程序 / 参数模块 / 官方 mediactl 的 ARM64 对象编译。全套 Node 在未修改的 console-routes 测试进程停滞后停止，未计为通过；完整 mediad / 3A 原生链接和实机验收仍待完成。
