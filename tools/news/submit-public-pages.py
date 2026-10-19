#!/usr/bin/env python3
"""Submit an operator-reviewed four-page payload through the existing admin API.

Dry-run by default. This tool never prints the admin session or article bodies.
Production execution requires a separate explicit authorization and a live
administrator session; each post is idempotent by its original WeChat URL.
"""

import argparse
from getpass import getpass
from hashlib import sha256
import json
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener

API = "https://api.jiuchenedu.com/me/admin/news/verified-official"
EXPECTED_COUNT = 4
EXPECTED_PAYLOAD_SHA256 = "61a208d3396e0136279ed843a587da0ed1a290f0d7bf1f01746f67a34a651f92"


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


def review(path):
    posts = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(posts, list) or len(posts) != EXPECTED_COUNT:
        raise ValueError("expected exactly four reviewed posts")
    if len({post["articleUrl"] for post in posts}) != EXPECTED_COUNT:
        raise ValueError("duplicate original URLs")
    for post in posts:
        if not post["articleUrl"].startswith("https://mp.weixin.qq.com/s/"):
            raise ValueError("unexpected original URL")
        if not post["title"] or not post["body"] or not post["tags"]:
            raise ValueError("incomplete source payload")
        print(json.dumps({"title": post["title"], "publishedAt": post["publishedAt"],
                          "mediaType": post["mediaType"], "imageCount": sum(
                              line.startswith("https://mmecoa.qpic.cn/") or
                              line.startswith("https://mmbiz.qpic.cn/")
                              for line in post["body"].splitlines())}, ensure_ascii=False))
    return posts


def submit(posts, token):
    opener = build_opener(NoRedirect)
    for index, post in enumerate(posts, 1):
        request = Request(API, data=json.dumps(post, ensure_ascii=False).encode("utf-8"),
                          headers={"Authorization": "Bearer " + token,
                                   "Content-Type": "application/json"}, method="POST")
        try:
            with opener.open(request, timeout=25) as response:
                result = json.load(response)
                if response.status != 200 or result.get("ok") is not True:
                    raise ValueError("API did not confirm saved post")
                print(f"POST_{index}={'CREATED' if result.get('created') else 'ALREADY_EXISTS'}")
        except (HTTPError, URLError, ValueError) as exc:
            # Do not echo response bodies, request headers, article text, or token.
            status = exc.code if isinstance(exc, HTTPError) else type(exc).__name__
            raise RuntimeError(f"POST_{index}_STOPPED: {status}; earlier posts can be retried by URL") from None


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("payload", type=Path)
    parser.add_argument("--apply", action="store_true", help="write to the fixed production admin API")
    args = parser.parse_args()
    posts = review(args.payload)
    if not args.apply:
        print("REVIEW_ONLY_NO_NETWORK_NO_WRITE")
    else:
        if sha256(args.payload.read_bytes()).hexdigest() != EXPECTED_PAYLOAD_SHA256:
            raise SystemExit("Payload hash differs from the four-page reviewed bundle; stopped without writes")
        print("Production write requested; verify exact candidate, News V2 enablement and separate approval first.")
        token = getpass("管理员会话 Bearer token（仅终端输入，不显示）：").strip()
        if not token: raise SystemExit("No token; stopped without writes")
        submit(posts, token)
        print("FOUR_POST_REQUESTS_COMPLETED; verify production reads and device images separately")
