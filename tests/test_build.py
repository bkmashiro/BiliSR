import base64
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('build', ROOT / 'scripts/build.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class BuildTests(unittest.TestCase):
    def test_native_response_contracts(self):
        rules = [line for line in builder.module(builder.DEFAULT_BASE).splitlines() if line.startswith('^https:')]
        self.assertEqual(len(rules), 3)
        for index, line in enumerate(rules):
            raw = base64.b64decode(re.search(r'data="([^"]+)"', line)[1], validate=True)
            self.assertEqual(len(raw), int(re.search(r'Content-Length:(\d+)', line)[1]))
            self.assertIn('status-code=200', line)
            if index == 0:
                self.assertEqual(raw, bytes(5))
                self.assertIn('Content-Type:application/grpc', line)
                self.assertIn('grpc-status:0', line)
            else:
                doc = json.loads(raw)
                self.assertEqual(doc['code'], 0)
                self.assertEqual(doc['data']['show'], [])
                self.assertIn('Cache-Control:no-store', line)
                if index == 1:
                    self.assertEqual(doc['data']['keep_ids'], [])
                    self.assertEqual(doc['data']['max_time'], 0)
                    self.assertEqual(doc['data']['list'], [{}])
                    self.assertEqual(doc['data']['pull_interval'], 60)
                    self.assertEqual(doc['data']['min_interval'], 0)

    def test_routes_and_no_overlap(self):
        for host in ['app.bilibili.com', 'app.biliapi.net', 'app.biliapi.com']:
            base = 'https://' + host
            for tail in ['', '?a=1&b=2']:
                self.assertRegex(base + '/x/v2/splash/list' + tail, builder.SPLASH_LIST)
                for name in ['show', 'brand/list', 'event/list2']:
                    self.assertRegex(base + '/x/v2/splash/' + name + tail, builder.SPLASH_OTHER)
                self.assertRegex(base + '/x/v2/feed/index' + tail, builder.FEED)
        base = 'https://grpc.biliapi.net/bilibili.app.viewunite.v1.View/'
        for host in ['grpc.biliapi.net', 'app.bilibili.com', 'app.biliapi.net', 'app.biliapi.com']:
            self.assertRegex('https://' + host + '/bilibili.app.viewunite.v1.View/PlayPause', builder.PAUSE)
        for name in ['View', 'AIRelateAsync', 'ViewProgress', 'RelatesFeed']:
            self.assertRegex(base + name, builder.VIEW)
            self.assertNotRegex(base + name, builder.PAUSE)
        self.assertNotRegex(base + 'PlayPause', builder.VIEW)
        for url in ['https://example.com/x/v2/splash/list', 'https://app.bilibili.com/x/v2/splash/list/extra', 'https://app.bilibili.com/x/v2/feed/index/story', base + 'PlayPauseX', base + 'ViewEndPage']:
            for pattern in [builder.SPLASH_LIST, builder.SPLASH_OTHER, builder.PAUSE, builder.VIEW, builder.FEED]:
                self.assertNotRegex(url, pattern)
        scripts = builder.module(builder.DEFAULT_BASE).split('[Script]')[1].split('[MITM]')[0]
        self.assertNotIn('splash', scripts)
        self.assertNotIn('PlayPause', scripts)
        self.assertEqual(scripts.count('script-path='), 2)

    def test_self_hosting_url_validation(self):
        text = builder.module('https://example.com/assets/')
        self.assertIn('script-path=https://example.com/assets/bilisr-feed-', text)
        for bad in ['http://example.com', 'https://u:p@example.com', 'https://example.com/?q=1', 'https://example.com/#x', 'https://example.com/,argument=bad', 'https://example.com/\nfoo', 'https://example.com/"x']:
            with self.assertRaises(ValueError):
                builder.module(bad)

    def test_reproducible_build_and_checksums(self):
        with tempfile.TemporaryDirectory(dir=os.environ.get('TMPDIR')) as folder:
            first = Path(folder) / 'first'
            second = Path(folder) / 'second'
            self.assertEqual(builder.build(first), builder.build(second))
            for path in first.iterdir():
                self.assertEqual(path.read_bytes(), (second / path.name).read_bytes())
            for line in (first / 'SHA256SUMS').read_text().splitlines():
                digest, name = line.split('  ')
                self.assertEqual(hashlib.sha256((first / name).read_bytes()).hexdigest(), digest)

    def test_no_broad_rules_or_diagnostic_hooks(self):
        text = builder.module(builder.DEFAULT_BASE)
        for forbidden in ['[Rule]', 'REJECT', 'diag-check', '$notify', 'ViewEndPage']:
            self.assertNotIn(forbidden, text)


if __name__ == '__main__':
    unittest.main()
