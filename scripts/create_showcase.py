#!/usr/bin/env python3
"""Generate a self-contained static showcase from a local JSON manifest."""
import argparse
import json
import math
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULTS = {
    'pageTitle': 'MY STUDIO · 互动展示', 'brand': 'MY STUDIO', 'brandMark': '',
    'subtitle': '我的系列 · 互动展示', 'season': 'COLLECTION 01',
    'receiptSeason': 'COLLECTION 01', 'statusTime': '09:00', 'statusText': 'EXPLORE',
    'battery': '100%', 'thanks': 'THANKS FOR EXPLORING.', 'shopLabel': 'EXPLORE THIS LOOK',
    'bagLabel': 'BAG', 'addFitLabel': 'ADD WHOLE FIT TO BAG →', 'addedFitLabel': 'ADDED TO BAG ✓',
    'discountRate': 0.15, 'currency': '¥', 'imageAspect': 2/3, 'gridColumns': 3,
    'demoFeatureIndex': 0, 'theme': {'background': '#EBEAEC', 'ink': '#111111', 'muted': '#8b8a8f'},
}


def number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def prepare(manifest):
    raw = json.loads(manifest.read_text(encoding='utf-8'))
    if not isinstance(raw, dict):
        raise ValueError('配置必须是 JSON 对象')
    cfg = {**DEFAULTS, **raw}
    cfg['theme'] = {**DEFAULTS['theme'], **raw.get('theme', {})}
    for key, value in DEFAULTS.items():
        if isinstance(value, str) and not isinstance(cfg[key], str):
            raise ValueError(f'{key} 必须是文本')
    for key in DEFAULTS['theme']:
        color = cfg['theme'][key]
        if not isinstance(color, str) or len(color) != 7 or color[0] != '#' or any(c not in '0123456789abcdefABCDEF' for c in color[1:]):
            raise ValueError(f'theme.{key} 必须是 #RRGGBB')
    looks = cfg.get('looks')
    if not isinstance(looks, list) or not 1 <= len(looks) <= 12:
        raise ValueError('looks 需要 1–12 项；9 项可保持原版九宫格')
    if not number(cfg['discountRate']) or not 0 <= cfg['discountRate'] <= 1:
        raise ValueError('discountRate 需要在 0–1 之间')
    if not number(cfg['imageAspect']) or not 0.2 <= cfg['imageAspect'] <= 3:
        raise ValueError('imageAspect 为图片宽/高，范围 0.2–3')
    if type(cfg['gridColumns']) is not int or not 1 <= cfg['gridColumns'] <= 4:
        raise ValueError('gridColumns 需要是 1–4 的整数')
    if type(cfg['demoFeatureIndex']) is not int or not 0 <= cfg['demoFeatureIndex'] < len(looks):
        raise ValueError('demoFeatureIndex 超出素材数组范围（从 0 开始）')
    ids, copies = set(), []
    for i, look in enumerate(looks):
        if not isinstance(look, dict):
            raise ValueError(f'looks[{i}] 需要是对象')
        ident = look.setdefault('id', str(i+1).zfill(2))
        if not isinstance(ident, str) or not ident or ident in ids or not all(c.isascii() and (c.isalnum() or c in '-_') for c in ident):
            raise ValueError(f'looks[{i}].id 需要唯一的英文、数字、横线或下划线')
        ids.add(ident)
        for key in ['en', 'cn', 'tag']:
            look.setdefault(key, '')
            if not isinstance(look[key], str):
                raise ValueError(f'{ident}.{key} 需要是文本')
        if 'hidden' in look and type(look['hidden']) is not bool:
            raise ValueError(f'{ident}.hidden 需要是布尔值')
        for key in ['items', 'props', 'hs']:
            look.setdefault(key, [])
            if not isinstance(look[key], list):
                raise ValueError(f'{ident}.{key} 需要是数组')
        for it in look['items'] + look['props']:
            if not isinstance(it, dict) or not isinstance(it.get('name'), str):
                raise ValueError(f'{ident} 单品需要 name 文本')
            if it.get('price') is not None and (not number(it['price']) or it['price'] < 0):
                raise ValueError(f'{ident} 的价格需要是非负数字或 null')
            it.setdefault('price', None)
            it.setdefault('short', it['name'])
            it.setdefault('cat', 'ITEM')
            if not all(isinstance(it[k], str) for k in ['short', 'cat']):
                raise ValueError(f'{ident} 的 short/cat 需要是文本')
        for h in look['hs']:
            if not isinstance(h, dict):
                raise ValueError(f'{ident} 的热区需要是对象')
            ref = h.get('ref', '')
            if not isinstance(ref, str) or len(ref) < 2 or ref[0] not in 'ip' or not ref[1:].isdigit():
                raise ValueError(f'{ident} 热区 ref 使用 i0 / p0 等格式')
            target = look['items'] if ref[0] == 'i' else look['props']
            if int(ref[1:]) >= len(target):
                raise ValueError(f'{ident} 热区 {ref} 指向不存在的单品')
            if any(not number(h.get(k)) or not 0 <= h[k] <= 1 for k in ['x', 'y']):
                raise ValueError(f'{ident} 热区 x/y 需要在 0–1 之间')
        for key in ['img', 'hd']:
            if key == 'hd' and not look.get(key):
                look.pop(key, None)
                continue
            path = look.get(key)
            if not isinstance(path, str) or not path:
                raise ValueError(f'{ident} 缺少 {key} 图片')
            source = (manifest.parent / path).resolve()
            if not source.is_file() or source.suffix.lower() not in ['.png', '.jpg', '.jpeg', '.webp', '.svg']:
                raise ValueError(f'{ident}.{key} 需要存在的本地 PNG/JPG/WebP/SVG 文件')
            dest = Path('images') / ('hd' if key == 'hd' else '') / (ident + source.suffix.lower())
            copies.append((source, dest))
            look[key] = dest.as_posix()
    masks = cfg.get('masks', {})
    if not isinstance(masks, dict) or any(k not in ids or not isinstance(v, str) or len(v) != 48*72 or set(v) - {'0', '1'} for k, v in masks.items()):
        raise ValueError('masks 必须按素材 id 提供 48×72、仅含 0/1 的字符串；换素材时应移除旧遮罩')
    return cfg, copies


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--config', type=Path, help='本地素材清单 JSON；图片路径相对该文件')
    source.add_argument('--example', choices=['ootd'], help='生成原版 OOTD 示例')
    parser.add_argument('--output', required=True, type=Path, help='必须使用尚不存在的新目录')
    args = parser.parse_args()
    manifest = (ROOT/'assets/ootd-example/config.json') if args.example else args.config.expanduser().resolve()
    output = args.output.expanduser().resolve()
    try:
        if output.exists():
            raise ValueError('输出目录已存在，请使用新目录，避免覆盖文件')
        cfg, copies = prepare(manifest)
        output.mkdir(parents=True)
        for template in (ROOT/'assets/template').iterdir():
            if template.is_file():
                shutil.copy2(template, output/template.name)
        for src, relative in copies:
            dest = output/relative
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dest)
        encoded = json.dumps(cfg, ensure_ascii=False, indent=2)
        (output/'config.json').write_text(encoded+'\n', encoding='utf-8')
        (output/'config.js').write_text('window.SHOWCASE_CONFIG = '+encoded.replace('<', '\\u003c')+';\n', encoding='utf-8')
        print(f'已生成：{output}\n素材数：{len(cfg["looks"])}；直接打开 index.html，或用本地 HTTP 服务预览。')
    except (ValueError, OSError, TypeError) as e:
        parser.exit(1, f'生成失败：{e}\n')


if __name__ == '__main__':
    main()
