"""يولّد أيقونة التطبيق وشاشة البداية من هوية دفتر بلا أي أداة خارجية.

يرسم تصميماً مسطّحاً بالعينات الفرعية (2×2) لتنعيم الحواف، ويكتب PNG بـRGB
عبر zlib فقط. الناتج في apk/assets يقرؤه @capacitor/assets داخل CI.
"""
import struct
import zlib

BURGUNDY = (0x6B, 0x25, 0x25)
PAPER = (0xE1, 0xE0, 0xD9)
SAMPLES = ((0.25, 0.25), (0.75, 0.25), (0.25, 0.75), (0.75, 0.75))


def in_round_rect(x, y, x0, y0, x1, y1, r):
    """اختبار نقطة داخل مستطيل بأركان دائرية."""
    if not (x0 <= x <= x1 and y0 <= y <= y1):
        return False
    dx = max(x0 + r - x, x - (x1 - r), 0)
    dy = max(y0 + r - y, y - (y1 - r), 0)
    return dx * dx + dy * dy <= r * r


def pixel_color(x, y, layers):
    """لون النقطة: أعلى طبقة تضمها، أو شفافياً تُملأ بلون الخلفية."""
    for color, test in layers:
        if test(x, y):
            return color
    return None


def render(size, bg, layers):
    """يرسم مربعاً بحجم size؛ كل طبقة (لون، اختبار) فوق التي تليها."""
    ss = 2
    rows = []
    for py in range(size):
        row = bytearray()
        for px in range(size):
            r = g = b = 0
            for sx, sy in SAMPLES:
                x = px + sx / ss
                y = py + sy / ss
                color = pixel_color(x, y, layers)
                c = bg if color is None else color
                r += c[0]
                g += c[1]
                b += c[2]
            row += bytes((r // 4, g // 4, b // 4))
        rows.append(row)
    return rows


def upscale(rows, size, factor):
    """تكبير بالجار الأقرب أفقياً وعمودياً؛ التصميم مسطّح فلا يتشوه."""
    out = []
    for y in range(size * factor):
        base = rows[y // factor]
        row = bytearray()
        for x in range(size * factor):
            i = (x // factor) * 3
            row += base[i:i + 3]
        out.append(bytes(row))
    return out


def write_png(path, rows):
    """يكتب PNG 8-bit RGB بلا مرشّحات."""
    height, width = len(rows), len(rows[0]) // 3
    raw = b"".join(b"\x00" + row for row in rows)

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data)) + tag + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    with open(path, "wb") as f:
        f.write(png)
    print("كُتب", path, width, "×", height)


def paper_layers(x0, y0, x1, y1, sheet, lines):
    """ورقة بأركان دائرية وخطوط كتابة داخلها."""
    r = 48
    # الخطوط أولاً: pixel_color تُرجع أول طبقة تضم النقطة، فما يأتي أولاً يعلو
    layers = []
    for (lx0, ly0, lx1, ly1) in lines:
        layers.append((
            BURGUNDY if sheet is PAPER else PAPER,
            lambda x, y, a=lx0, b=ly0, c=lx1, d=ly1: in_round_rect(x, y, a, b, c, d, 8),
        ))
    layers.append((sheet, lambda x, y: in_round_rect(x, y, x0, y0, x1, y1, r)))
    return layers


# الأيقونة 1024: خلفية نبيتي وورقة حجرية بثلاثة خطوط (الثالث أقصر)
icon_lines = [
    (272, 372, 752, 396),
    (272, 468, 752, 492),
    (272, 564, 520, 588),
]
icon_rows = render(
    1024, BURGUNDY,
    paper_layers(212, 192, 812, 832, PAPER, icon_lines),
)
write_png("apk/assets/icon.png", icon_rows)

# شاشة البداية: خلفية حجرية وعلامة نبيتي صغيرة، تُرسم 1366 ثم تُكبَّر إلى 2732
splash_layers = paper_layers(583, 533, 783, 833, BURGUNDY, [])
splash_small = render(1366, PAPER, splash_layers)
write_png("apk/assets/splash.png", upscale(splash_small, 1366, 2))
