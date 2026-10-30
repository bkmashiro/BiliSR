#!/usr/bin/env python3
"""Reproducibly build one Shadowrocket module and two self-contained scripts."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
VERSION = '0.3.1'
DEFAULT_BASE = 'https://bili-sr.yuzhes.com'
APP = r'app\.(bilibili\.com|biliapi\.net|biliapi\.com)'
GRPC = r'(grpc\.biliapi\.net|app\.biliapi\.net|app\.bilibili\.com|app\.biliapi\.com)'
SPLASH_LIST = r'^https:\/\/' + APP + r'\/x\/v2\/splash\/list(?:\?[^#]*)?$'
SPLASH_OTHER = r'^https:\/\/' + APP + r'\/x\/v2\/splash\/(show|brand\/list|event\/list2)(?:\?[^#]*)?$'
PAUSE = r'^https:\/\/' + GRPC + r'\/bilibili\.app\.viewunite\.v1\.View\/PlayPause$'
FEED = r'^https:\/\/' + APP + r'\/x\/v2\/feed\/index(?:\?[^#]*)?$'
VIEW = r'^https:\/\/' + GRPC + r'\/bilibili\.app\.viewunite\.v1\.View\/(View|AIRelateAsync|RelatesFeed|ViewProgress)$'


def normalize_base(base):
    url = urlsplit(base)
    if url.scheme != 'https' or not url.netloc or url.username or url.password or url.query or url.fragment:
        raise ValueError('base URL must be HTTPS without credentials, query or fragment')
    if any(c.isspace() for c in base) or any(c in base for c in [',', '"', '\\']):
        raise ValueError('base URL contains invalid configuration characters')
    return base.rstrip('/')


def mock(pattern, raw, content_type, extra=''):
    encoded = base64.b64encode(raw).decode()
    return (f'{pattern} data-type=base64 data="{encoded}" status-code=200 '
            f'header="Content-Type:{content_type}|Content-Length:{len(raw)}{extra}"')


def compact(obj):
    return json.dumps(obj, separators=(',', ':')).encode()


def module(base):
    base = normalize_base(base)
    # Empty object is a compatibility placeholder from the referenced public rule.
    splash = {'code': 0, 'message': 'OK', 'ttl': 1, 'data': {
        'max_time': 0, 'min_interval': 0, 'pull_interval': 60,
        'keep_ids': [], 'show': [], 'list': [{}], 'splash_request_id': ''}}
    other = {'code': 0, 'message': 'OK', 'ttl': 1,
             'data': {'show': [], 'event_list': [], 'preload': []}}
    return '\n'.join([
        '#!name = BiliSR',
        '#!desc = Bilibili ad filtering for Shadowrocket: native splash/pause, selective homepage and video-page filters. Disable older BiliSR modules and overlapping filters.',
        '#!author = bkmashiro',
        '#!homepage = https://github.com/bkmashiro/BiliSR',
        f'#!version = {VERSION}',
        '', '[Map Local]',
        mock(PAUSE, bytes(5), 'application/grpc', '|grpc-status:0'),
        mock(SPLASH_LIST, compact(splash), 'application/json; charset=utf-8', '|Cache-Control:no-store'),
        mock(SPLASH_OTHER, compact(other), 'application/json; charset=utf-8', '|Cache-Control:no-store'),
        '', '[Script]',
        f'BiliSR.Feed = type=http-response,pattern={FEED},requires-body=1,max-size=4194304,engine=webview,script-path={base}/bilisr-feed-v{VERSION}.js',
        f'BiliSR.View = type=http-response,pattern={VIEW},requires-body=1,binary-body-mode=1,max-size=262144,engine=webview,script-path={base}/bilisr-view-v{VERSION}.js',
        '', '[MITM]',
        'hostname = %APPEND% grpc.biliapi.net, app.bilibili.com, app.biliapi.net, app.biliapi.com',
        'h2 = true', '',
    ])


def build(output, base=DEFAULT_BASE):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    own_notice = '/* BiliSR\n' + (ROOT / 'LICENSE').read_text() + '\n*/\n'
    view = own_notice + '/* fflate 0.8.2 (MIT)\n' + (ROOT / 'vendor/fflate-LICENSE').read_text() + '\n*/\n'
    view += (ROOT / 'vendor/fflate-0.8.2.js').read_text() + '\n' + (ROOT / 'src/view.js').read_text()
    files = {
        'BiliSR.srmodule': module(base).encode(),
        f'bilisr-feed-v{VERSION}.js': own_notice.encode() + (ROOT / 'src/feed.js').read_bytes(),
        f'bilisr-view-v{VERSION}.js': view.encode(),
    }
    for name, content in files.items():
        (output / name).write_bytes(content)
    checksums = ''.join(hashlib.sha256(content).hexdigest() + '  ' + name + '\n' for name, content in sorted(files.items()))
    (output / 'SHA256SUMS').write_text(checksums)
    return sorted(files)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', default=DEFAULT_BASE, help='HTTPS directory hosting the generated scripts')
    parser.add_argument('--out', type=Path, default=ROOT / 'dist')
    args = parser.parse_args()
    for name in build(args.out, args.base_url):
        print(name)
