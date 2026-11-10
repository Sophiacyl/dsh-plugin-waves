"""Bounded native image variants for dsh-go's authenticated asset route."""
import asyncio
import io
from pathlib import Path
from typing import Any, Dict, List
from urllib.parse import urlparse

from PIL import Image

from rover.logger import logger
from rover.media import MEDIA_DIR, media_path, render_png

_NATIVE_LOCK = asyncio.Lock()
# The bridge accepts <= 1 MiB per image. Leave room for future format overhead.
_MAX_BYTES = 950_000


def _image_variant(source: Path) -> Path:
    target = source.with_name(source.stem + ".native.jpg")
    if target.is_file() and target.stat().st_mtime >= source.stat().st_mtime:
        return target
    with Image.open(source) as raw:
        image = raw.convert("RGB")
        image.thumbnail((1600, 4096))
        if image.width * image.height > 4_000_000:
            scale = (4_000_000 / (image.width * image.height)) ** .5
            image = image.resize((max(1, int(image.width * scale)), max(1, int(image.height * scale))))
        for _ in range(6):
            for quality in (88, 76, 62, 48):
                buf = io.BytesIO()
                image.save(buf, format="JPEG", quality=quality, optimize=True)
                data = buf.getvalue()
                if len(data) <= _MAX_BYTES:
                    target.write_bytes(data)
                    return target
            image = image.resize((max(1, int(image.width * .8)), max(1, int(image.height * .8))))
    raise ValueError("图片过大，请使用文字摘要")


async def native_segments(segments: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Keep the original segments; add images only for local generated media."""
    out = []
    for segment in segments:
        seg = dict(segment)
        if seg.get("type") == "node":
            seg["items"] = await native_segments(seg.get("items") or [])
        elif seg.get("type") in ("html", "image"):
            url = str(seg.get("url") or "")
            parsed = urlparse(url)
            # Never turn model/user-controlled external URLs into server fetches.
            if not parsed.scheme and not parsed.netloc and parsed.path.startswith("/api/media/"):
                name = parsed.path.removeprefix("/api/media/")
                if "/" not in name and "\\" not in name:
                    try:
                        async with _NATIVE_LOCK:
                            source = await render_png(name) if seg["type"] == "html" else media_path(name)
                            if source is not None:
                                target = await asyncio.to_thread(_image_variant, source)
                                seg["native_image"] = target.name
                    except Exception as error:
                        logger.warning(f"[原生卡片] 图片生成失败: {error}")
                        seg["native_error"] = "图片暂不可用，请查看文字摘要"
        out.append(seg)
    return out
