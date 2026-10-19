#!/usr/bin/env python3
"""Prepare reviewable News V2 payloads from a same-account public-page capture.

Reads an operator-supplied ZIP; never connects to the database or posts to an API.
The output contains article text and image URLs, so keep it out of Git and logs.
"""

import argparse
from datetime import datetime, timezone, timedelta
from html import unescape
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from urllib.parse import urlsplit, urlunsplit
import zipfile

ACCOUNT_BIZ = "MzY5MTM2ODk5NA=="
IMAGE_HOSTS = {"mmbiz.qpic.cn", "mmecoa.qpic.cn"}
BLOCK_TAGS = {"p", "div", "section", "li", "h1", "h2", "h3", "h4", "blockquote", "br"}
VOID_TAGS = {"img", "br", "hr", "input", "meta", "link", "source", "wbr"}
TAGS = {
    "01-2028-tui-mian": ["保研"],
    "02-timeline": ["保研"],
    "03-october-competitions": ["竞赛"],
    "04-autumn-recruitment": ["就业"],
}


def image_url(raw):
    raw = raw.replace("\\x26", "&")
    for _ in range(3):
        decoded = unescape(raw)
        if decoded == raw: break
        raw = decoded
    parsed = urlsplit(raw)
    if parsed.scheme not in ("http", "https") or parsed.hostname not in IMAGE_HOSTS or parsed.username or parsed.password or parsed.port:
        raise ValueError("unexpected image host")
    return urlunsplit(("https", parsed.netloc, parsed.path, parsed.query, ""))


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title = ""
        self.description = ""
        self.cover = ""
        self.stack = []
        self.finished = False
        self.fragments = []
        self.text = []
        self.images = []

    def flush(self):
        text = " ".join("".join(self.text).split())
        if text:
            self.fragments.append(text)
        self.text = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "meta":
            key = attrs.get("property", "")
            if key == "og:title": self.title = attrs.get("content", "").strip()
            if key == "og:description": self.description = attrs.get("content", "").strip()
            if key == "og:image": self.cover = attrs.get("content", "")
        if attrs.get("id") == "js_content" and not self.finished:
            self.stack = [tag]
        elif self.stack and tag not in VOID_TAGS:
            self.stack.append(tag)
        if not self.stack:
            return
        if tag == "img":
            self.flush()
            self.images.append(image_url(attrs.get("data-src") or attrs.get("src") or ""))
            self.fragments.append(self.images[-1])
        elif tag in BLOCK_TAGS:
            self.text.append("\n")

    def handle_endtag(self, tag):
        if not self.stack or tag not in self.stack: return
        if tag in BLOCK_TAGS: self.text.append("\n")
        index = len(self.stack) - 1 - self.stack[::-1].index(tag)
        del self.stack[index:]
        if not self.stack:
            self.flush()
            self.finished = True

    def handle_data(self, data):
        if self.stack: self.text.append(data)


def picture_images(source):
    marker = "picture_page_info_list: ["
    if marker not in source: return []
    start = source.index("[", source.index(marker))
    square = curly = 0
    quote = None
    escaped = False
    item_start = None
    images = []
    for position in range(start, len(source)):
        char = source[position]
        if quote:
            if escaped: escaped = False
            elif char == "\\": escaped = True
            elif char == quote: quote = None
            continue
        if char in "\"'": quote = char; continue
        if char == "[": square += 1
        elif char == "]":
            square -= 1
            if square == 0: break
        elif char == "{":
            curly += 1
            if square == 1 and curly == 1: item_start = position
        elif char == "}":
            if square == 1 and curly == 1 and item_start is not None:
                item = source[item_start:position + 1]
                match = re.match(r"\{\s*cdn_url:\s*'([^']+)'", item)
                if match: images.append(image_url(match.group(1)))
            curly -= 1
    if square or curly: raise ValueError("incomplete picture list")
    return images


def one_page(raw, name, supplied_url):
    source = raw.decode("utf-8-sig")
    if "verify" in source[:1000].lower() and "picture_page_info_list" not in source:
        raise ValueError("possible access challenge")
    biz = re.search(r"(?:var|window)\.?(?:\s+)?biz\s*=\s*[^;\n]*", source)
    if not biz or ACCOUNT_BIZ not in biz.group(0):
        raise ValueError("account mismatch")
    sent = re.search(r"ori_send_time:\s*'(\d+)'\s*\*\s*1", source)
    created = re.search(r"create_time:\s*'(\d{4}-\d\d-\d\d \d\d:\d\d)'", source)
    if not sent or not created: raise ValueError("publication time missing")
    published = datetime.fromtimestamp(int(sent.group(1)), timezone(timedelta(hours=8)))
    if published.strftime("%Y-%m-%d %H:%M") != created.group(1):
        raise ValueError("publication time conflict")
    page = Page(); page.feed(source)
    if not page.title or not page.cover: raise ValueError("page metadata incomplete")
    all_images = picture_images(source)
    if page.images:
        if page.images != all_images: raise ValueError("article images differ from picture order")
        body = "\n".join(page.fragments)
        media_type = "article"
    else:
        if not all_images: raise ValueError("picture page has no images")
        description = page.description.replace("\\x0a", "\n")
        body = "\n".join([description, *all_images])
        media_type = "image"
    if len(body) > 30000 or len([x for x in body.splitlines() if x.strip()]) > 100:
        raise ValueError("body exceeds API limits")
    if urlsplit(supplied_url).hostname != "mp.weixin.qq.com": raise ValueError("article host mismatch")
    return {
        "title": page.title, "articleUrl": supplied_url, "summary": page.description[:1000] or None,
        "coverUrl": image_url(page.cover), "publishedAt": published.isoformat(),
        "tags": TAGS[name], "mediaType": media_type, "body": body,
    }, {"title": page.title, "publishedAt": published.isoformat(), "mediaType": media_type,
        "images": len(all_images), "bodyCharacters": len(body), "bodyLines": len(body.splitlines())}


def prepare(capture):
    with zipfile.ZipFile(capture) as archive:
        summary = json.loads(archive.read("summary.json").decode("utf-8-sig"))
        if summary.get("expectedAccountBiz") != ACCOUNT_BIZ or len(summary.get("pages", [])) != 4:
            raise ValueError("capture account/page count mismatch")
        payloads = []; receipt = []
        for page in summary["pages"]:
            name = page["name"]
            if name not in TAGS or page.get("challengeLikely") or not page.get("expectedAccountMarkerPresent"):
                raise ValueError("capture page mismatch")
            raw = archive.read(name + ".html")
            if len(raw) != page["htmlBytes"]: raise ValueError("capture byte count mismatch")
            payload, evidence = one_page(raw, name, page["suppliedUrl"])
            payloads.append(payload); receipt.append(evidence)
    if len({p["articleUrl"] for p in payloads}) != 4: raise ValueError("duplicate URLs")
    return payloads, receipt


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("capture", type=Path)
    parser.add_argument("output", type=Path, help="private local JSON; never commit or paste article text")
    args = parser.parse_args()
    payloads, receipt = prepare(args.capture)
    if args.output.exists(): raise SystemExit("Refusing to overwrite existing output")
    args.output.write_text(json.dumps(payloads, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"status": "PUBLIC_PAGES_PREPARED_NO_WRITE", "pages": receipt}, ensure_ascii=False))
