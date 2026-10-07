# Microduck 参考显示模型

本轮用于只读 3D 姿态展示的 `model.json` 与 `meshes.bin`，来自 [fanhao375/microduck-replica](https://github.com/fanhao375/microduck-replica/tree/b5381d86b68d2e4f4606170d54d1f3f46d249ffc/tools/servo-web/model)，固定提交 `b5381d86b68d2e4f4606170d54d1f3f46d249ffc`。本项目保留两个文件原始字节；下载地址、大小与 SHA256 见 [manifest.json](../prototype/assets/microduck-reference/manifest.json)。

几何原作者为 Pollen Robotics；经 [apirrone/microduck_rl](https://github.com/apirrone/microduck_rl) 的 `robot_allcollisions.xml` 和 STL，以及复刻仓库的 `build_model.py` 转换为网页用量化网格与运动学树。依据该固定提交的 [仓库许可](microduck-replica-LICENSE.txt)，网页显示几何采用 **[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)**，需要署名、非商业使用与相同方式共享；该目录的许可单独适用，不替本项目其他代码选择许可证。

上游 `model.json` 的 `license` 字段及 [原 NOTICE](../prototype/assets/microduck-reference/upstream-NOTICE.md) 仍写 Apache-2.0，与仓库针对几何的明确许可范围不一致。本项目按照仓库针对几何的 CC BY-NC-SA 4.0 说明标注，不能据 JSON 字段宣称 CAD 几何为 Apache-2.0。

模型已去除若干内部件；嘴部 #34 为上游补出的估计铰链。官方外形、XL330 外壳、电池、质量及惯性信息均未验证适用于 Hatchery 的 Radxa / FT 装配。本项目仅使用外形、运动学树和关节轴；不使用质量进行重心、支撑或稳定性结论。

本轮显示材质采用 Hatchery 配色，缺测关节使用灰色半透明参考姿态；几何资源保持原样。角度映射是本项目独立的 `ui-visual-demo-v1` 样例，不采用作者设备的 2048 中点、4096 ticks/rev 或方向配置，不代表真实校准。

渲染器使用本地固定版本 Three.js `0.160.0`，采用 [MIT 许可](three-MIT-LICENSE.txt)。没有复制参考仓库的控制前端、校准、后端或训练代码，没有引入浏览器 MuJoCo / RL 运行依赖。
