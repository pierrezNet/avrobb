"""
Génère le logo, la bannière et les icônes d'AvroBB : crochets BBCode autour d'un RJ85 (BAe 146)
vu de dessus, texte « AvroBB » converti en tracés (aucune police requise chez le visiteur).

Hors de la chaîne Node : à relancer seulement pour changer l'identité visuelle.
  python3 -m venv /tmp/brand && /tmp/brand/bin/pip install fonttools pillow
  /tmp/brand/bin/python scripts/brand.py /tmp/brand-out
puis copier logo.png et banner.jpg dans public/img/ (avrobb-logo.png, avrobb-banner.jpg),
avrobb-logo.svg dans public/img/, et les icônes dans public/icons/.
Pré-requis : rsvg-convert, Noto Sans Bold et DejaVu Sans Mono ; image source de la bannière :
https://www.pierrez.net/images/bg.jpg (BANNER_SOURCE).
"""

import math
import os
import subprocess
import sys
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from PIL import Image, ImageFilter, ImageEnhance

OUT = Path(sys.argv[1])
SRC_BG = Path(os.environ.get('BANNER_SOURCE', '/media/emmanuel-pierrez/OpenData/html/pierreznet/images/bg.jpg'))
OUT.mkdir(parents=True, exist_ok=True)

WHITE = '#fff7f0'
GOLD = '#f4c25b'
DARK = '#5b1313'


def text_path(text: str, font_file: str, size: float, x: float, baseline: float) -> tuple[str, float]:
	"""Contours d'un texte en chemin SVG ; renvoie le chemin et l'abscisse de fin."""
	font = TTFont(font_file)
	glyph_set = font.getGlyphSet()
	cmap = font.getBestCmap()
	scale = size / font['head'].unitsPerEm
	pen = SVGPathPen(glyph_set)
	cursor = x
	for char in text:
		name = cmap[ord(char)]
		# Repère SVG : y vers le bas, d'où l'échelle verticale négative.
		glyph_set[name].draw(TransformPen(pen, (scale, 0, 0, -scale, cursor, baseline)))
		cursor += glyph_set[name].width * scale
	return pen.getCommands(), cursor


def rj85_planform() -> list[str]:
	"""Silhouette d'un RJ85 (BAe 146) vu de dessus, nez vers le haut, 1 unité = 10 cm, origine au centre."""
	def wing_le(x: float) -> float:
		return 115 + abs(x) * 0.268  # flèche de 15°

	parts = []
	# Fuselage : nez arrondi, cône de queue effilé.
	parts.append('M0,0 C14,0 18,16 18,34 L18,250 C18,268 10,282 6,290 L-6,290 C-10,282 -18,268 -18,250 L-18,34 C-18,16 -14,0 0,0 Z')
	# Aile haute : emplanture 52, saumon 18, envergure 26,3 m.
	parts.append('M17,115 L131,150 L131,168 L17,167 Z M-17,115 L-131,150 L-131,168 L-17,167 Z')
	# Quatre réacteurs en avant du bord d'attaque.
	for x in (42, 76, -42, -76):
		front = wing_le(x) - 26
		parts.append(f'M{x - 6.5},{front + 6} C{x - 6.5},{front} {x + 6.5},{front} {x + 6.5},{front + 6} L{x + 6},{front + 40} L{x - 6},{front + 40} Z')
	# Empennage horizontal (en T, plus en flèche).
	parts.append('M6,252 L56,276 L56,288 L6,280 Z M-6,252 L-56,276 L-56,288 L-6,280 Z')
	return parts


def plane(cx: float, cy: float, scale: float, heading: float, fill: str, opacity: float = 1.0) -> str:
	"""Avion centré en (cx, cy) ; heading en degrés, 0 = nez vers le haut, sens horaire."""
	# Une pièce par chemin : les recouvrements (réacteurs sur l'aile) ne s'annulent pas au remplissage.
	pieces = ''.join(f'<path d="{d}"/>' for d in rj85_planform())
	return (
		f'<g transform="translate({cx} {cy}) rotate({heading}) scale({scale}) translate(0 -145)" '
		f'fill="{fill}" opacity="{opacity}">{pieces}</g>'
	)


def brackets(x: float, y: float, w: float, h: float, stroke: float, arm: float, fill: str) -> str:
	"""Crochets BBCode [ ] aux angles droits."""
	left = f'M{x},{y} h{arm} v{stroke} h{-(arm - stroke)} v{h - 2 * stroke} h{arm - stroke} v{stroke} h{-arm} Z'
	rx = x + w
	right = f'M{rx},{y} h{-arm} v{stroke} h{arm - stroke} v{h - 2 * stroke} h{-(arm - stroke)} v{stroke} h{arm} Z'
	return f'<path fill="{fill}" d="{left} {right}"/>'


def icon(x: float, y: float, size: float, with_background: bool) -> str:
	"""Emblème carré : [ RJ85 ] ; l'avion monte vers la droite."""
	s = size / 308
	parts = []
	if with_background:
		parts.append(f'<rect x="{x}" y="{y}" width="{size}" height="{size}" rx="{56 * s}" fill="#7a1d1d"/>')
		inset = 34 * s
	else:
		inset = 14 * s
	parts.append(brackets(x + inset, y + inset, size - 2 * inset, size - 2 * inset, 30 * s, 74 * s, GOLD))
	parts.append(plane(x + size / 2, y + size / 2, 0.62 * s * (308 - 2 * inset / s) / 308 * 1.12, 65, WHITE))
	return ''.join(parts)


def svg(width: float, height: float, body: str, title: str = 'AvroBB') -> str:
	return (
		f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}" role="img">'
		f'<title>{title}</title>{body}</svg>\n'
	)


def render(svg_file: Path, png_file: Path, width: int, height: int) -> None:
	subprocess.run(['rsvg-convert', '-w', str(width), '-h', str(height), '-o', str(png_file), str(svg_file)], check=True)


# --- Logo : emblème puis « AvroBB » (Noto Sans Bold), 1204 × 308 (4 × 301 × 77) ---
bold = '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf'
avro, end = text_path('Avro', bold, 212, 350, 230)
bb, end = text_path('BB', bold, 212, end + 4, 230)
logo_w = math.ceil(end + 16)
logo_body = icon(0, 0, 308, False) + f'<path fill="{WHITE}" d="{avro}"/><path fill="{GOLD}" d="{bb}"/>'
(OUT / 'avrobb-logo.svg').write_text(svg(logo_w, 308, logo_body))
render(OUT / 'avrobb-logo.svg', OUT / 'logo-raw.png', logo_w, 308)

# Ombre portée douce : le logo reste lisible sur la texture de la bannière. Toile finale de
# 1204 × 308 (4 × 301 × 77, la taille affichée), logo calé à gauche.
raw = Image.open(OUT / 'logo-raw.png').convert('RGBA')
LW, LH, pad = 1204, 308, 12
scale = (LH - 2 * pad - 8) / raw.height
raw = raw.resize((round(raw.width * scale), round(raw.height * scale)), Image.LANCZOS)
canvas = Image.new('RGBA', (LW, LH), (0, 0, 0, 0))
shadow = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
alpha = Image.new('L', canvas.size, 0)
alpha.paste(raw.getchannel('A'), (pad + 3, pad + 5))
shadow.putalpha(alpha.filter(ImageFilter.GaussianBlur(7)).point(lambda a: int(a * 0.55)))
canvas.alpha_composite(shadow)
canvas.alpha_composite(raw, (pad, pad))
canvas.save(OUT / 'logo.png', optimize=True)

# --- Icônes : emblème sur fond rouge arrondi ---
(OUT / 'favicon.svg').write_text(svg(308, 308, icon(0, 0, 308, True)))
for name, px in (('favicon-32.png', 32), ('icon-192.png', 192), ('icon-512.png', 512), ('apple-touch-icon.png', 180)):
	render(OUT / 'favicon.svg', OUT / name, px, px)

# --- Bannière 2560 × 320 : bande de bg.jpg qui contient la traînée claire ---
BW, BH = 2560, 320
bg = Image.open(SRC_BG).convert('RGB').crop((0, 330, 1200, 480)).resize((BW, BH), Image.LANCZOS)
bg = ImageEnhance.Contrast(bg).enhance(1.08)

# La traînée monte d'environ 25° : l'avion la suit, à droite (la gauche reste au logo).
tags = [
	('[quote]', 1240, 70, 34), ('[/url]', 1560, 268, 30), ('[b]', 1830, 96, 38), ('[img]', 2380, 286, 30),
	('[code]', 1990, 250, 28), ('[/quote]', 2260, 58, 30), ('[url]', 1420, 196, 26),
]
tag_svg = ''.join(
	f'<text x="{x}" y="{y}" font-family="DejaVu Sans Mono" font-weight="bold" font-size="{size}" fill="{WHITE}" fill-opacity="0.09">{t}</text>'
	for t, x, y, size in tags
)
heading = 90 - 25
px, py = 2150, 150
dx, dy = math.cos(math.radians(25)), -math.sin(math.radians(25))
trail = ''.join(
	f'<line x1="{px - dx * 120 + ox}" y1="{py - dy * 120 + oy}" x2="{px - dx * 900 + ox}" y2="{py - dy * 900 + oy}" '
	f'stroke="{WHITE}" stroke-opacity="0.13" stroke-width="3" stroke-dasharray="26 18" stroke-linecap="round"/>'
	for ox, oy in ((-14, -30), (14, 30))
)
overlay = svg(
	BW,
	BH,
	'<defs><linearGradient id="v" x1="0" x2="1"><stop offset="0" stop-color="#1a0505" stop-opacity="0.45"/>'
	'<stop offset="0.45" stop-color="#1a0505" stop-opacity="0.1"/><stop offset="1" stop-color="#1a0505" stop-opacity="0"/></linearGradient>'
	'<linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0.55" stop-color="#1a0505" stop-opacity="0"/>'
	'<stop offset="1" stop-color="#1a0505" stop-opacity="0.35"/></linearGradient></defs>'
	f'<rect width="{BW}" height="{BH}" fill="url(#v)"/><rect width="{BW}" height="{BH}" fill="url(#b)"/>'
	+ tag_svg
	+ trail
	+ plane(px, py, 0.95, heading, '#ffe2d4', 0.26),
)
(OUT / 'banner-overlay.svg').write_text(overlay)
render(OUT / 'banner-overlay.svg', OUT / 'banner-overlay.png', BW, BH)
banner = bg.convert('RGBA')
banner.alpha_composite(Image.open(OUT / 'banner-overlay.png').convert('RGBA'))
banner.convert('RGB').save(OUT / 'banner.jpg', quality=84, optimize=True, progressive=True)

# Aperçu : bannière réduite à la hauteur affichée (124 px sur 1280) avec le logo posé en bas à gauche.
preview = banner.convert('RGB').resize((1280, 160), Image.LANCZOS).crop((0, 18, 1280, 142)).convert('RGBA')
small = canvas.resize((round(canvas.width * 77 / 308), round(canvas.height * 77 / 308)), Image.LANCZOS)
preview.alpha_composite(small, (4, 124 - small.height + 2))
preview.convert('RGB').save(OUT / 'preview.png')
print('ok', logo_w, canvas.size)
