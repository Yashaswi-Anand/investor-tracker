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

Design: an ascending bar chart with an arrow, on the brand blue.
Re-run this after changing BRAND or the design.
"""

import os

from PIL import Image, ImageDraw

BRAND = (31, 79, 216)        # --primary #1f4fd8
BRAND_DARK = (22, 56, 155)   # --primary-dark
WHITE = (255, 255, 255)
ACCENT = (110, 231, 168)     # the green "live" dot

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "icons")


def rounded_background(size, radius_ratio=0.22):
    """Brand-blue rounded square with a subtle vertical gradient."""
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gradient = Image.new("RGBA", (size, size))
    draw = ImageDraw.Draw(gradient)
    for y in range(size):
        t = y / max(size - 1, 1)
        colour = tuple(
            int(BRAND[i] + (BRAND_DARK[i] - BRAND[i]) * t) for i in range(3)
        )
        draw.line([(0, y), (size, y)], fill=colour + (255,))

    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, size - 1, size - 1], radius=int(size * radius_ratio), fill=255
    )
    image.paste(gradient, (0, 0), mask)
    return image


def draw_chart(image, inset):
    """Three ascending bars plus an arrow — 'IPO going up'."""
    size = image.size[0]
    draw = ImageDraw.Draw(image)

    area = size - inset * 2
    bar_w = area * 0.17
    gap = area * 0.09
    base_y = inset + area * 0.80
    heights = (0.26, 0.40, 0.54)
    start_x = inset + area * 0.10
    radius = max(2, int(bar_w * 0.28))

    for index, height_ratio in enumerate(heights):
        x0 = start_x + index * (bar_w + gap)
        y0 = base_y - area * height_ratio
        draw.rounded_rectangle(
            [int(x0), int(y0), int(x0 + bar_w), int(base_y)],
            radius=radius,
            fill=WHITE,
        )

    # Arrow head floating above the tallest bar, with a clear gap so it
    # reads as an arrow rather than a tip on the bar.
    tip_x = start_x + 2 * (bar_w + gap) + bar_w / 2
    tip_y = inset + area * 0.06
    arrow = area * 0.10
    draw.polygon(
        [
            (tip_x, tip_y),
            (tip_x - arrow, tip_y + arrow * 1.5),
            (tip_x + arrow, tip_y + arrow * 1.5),
        ],
        fill=ACCENT,
    )

    # Baseline. A plain rectangle: at 48px the rounded variant is only a few
    # pixels tall and Pillow rejects a radius larger than half the height.
    bl_top = int(base_y + area * 0.05)
    bl_bottom = max(bl_top + 2, int(base_y + area * 0.09))
    draw.rectangle(
        [int(start_x), bl_top, int(start_x + area * 0.72), bl_bottom],
        fill=WHITE,
    )
    return image


def make_icon(size, maskable=False):
    if maskable:
        # Maskable icons must keep content inside the middle 80%, because
        # Android may crop to a circle or squircle.
        image = Image.new("RGBA", (size, size), BRAND + (255,))
        draw_chart(image, inset=int(size * 0.22))
    else:
        image = rounded_background(size)
        draw_chart(image, inset=int(size * 0.16))
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
