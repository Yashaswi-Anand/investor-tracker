"""
Generate the PWA / TWA app icons.

Run from web/:   python scripts/make_icons.py

Produces public/icons/:
    icon-192.png            app icon
    icon-512.png            app icon (large)
    icon-maskable-512.png   maskable variant with the 20% safe-area padding
                            Android needs so the icon is not clipped
    apple-touch-icon.png    iOS home-screen icon
    favicon.png

Design: the "Investor" brand mark — a rising line with an arrow head over a
baseline, white on the brand gradient (indigo -> violet -> sky). Matches the
inline SVG in web/app/components/Logo.jsx. Re-run after changing colours.
"""

import os

from PIL import Image, ImageDraw, ImageFilter

# Brand gradient stops (must match --brand-grad in globals.css)
STOPS = [
    (0.00, (67, 56, 202)),    # #4338ca indigo
    (0.52, (109, 40, 217)),   # #6d28d9 violet
    (1.00, (2, 132, 199)),    # #0284c7 sky
]
WHITE = (255, 255, 255)
ACCENT = (110, 231, 183)      # mint — the "live" dot colour

OUT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "icons"
)


def _lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def _gradient_colour(t):
    for (t0, c0), (t1, c1) in zip(STOPS, STOPS[1:]):
        if t <= t1:
            return _lerp(c0, c1, (t - t0) / (t1 - t0) if t1 > t0 else 0)
    return STOPS[-1][1]


def gradient_square(size, rounded=True, radius_ratio=0.22):
    """Diagonal brand gradient, optionally in a rounded square."""
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    grad = Image.new("RGBA", (size, size))
    px = grad.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            px[x, y] = _gradient_colour(t) + (255,)
    # soft highlight top-right like the hero
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse(
        [int(size * 0.45), int(-size * 0.35), int(size * 1.25), int(size * 0.45)],
        fill=(255, 255, 255, 60),
    )
    glow = glow.filter(ImageFilter.GaussianBlur(size * 0.12))
    grad = Image.alpha_composite(grad, glow)

    if not rounded:
        return grad
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, size - 1, size - 1], radius=int(size * radius_ratio), fill=255
    )
    image.paste(grad, (0, 0), mask)
    return image


def draw_mark(image, inset):
    """Rising line + arrow head + baseline, scaled to the inner area."""
    size = image.size[0]
    draw = ImageDraw.Draw(image)
    area = size - inset * 2
    w = max(2, int(area * 0.11))          # stroke width

    def P(x, y):  # viewBox 32x32 -> pixels
        return (inset + x / 32 * area, inset + y / 32 * area)

    # polyline 5,24 -> 12.5,16 -> 18,20.5 -> 27,9
    pts = [P(5, 24), P(12.5, 16), P(18, 20.5), P(27, 9)]
    draw.line(pts, fill=WHITE, width=w, joint="curve")
    # round caps
    r = w / 2
    for x, y in (pts[0], pts[-1]):
        draw.ellipse([x - r, y - r, x + r, y + r], fill=WHITE)
    # arrow head: 20.5,9 -> 27,9 -> 27,15.5
    head = [P(20.5, 9), P(27, 9), P(27, 15.5)]
    draw.line(head, fill=WHITE, width=w, joint="curve")
    for x, y in (head[0], head[-1]):
        draw.ellipse([x - r, y - r, x + r, y + r], fill=WHITE)
    # baseline (semi-transparent white) — composite separately for alpha
    base = Image.new("RGBA", image.size, (0, 0, 0, 0))
    bd = ImageDraw.Draw(base)
    bw = max(2, int(w * 0.7))
    x0, y0 = P(5, 28)
    x1, _ = P(27, 28)
    bd.line([(x0, y0), (x1, y0)], fill=WHITE + (120,), width=bw)
    for x in (x0, x1):
        bd.ellipse([x - bw / 2, y0 - bw / 2, x + bw / 2, y0 + bw / 2], fill=WHITE + (120,))
    image.alpha_composite(base)
    return image


def make_icon(size, maskable=False):
    if maskable:
        # Maskable icons must keep content inside the middle 80%, because
        # Android may crop to a circle or squircle.
        image = gradient_square(size, rounded=False)
        draw_mark(image, inset=int(size * 0.24))
    else:
        image = gradient_square(size)
        draw_mark(image, inset=int(size * 0.17))
    return image


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    outputs = {
        "icon-192.png": make_icon(192),
        "icon-512.png": make_icon(512),
        "icon-maskable-512.png": make_icon(512, maskable=True),
        "apple-touch-icon.png": make_icon(180),
        "favicon.png": make_icon(48),
    }
    for filename, image in outputs.items():
        path = os.path.join(OUT_DIR, filename)
        image.save(path, "PNG", optimize=True)
        print(f"  {filename:<26} {image.size[0]}x{image.size[1]}  {os.path.getsize(path):,} bytes")
    print(f"\nWrote {len(outputs)} icons to {OUT_DIR}")


if __name__ == "__main__":
    main()
