"""
Generate the PWA / TWA icon set from the brand mark.

The icons used to be opaque binaries with no source, so when the palette
changed they silently kept the old one. This script IS their source: run it
after changing the brand colours and commit what it writes.

    python tools/make_icons.py

The colours below mirror --brand-grad and --on-brand in web/app/globals.css.
PNG pixels cannot read a CSS variable, so they are repeated here and nowhere
else; if the palette moves, change globals.css and re-run this.
"""

import os

from PIL import Image, ImageDraw

# --brand-grad, 120deg: #6d3220 -> #8f4429 -> #d98a52
GRADIENT = ((0x6D, 0x32, 0x20), (0x8F, 0x44, 0x29), (0xD9, 0x8A, 0x52))
GLYPH = (0xFD, 0xF8, 0xF0)  # --on-brand

OUT = os.path.join(os.path.dirname(__file__), "..", "web", "public", "icons")

# The brand mark from web/app/components/Logo.jsx, in its 32x32 viewBox.
RISING_LINE = [(5, 24), (12.5, 16), (18, 20.5), (27, 9)]
ARROW_HEAD = [(20.5, 9), (27, 9), (27, 15.5)]
BASELINE = [(5, 28), (27, 28)]

# Drawn at 4x then downsampled: PIL has no antialiasing on lines, and a
# 512px icon with stair-stepped strokes looks cheap at any size.
SUPERSAMPLE = 4


def gradient(size):
    """The 120-degree brand gradient, as an image."""
    image = Image.new("RGB", (size, size))
    pixels = image.load()
    # 120deg in CSS runs top-left to bottom-right; project each pixel onto
    # that axis and read the three stops off it.
    for y in range(size):
        for x in range(size):
            t = ((x + y) / (2 * (size - 1))) if size > 1 else 0.0
            if t < 0.52:
                a, b, local = GRADIENT[0], GRADIENT[1], t / 0.52
            else:
                a, b, local = GRADIENT[1], GRADIENT[2], (t - 0.52) / 0.48
            pixels[x, y] = tuple(
                round(a[i] + (b[i] - a[i]) * local) for i in range(3)
            )
    return image


def fit(span, canvas):
    """Scale and offsets that centre the mark within `span` pixels.

    The mark does not fill its 32x32 viewBox — it occupies roughly x 5..27 and
    y 9..28 — so mapping the viewBox straight onto the canvas leaves it
    sitting low and small. Fitting its real bounding box, stroke width
    included, centres it optically and lets it fill the space it is given.
    """
    pad = 3.2 / 2  # half the widest stroke: round caps overhang the path
    xs = [x for path in (RISING_LINE, ARROW_HEAD, BASELINE) for x, _ in path]
    ys = [y for path in (RISING_LINE, ARROW_HEAD, BASELINE) for _, y in path]
    x0, x1 = min(xs) - pad, max(xs) + pad
    y0, y1 = min(ys) - pad, max(ys) + pad

    scale = span / max(x1 - x0, y1 - y0)
    return (
        scale,
        (canvas - (x1 - x0) * scale) / 2 - x0 * scale,
        (canvas - (y1 - y0) * scale) / 2 - y0 * scale,
    )


def stroke(draw, points, width, scale, origin, fill):
    """A polyline with round caps and joins.

    PIL's `joint="curve"` rounds the joins but leaves the ends square, so the
    caps are drawn as circles — without them the arrow's tips look clipped.
    """
    ox, oy = origin
    pts = [(x * scale + ox, y * scale + oy) for x, y in points]
    draw.line(pts, fill=fill, width=round(width * scale), joint="curve")
    radius = width * scale / 2
    for x, y in pts:
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=fill)


def render(size, maskable=False):
    """One icon. `maskable` keeps the glyph inside Android's safe circle."""
    big = size * SUPERSAMPLE
    icon = gradient(big).convert("RGBA")

    # Android masks maskable icons to a circle covering the middle 80%, so the
    # mark is drawn smaller to survive the crop.
    inset = 0.26 if maskable else 0.17
    scale, ox, oy = fit(big * (1 - 2 * inset), big)
    origin = (ox, oy)

    # The glyph goes on its own layer and is composited, NOT drawn straight
    # onto the icon. ImageDraw replaces pixels rather than blending them, so
    # drawing the 45%-opacity baseline directly would punch a translucent hole
    # through the icon and let the launcher wallpaper show through it.
    glyph = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(glyph)
    stroke(draw, BASELINE, 2.4, scale, origin, GLYPH + (115,))
    stroke(draw, RISING_LINE, 3.2, scale, origin, GLYPH + (255,))
    stroke(draw, ARROW_HEAD, 3.2, scale, origin, GLYPH + (255,))
    icon = Image.alpha_composite(icon, glyph)

    if not maskable:
        # A rounded square for launchers that do not mask. Applied last, so it
        # is the only thing that makes any pixel transparent.
        mask = Image.new("L", (big, big), 0)
        ImageDraw.Draw(mask).rounded_rectangle(
            (0, 0, big - 1, big - 1), radius=round(big * 0.22), fill=255
        )
        icon.putalpha(mask)

    return icon.resize((size, size), Image.LANCZOS)


def main():
    targets = [
        ("icon-192.png", 192, False),
        ("icon-512.png", 512, False),
        ("icon-maskable-512.png", 512, True),
        ("apple-touch-icon.png", 180, False),
        ("favicon.png", 48, False),
    ]
    for name, size, maskable in targets:
        path = os.path.normpath(os.path.join(OUT, name))
        render(size, maskable).save(path, "PNG", optimize=True)
        print(f"  wrote {name:24} {size}x{size}{'  (maskable)' if maskable else ''}")


if __name__ == "__main__":
    main()
