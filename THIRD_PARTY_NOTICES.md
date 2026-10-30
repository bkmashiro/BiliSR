# Third-party notices and protocol references

The root MIT license applies to BiliSR's own implementation. It does not relicense third-party projects.

## fflate 0.8.2 — bundled dependency

- Author: Arjun Barrett and contributors.
- License: MIT, preserved in `vendor/fflate-LICENSE` and the generated video-page script.
- Package: https://www.npmjs.com/package/fflate/v/0.8.2
- Source: https://github.com/101arrowz/fflate
- Artifact: https://registry.npmjs.org/fflate/-/fflate-0.8.2.tgz
- npm SHA-512 integrity verified when vendored:
  `sha512-cPJU47OaAoCbg0pBvzsgpTPhmhqI5eJjh/JIu8tPj5q+T7iLvW/JAYUqmE7KOB4R1ZyEhzBaIQpQpardBF5z8A==`

`vendor/fflate-0.8.2.js` is the package's UMD build. It is bundled locally. The scripts do not fetch a dependency from a CDN at runtime.

## Biliverse / BiliUniverse ADBlock — protocol and rule reference

- Version: v0.7.5, source commit `b0051916843f269d4b377aaf177f0d9e7b12e393`.
- Upstream license: Apache-2.0.
- Response handlers: https://github.com/Biliverse/ADBlock/blob/b0051916843f269d4b377aaf177f0d9e7b12e393/src/process/Response.mjs
- License: https://github.com/Biliverse/ADBlock/blob/v0.7.5/LICENSE

BiliSR uses independently implemented filtering with interface paths, field names, ad card identifiers and public Protobuf field information checked against the public handlers. The upstream bundled script, request handler, settings framework and generated message classes are not distributed here. BiliSR is not a fork of the complete upstream module.

## Sparkle — splash response schema reference

- Source commit: `98b846e5ad11cbc166aa6158108c8b2999340819`.
- Upstream license: GPL-3.0.
- Rule: https://github.com/kokoryh/Sparkle/blob/98b846e5ad11cbc166aa6158108c8b2999340819/release/surge/module/bilibili.sgmodule
- License: https://github.com/kokoryh/Sparkle/blob/98b846e5ad11cbc166aa6158108c8b2999340819/LICENSE

The short native splash response uses the functional JSON response shape documented by the public rule: `max_time`, `min_interval`, `pull_interval`, `keep_ids`, `show`, `list`, and `splash_request_id`. The empty-object list entry is retained as a compatibility placeholder. BiliSR uses `min_interval=0` and `pull_interval=60` instead of upstream's year-long values.

The upstream JS, module file, and serialized Map Local rule are not included. BiliSR's builder independently emits the JSON as Base64 in Shadowrocket syntax. This protocol-schema reference does not claim ownership of upstream work or relicense Sparkle under MIT. If future changes incorporate upstream implementation code, they must separately comply with its license.
