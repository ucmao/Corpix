# Corpix 品牌资源

图标采用三栋企业楼宇与大放大镜，参考 PostSnap 的深蓝粗描边、亮蓝、白色和珊瑚橙配色。镜片内部为近白到浅冰蓝的柔和渐变，不包含具体图案。背景透明，无文字。项目 README 使用本目录的当前图标；早期方案保留在各候选子目录中。

- `corpix-logo.png`：生图母版，1024 × 1024。
- `icon-512.png`、`icon-192.png`：应用图标。
- `apple-touch-icon.png`：180 × 180。
- `favicon-16x16.png`、`favicon-32x32.png`、`favicon-48x48.png`：浏览器图标。
- `favicon.ico`：包含 16、32、48 像素 PNG 图层的 ICO。

当前项目为 API 服务，资源尚未通过 HTTP 路由公开。用于网页时，将需要的文件复制到站点静态资源目录，并在 HTML 的 `<head>` 中添加：

```html
<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48">
<link rel="icon" type="image/png" href="/favicon-32x32.png" sizes="32x32">
<link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180">
```

由内置 image_gen 工具生成并编辑，随后等比缩放并封装 ICO；未引入运行依赖。初版提示词见 [生成记录](icon-prompt.txt)，当前渐变镜片的提示词见 [渐变镜片编辑记录](soft-lens-edit-prompt.txt)，此前窗格镜片的提示词保存在 [窗格编辑记录](lens-edit-prompt.txt)。
