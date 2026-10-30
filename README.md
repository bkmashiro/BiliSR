# BiliSR

适用于 **Shadowrocket** 的哔哩哔哩去广告模块。一个 `.srmodule` 合并开屏、暂停、首页和视频页过滤。

## 安装

在 Shadowrocket → 配置 → 模块 → `+` 中粘贴：

```text
https://bili-sr.yuzhes.com/BiliSR.srmodule
```

1. 关闭旧 BiliSR 拆分模块、诊断模块及处理相同接口的其他去广告模块。
2. 下载并启用 BiliSR。
3. 开启 HTTPS 解密和 HTTP/2 MITM，安装并信任 Shadowrocket 证书。
4. 重连 Shadowrocket，强退重开哔哩哔哩。

模块也可从 [Releases](https://github.com/bkmashiro/BiliSR/releases) 下载。默认脚本托管于 Cloudflare Pages，脚本 URL 带版本号。历史版本可用于回退。

## 处理范围

- **开屏**：原生 Map Local 返回无广告配置，包括空的素材保留清单。
- **暂停广告**：原生 Map Local 返回有效的五字节空 gRPC 帧。
- **首页轮播、推荐瀑布流**：删除明确的广告项，保留普通轮播、正常推荐和未知卡片。
- **新版视频页**：过滤 `View`、`AIRelateAsync`、`RelatesFeed`、`ViewProgress` 中已知广告字段，支持单帧 gzip 响应。

不包含搜索、动态、直播、评论、番剧及播放结束页的全面过滤。不修改会员权限或播放权益。仅支持 Shadowrocket，未验证其他代理客户端。

拆分规则已获用户实测反馈：暂停、视频下方、首页轮播和瀑布流广告消失；清除旧应用数据后开屏也消失。合并版沿用相同有效规则，仍需在更多客户端版本上验证，不能保证覆盖所有广告。

## 开屏仍出现？

先看代理请求记录中的 `/x/v2/splash/list`、`/x/v2/splash/show` 是否为 `MAP-LOCAL`。开屏由原生规则处理，不会输出 `filtered splash` 脚本日志。

旧素材可能保存在应用数据中，断网启动仍能显示。普通“清理缓存”未必会删除它。模块不能直接删除 iOS 沙盒文件。若最终选择删除应用重装，先确认账号能重新登录，并备份或接受丢失离线下载。iOS 的“卸载 App”可能保留数据。无需为正常安装流程重装应用。

如果出现卡顿、空白页或播放异常，先禁用本模块，重连并重启 App。报告问题时附客户端版本、广告位置及相关日志，不要提交 Cookie、令牌或完整请求头。

发布脚本默认静默，不输出控制台日志或通知，也不收集响应诊断信息。Shadowrocket 自身仍可能显示脚本执行和请求规则记录，这些由客户端控制。

## 构建与测试

需要 Python 3.9+ 和支持 `node:test` 的 Node.js 18+，不需要 npm 安装依赖。

```sh
python3 scripts/build.py
python3 -m unittest discover -s tests -p 'test_*.py' -v
BILISR_BUNDLE=dist/bilisr-view-v0.3.1.js \
BILISR_FEED_BUNDLE=dist/bilisr-feed-v0.3.1.js \
node --test tests/*.test.mjs
```

`dist/` 包含模块、两个独立脚本及 `SHA256SUMS`。构建不访问网络。fflate 0.8.2 随仓库提供，许可证保留在仓库和生成脚本中。

自托管时指定 HTTPS 资源目录，再上传全部构建文件：

```sh
python3 scripts/build.py --base-url https://example.com/bilisr --out build
```

修改后的模块会引用自己的脚本地址。模块内只含三个本地响应规则和两个响应脚本，不需要服务器、Worker、数据库或 API。

## 实现与边界

- 开屏和暂停使用原生规则，避免脚本引擎和大响应解析。
- 首页脚本只匹配首页接口，与开屏本地响应不重叠。
- 视频页使用选择性 Protobuf 字节编辑，保留未修改字段。
- 未知编码、损坏消息、多帧或超限响应原样放行。gzip 解压检查 CRC32、解压长度及累计输出上限。
- 视频页帧上限为 262,144 字节，包含五字节帧头；首页输入上限为 4 MiB。它们是本项目的工程保护值，不是客户端平台上限。
- 开屏 `pull_interval=60`、`min_interval=0` 是便于验证和回退的工程选择，单位沿用接口约定，不采用长期禁止更新的配置。
- 脚本没有遥测、上传和主动网络请求。Shadowrocket 会从安装地址下载模块与脚本，MITM 仅声明模块所需域名。

## 来源与许可

项目代码采用 [MIT License](LICENSE)。第三方依赖和公开规则参考见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。本项目与 Bilibili、Shadowrocket、Biliverse 均无隶属关系。
