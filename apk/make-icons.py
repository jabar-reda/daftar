"""يحوّل شعار الموقع favicon.svg إلى أصول APK: أيقونة 1024 وشاشة بداية 2732.

لا يرسم أي شكل يدوياً: التحويل بـ resvg، وتركيب الشاشة بـ Pillow.
يحتاج: python -m pip install resvg-py pillow
"""
from io import BytesIO
from pathlib import Path

try:
    import resvg_py
    from PIL import Image
except ImportError as error:  # pragma: no cover
    raise SystemExit(
        f"ناقصة مكتبة {error.name}: ثبّتها بالأمر python -m pip install resvg-py pillow"
    ) from error

ROOT = Path(__file__).resolve().parent.parent
SVG = ROOT / "src" / "icons" / "favicon.svg"
ASSETS = Path(__file__).resolve().parent / "assets"

ICON_SIZE = 1024
SPLASH_SIZE = 2732
SPLASH_MARK_SIZE = 800
STONE = (0xE1, 0xE0, 0xD9)  # نفس خلفية الشاشة في apk.yml


def render_svg(size):
    """يحوّل الشعار إلى PNG مربّع بالحجم المطلوب، بزوايا شفافة."""
    return resvg_py.svg_to_bytes(svg_path=str(SVG), width=size, height=size)


def make_icon():
    """أيقونة التطبيق: الشعار كما هو بلا تعديل."""
    (ASSETS / "icon.png").write_bytes(render_svg(ICON_SIZE))
    print("كُتب", ASSETS / "icon.png")


def make_splash():
    """شاشة البداية: الشعار وسط الخلفية الحجرية."""
    canvas = Image.new("RGB", (SPLASH_SIZE, SPLASH_SIZE), STONE)
    mark = Image.open(BytesIO(render_svg(SPLASH_MARK_SIZE))).convert("RGBA")
    offset = (SPLASH_SIZE - SPLASH_MARK_SIZE) // 2
    canvas.paste(mark, (offset, offset), mark)
    canvas.save(ASSETS / "splash.png")
    print("كُتب", ASSETS / "splash.png")


if __name__ == "__main__":
    make_icon()
    make_splash()
