# 相机实时参数

传感器页沿用原预览尺寸。基础区只放自动 / 手动曝光、曝光时间、模拟增益与亮度；其余可用项位于折叠的高级设置。帧率、分辨率、采集模式只读，不接受写入。

## 接入与运行

画面继续读取 mediad 的 `/frame`。参数链路为浏览器 → 同源维护 gateway → 本机媒体 Unix socket → mediad，V4L2 和自动曝光始终由 mediad 持有。没有新增运行依赖，不打开第二路视频采集，也不经过舵机总线。

本轮同时修改了媒体程序与维护 gateway；同步后分别重新编译、重启。仓库根目录执行：

```sh
cd src
cargo build --locked --release -j 1 -p mediad --features board-runtime --bin mediad
cargo build --locked --release -j 1 --bin robotd-maintenance --bin mediad-maintenance
cd ..
```

启动方式沿用 [Radxa 运行指南](RADXA_RUNTIME.md)。无舵机时维护入口继续使用 `--fixture`；舵机 fixture 不妨碍读取或明确修改真实相机参数。打开调试台的“传感器”，点击相机连接按钮查看画面。

媒体端口默认 8080；维护 gateway 将 `HATCHERY_CAMERA_HTTP_PORT` 提供给当前页面，取同一设备的媒体地址。自定义端口需在两边使用一致的环境配置。参数不向浏览器任意填写的其他媒体地址写入。

参数 socket 优先使用 `HATCHERY_FRAME_SOCKET`，其次 `DUCK_RUNTIME_DIR/media-frame.sock`。默认路径与 `run-radxa.py` 一致：systemd 为 `/run/robot/media-frame.sock`，手动启动为 `~/.local/state/microduck-hatchery/run/media-frame.sock`。直接运行 binary 或使用不同用户时显式对齐 socket 路径及 robot 组权限。

## 参数语义

- 原生参数从当前采集节点的 `v4l2-ctl --list-ctrls-menus` 查询，使用设备报告的范围、步长、菜单及只读 / inactive / grabbed 状态。曝光以 lines、增益以 raw 显示，不套用其他内核的数值比例。
- 自动曝光复用现有计量与收敛算法。已确认的固定模式保留原策略；未固定模式只调曝光，按驱动范围 / 步长限制，并保留既有 1200 行曝光预算。自动模式锁定手动曝光和增益写入；切换时从实际回读值开始，与手动写入共用同一把锁。
- 自动模式的亮度是曝光计量目标；手动模式采用设备原生 brightness。没有原生 brightness 时，手动模式禁用亮度。目标亮度与原生亮度单位分别保留，不用浏览器 CSS 模拟相机修改。
- 高级设置只显示实际枚举出的数字增益、对比度、饱和度、锐度、Gamma、白平衡及降噪控制。未提供的项目不补入；当前没有通用 RKAIQ 私有控制接口，不承诺仅由 RKAIQ 提供的参数已可调。
- 只读 FPS 为已配置的采集目标，不是实测视频帧率或网页约每秒一次的快照刷新率。分辨率和 UYVY 模式来自当前采集配置。
- 设置作用于当前运行会话，不改启动配置；重新启动后沿用原配置。没有固件刷写或持久参数写入。

## 接口与边界

`GET /api/v1/maintenance/camera` 取得 `hatchery-camera/1` 能力与读数，约每 2 秒更新；`POST` 同一路径提交单个 `CameraChange`。复用维护入口的 Host / Origin、会话 cookie、`X-Hatchery-Command: 1`、JSON 类型与 8192 字节限制。静态页面不调用接口。

本机媒体 socket 接受 `hatchery.camera.get` / `hatchery.camera.set`；不加入 WebRTC 控制路由。请求只允许固定参数名，检查 session_id、request_id、数值范围 / 步长 / 菜单，记住最近 64 次写入标识；控制锁最多等待 250 ms，V4L2 调用单次最长 650 ms、输出最多 32 KiB。原生写入成功后必须回读一致；错误或超时只表示结果未确认，不自动重试。

打开页面、轮询、恢复连接和切页不提交设置；离页清理读请求与待处理的网页请求。已交给设备的写入不能由浏览器取消撤销。没有设备或 Windows 本地维护入口无法访问 Radxa socket 时，参数保持不可调；模拟 / test 来源不会冒充实体相机。

本地验证使用明确的浏览器快照和临时 V4L2 工具模拟器；不代表 Radxa 驱动、ISP 控制、曝光效果或实际视频帧率已验收。验证结果见 [Web 状态](../web/docs/LOCAL_STATUS.md)。
