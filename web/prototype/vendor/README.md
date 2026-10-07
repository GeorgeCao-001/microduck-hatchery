# 本地 3D 展示库

`three-0.160.0.min.js` 是 Three.js `0.160.0` 的原始浏览器构建，MIT 许可；版本与参考展示基线一致，不代表已选择生产前端栈。许可保留在 [three-MIT-LICENSE.txt](../../licenses/three-MIT-LICENSE.txt)，下载地址、SHA256 和字节数保留在 [资源清单](../assets/microduck-reference/manifest.json)。

`joint-viewer.js` 在进入联调时惰性加载此文件，浏览器运行不依赖 CDN；离开销毁渲染实例，库本身可复用。两份单文件入口由生成脚本内嵌该构建与参考模型，直接打开也无需联网加载资源。当前固定构建含 Three 上游的旧浏览器构建弃用提示，后续工程化时再评估现代模块构建，不能据此直接冻结生产版本。
