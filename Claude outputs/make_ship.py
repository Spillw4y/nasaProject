"""Draws images/base-ship.svg: the alien saucer that lands on the Moon for the alien quest.

Same style as make_art.py: low-poly flat facets, lit from the upper left, no outlines.
220 x 170 like the rover; the ground line is y = 155 (91% down, where .base-part anchors).
A little alien peeks out of the porthole: it bobs up and down and blinks (CSS inside the SVG).
Usage: python make_ship.py images
"""
import math
import sys

W, H = 220, 170
CX = 110          # centre line of the ship
GROUND = 155

# palette (handoff "Art style") plus alien greens
WHITE, LIGHT, MID = "#f3f3f1", "#d8d8d5", "#b2b2af"
DARK, DARK2, GREY = "#2d2f34", "#44474d", "#86888d"
CYAN = "#5fd0ff"
SKIN, SKIN_SHADE, SKIN_LIGHT = "#7fd35c", "#5fb243", "#a4e57f"

out = []


def poly(points, fill, extra=""):
    pts = " ".join(f"{x:.1f},{y:.1f}" for x, y in points)
    out.append(f'<polygon points="{pts}" fill="{fill}"{extra}/>')


def shade(base_hex, k):
    """Lighten (k > 0) or darken (k < 0) a hex colour."""
    r, g, b = (int(base_hex[i:i + 2], 16) for i in (1, 3, 5))
    if k >= 0:
        r, g, b = (round(c + (255 - c) * k) for c in (r, g, b))
    else:
        r, g, b = (round(c * (1 + k)) for c in (r, g, b))
    return f"#{r:02x}{g:02x}{b:02x}"


def ring(cx, cy, rx, ry, a0, a1, n):
    """Points along an ellipse from angle a0 to a1 (degrees, 0 = right, 180 = left, 90 = down in SVG)."""
    return [(cx + rx * math.cos(math.radians(a0 + (a1 - a0) * i / n)),
             cy + ry * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]


def facet_light(angle_deg):
    """Light from the upper left: facets facing left are bright, facing right are dark. -1..1"""
    return -math.cos(math.radians(angle_deg))


out.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">')
out.append("""<style>
.peek { animation: peek 4.2s ease-in-out infinite; }
.lid { transform-box: fill-box; transform-origin: 50% 50%; animation: blink 4.2s infinite; }
.lamp { animation: lamp 1.6s infinite; }
.lamp.b { animation-delay: .4s; } .lamp.c { animation-delay: .8s; } .lamp.d { animation-delay: 1.2s; }
.beacon { animation: lamp 1.1s infinite; }
@keyframes peek { 0%, 14% { transform: translateY(12px); } 30%, 80% { transform: translateY(0); } 94%, 100% { transform: translateY(12px); } }
@keyframes grip { 0%, 20% { opacity: 0; transform: translateY(3px); } 30%, 80% { opacity: 1; transform: translateY(0); } 88%, 100% { opacity: 0; transform: translateY(3px); } }
.grip { animation: grip 4.2s ease-in-out infinite; }
@keyframes blink { 0%, 52%, 58%, 100% { transform: scaleY(0); } 55% { transform: scaleY(1); } }
@keyframes lamp { 0%, 100% { opacity: 1; } 50% { opacity: .25; } }
@media (prefers-reduced-motion: reduce) { .peek, .grip, .lid, .lamp, .beacon { animation: none; } }
</style>""")
out.append('<defs><clipPath id="porthole"><circle cx="110" cy="62" r="17"/></clipPath></defs>')

# shadow on the ground
out.append(f'<ellipse cx="{CX}" cy="{GROUND + 5}" rx="88" ry="5" fill="#000" opacity="0.35"/>')

# ---- landing legs (behind the hull): two outer struts and a short centre one
for side in (-1, 1):
    hip = (CX + side * 46, 104)
    knee = (CX + side * 70, 132)
    foot = (CX + side * 78, GROUND - 2)
    poly([(hip[0] - 3, hip[1]), (hip[0] + 3, hip[1]), (knee[0] + 3, knee[1]), (knee[0] - 3, knee[1])],
         GREY if side < 0 else DARK2)
    poly([(knee[0] - 2.5, knee[1]), (knee[0] + 2.5, knee[1]), (foot[0] + 2.5, foot[1]), (foot[0] - 2.5, foot[1])],
         MID if side < 0 else GREY)
    # foot pad: flat low-poly disc
    fx, fy = foot
    poly([(fx - 11, fy + 3), (fx - 7, fy - 1), (fx + 7, fy - 1), (fx + 11, fy + 3), (fx + 7, fy + 5), (fx - 7, fy + 5)], DARK2)
    poly([(fx - 11, fy + 3), (fx - 7, fy - 1), (fx, fy - 1), (fx, fy + 5), (fx - 7, fy + 5)], GREY)
poly([(CX - 3, 112), (CX + 3, 112), (CX + 3, GROUND - 2), (CX - 3, GROUND - 2)], DARK2)
poly([(CX - 3, 112), (CX, 112), (CX, GROUND - 2), (CX - 3, GROUND - 2)], GREY)
poly([(CX - 9, GROUND + 2), (CX - 6, GROUND - 3), (CX + 6, GROUND - 3), (CX + 9, GROUND + 2), (CX + 6, GROUND + 4), (CX - 6, GROUND + 4)], DARK2)

# ---- underside: a dark bowl with a glowing engine ring
under = ring(CX, 96, 98, 10, 0, 180, 12)            # rim, going under (y grows) from right to left
bottom = ring(CX, 110, 44, 7, 180, 0, 8)
poly(under + bottom, DARK2)
poly(ring(CX, 96, 98, 10, 90, 180, 6) + ring(CX, 110, 44, 7, 180, 90, 4), "#383a3f")
# engine ring + its glow
out.append(f'<ellipse cx="{CX}" cy="111" rx="30" ry="5" fill="{CYAN}" opacity="0.35"/>')
poly(ring(CX, 111, 22, 3.6, 0, 360, 10), CYAN)
poly(ring(CX, 111, 13, 2.2, 0, 360, 8), "#c9f1ff")

# ---- saucer rim: upper faceted band between the outer rim and the shoulder
N = 14
outer = ring(CX, 96, 100, 11, 180, 360, N)          # back half of the rim, left to right (above the centre)
outer_f = ring(CX, 96, 100, 11, 180, 0, N)           # front half, left to right (below the centre)
shoulder_f = ring(CX, 84, 58, 9, 180, 0, N)
# back (top) face of the saucer, seen from slightly above: one flat light shape
poly(outer + ring(CX, 84, 58, 9, 0, -180, N), LIGHT)
poly(ring(CX, 96, 100, 11, 180, 270, N // 2) + ring(CX, 84, 58, 9, 270, 180, N // 2), WHITE)
poly(ring(CX, 84, 58, 9, 0, 360, 2 * N), LIGHT)
# front facets: shade by where each faces
for i in range(N):
    a = 180 - 180 * (i + 0.5) / N
    k = facet_light(a)
    col = WHITE if k > 0.55 else LIGHT if k > 0.0 else MID if k > -0.6 else GREY
    poly([outer_f[i], outer_f[i + 1], shoulder_f[i + 1], shoulder_f[i]], col)
# dark trim band round the rim with lamps
rim_top = ring(CX, 96, 100, 11, 180, 0, N)
rim_bot = ring(CX, 99, 99, 11, 180, 0, N)
for i in range(N):
    a = 180 - 180 * (i + 0.5) / N
    poly([rim_top[i], rim_top[i + 1], rim_bot[i + 1], rim_bot[i]], DARK2 if facet_light(a) > -0.2 else DARK)
for j, (t, cls) in enumerate(((0.16, "a"), (0.33, "b"), (0.5, "c"), (0.67, "d"), (0.84, "a"))):
    ang = math.radians(180 - 180 * t)
    lx, ly = CX + 99.5 * math.cos(ang), 97.5 + 11 * math.sin(ang)
    out.append(f'<circle class="lamp {cls}" cx="{lx:.1f}" cy="{ly:.1f}" r="2.3" fill="{CYAN}"/>')

# ---- upper hull (cabin): faceted dome
CAB_Y, CAB_R, CAB_RY = 84, 50, 44
M = 10
top_pts = ring(CX, CAB_Y, CAB_R, CAB_RY, 180, 360, M)
for i in range(M):
    a = 180 + 180 * (i + 0.5) / M          # 180 = left, 270 = top, 360 = right
    k = facet_light(a) * 0.8 + 0.15 * -math.sin(math.radians(a))
    col = WHITE if k > 0.5 else LIGHT if k > 0.05 else MID if k > -0.45 else GREY
    poly([(CX, CAB_Y + 2), top_pts[i], top_pts[i + 1]], col)
# cabin base band (front of the dome where it meets the saucer)
poly(ring(CX, CAB_Y, CAB_R, 6, 180, 0, M) + ring(CX, CAB_Y, CAB_R, 1, 0, 180, M), MID)
poly(ring(CX, CAB_Y, CAB_R, 6, 180, 90, M // 2) + ring(CX, CAB_Y, CAB_R, 1, 90, 180, M // 2), LIGHT)

# beacon on top
poly([(CX - 2, CAB_Y - CAB_RY + 1), (CX + 2, CAB_Y - CAB_RY + 1), (CX + 1.2, CAB_Y - CAB_RY - 10), (CX - 1.2, CAB_Y - CAB_RY - 10)], GREY)
out.append(f'<circle class="beacon" cx="{CX}" cy="{CAB_Y - CAB_RY - 12}" r="3.4" fill="{CYAN}"/>')
out.append(f'<circle cx="{CX - 1}" cy="{CAB_Y - CAB_RY - 13}" r="1.1" fill="#e9fbff"/>')

# ---- porthole with the alien peeking out
PX, PY, PR = 110, 62, 17
out.append(f'<circle cx="{PX}" cy="{PY}" r="{PR}" fill="#1c2a3a"/>')
out.append(f'<circle cx="{PX}" cy="{PY}" r="{PR}" fill="#2e5a7a" opacity="0.55"/>')   # cabin glow behind the alien
out.append('<g clip-path="url(#porthole)"><g class="peek">')
# antennae
for s in (-1, 1):
    out.append(f'<line x1="{PX + s * 4}" y1="{PY + 1}" x2="{PX + s * 9}" y2="{PY - 11}" stroke="{SKIN_SHADE}" stroke-width="1.6" stroke-linecap="round"/>')
    out.append(f'<circle cx="{PX + s * 9}" cy="{PY - 11.5}" r="2.4" fill="{SKIN_LIGHT}"/>')
# head: a faceted, slightly pear-shaped green head; only its top half clears the sill
head = [(PX - 14, PY + 6), (PX - 12, PY - 1), (PX - 6, PY - 6), (PX, PY - 7), (PX + 6, PY - 6), (PX + 12, PY - 1),
        (PX + 14, PY + 6), (PX + 11, PY + 16), (PX, PY + 21), (PX - 11, PY + 16)]
poly(head, SKIN)
poly([(PX - 14, PY + 6), (PX - 12, PY - 1), (PX - 6, PY - 6), (PX, PY - 7), (PX, PY + 21), (PX - 11, PY + 16)], SKIN_LIGHT)
poly([(PX + 14, PY + 6), (PX + 12, PY - 1), (PX + 6, PY - 6), (PX + 4, PY + 3), (PX + 11, PY + 16)], SKIN_SHADE)
# big almond eyes with a shine, and lids that blink
for s in (-1, 1):
    ex = PX + s * 6
    rot = -18 * s
    out.append(f'<ellipse cx="{ex}" cy="{PY + 4.5}" rx="5" ry="3.4" fill="#15171b" transform="rotate({rot} {ex} {PY + 4.5})"/>')
    out.append(f'<circle cx="{ex - 1.6}" cy="{PY + 3.3}" r="1.2" fill="#ffffff"/>')
    out.append(f'<g transform="rotate({rot} {ex} {PY + 4.5})"><ellipse class="lid" cx="{ex}" cy="{PY + 4.5}" rx="5.5" ry="3.9" fill="{SKIN}"/></g>')
out.append('</g></g>')
# glass glare over the porthole
poly([(PX - 11, PY - 7), (PX - 6, PY - 12), (PX - 3, PY - 11), (PX - 9, PY - 4)], "#ffffff", ' opacity="0.35"')
# porthole frame: faceted ring, light on the upper left
F = 12
outer_r = ring(PX, PY, PR + 4, PR + 4, 0, 360, F)
inner_r = ring(PX, PY, PR, PR, 0, 360, F)
for i in range(F):
    a = 360 * (i + 0.5) / F
    k = -math.cos(math.radians(a)) * 0.6 - math.sin(math.radians(a)) * 0.6
    col = WHITE if k > 0.35 else LIGHT if k > -0.1 else MID if k > -0.5 else GREY
    poly([outer_r[i], outer_r[i + 1], inner_r[i + 1], inner_r[i]], col)
# little green fingers gripping the bottom of the frame, bobbing with the head
out.append('<g class="grip">')
for fx in (PX - 10, PX - 6.2, PX + 6.2, PX + 10):
    out.append(f'<ellipse cx="{fx}" cy="{PY + PR + 0.5}" rx="2.1" ry="2.8" fill="{SKIN}"/>')
    out.append(f'<ellipse cx="{fx - 0.5}" cy="{PY + PR - 0.3}" rx="0.9" ry="1.2" fill="{SKIN_LIGHT}"/>')
out.append('</g>')

out.append("</svg>")

if __name__ == "__main__":
    folder = sys.argv[1] if len(sys.argv) > 1 else "."
    with open(f"{folder}/base-ship.svg", "w", newline="\n") as f:
        f.write("\n".join(out) + "\n")
    print("wrote", f"{folder}/base-ship.svg")
