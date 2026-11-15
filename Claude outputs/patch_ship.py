"""Adds the alien ship to the Moon base. Exact search-and-replace; keeps CRLF line endings.
Usage: python patch_ship.py <project folder>"""
import sys

ROOT = sys.argv[1]


def edit(name, pairs):
    path = f"{ROOT}/{name}"
    b = open(path, "rb").read()
    assert b"\r\n" in b, f"{name}: expected CRLF line endings"
    for old, new in pairs:
        old = old.replace(b"\n", b"\r\n")
        new = new.replace(b"\n", b"\r\n")
        assert b.count(old) == 1, (name, old[:70], b.count(old))
        b = b.replace(old, new)
    open(path, "wb").write(b)


edit("index.html", [(
    b'        <div class="base-part" data-part="rover"><img class="base-img" src="images/base-rover.svg" alt="" draggable="false"></div>\n',
    b'        <div class="base-part" data-part="rover"><img class="base-img" src="images/base-rover.svg" alt="" draggable="false"></div>\n'
    b'        <!-- The alien quest: their saucer lands right of the outpost, with an alien peeking out of the porthole. -->\n'
    b'        <div class="base-part" data-part="ship"><img class="base-img" src="images/base-ship.svg" alt="" draggable="false"></div>\n',
)])

edit("script.js", [(
    b'    upgrademsq2_004_security: "security"        // colony upgrade, security branch done: laser turrets and the magnetic shield\n',
    b'    upgrademsq2_004_security: "security",       // colony upgrade, security branch done: laser turrets and the magnetic shield\n'
    b'    aliensidequest_001_dip: "ship"              // the alien delegation arrives: their saucer comes down from space and lands\n',
)])

edit("styles.css", [
    (b'            .base-part[data-part="rover"] { left: 22.4%; top: 29.8%; width: 6.5%; --tilt: -34.8deg; }\n',
     b'            .base-part[data-part="rover"] { left: 22.4%; top: 29.8%; width: 6.5%; --tilt: -34.8deg; }\n'
     b'            /* Alien saucer, photo x 1705: far enough right of the outpost to clear the Bio-Dome and the shield bubble. */\n'
     b'            .base-part[data-part="ship"] { left: 88.80%; top: 46.29%; width: 7.5%; --tilt: 53.3deg; }\n'),
    (b'            .base-part[data-part="rover"].is-built > .base-img { animation: base-drive 1500ms cubic-bezier(.25, .8, .35, 1) forwards; }\n',
     b'            .base-part[data-part="rover"].is-built > .base-img { animation: base-drive 1500ms cubic-bezier(.25, .8, .35, 1) forwards; }\n'
     b'            /* The saucer drops in from space along its own "up", hovers, then sets down; the dust puffs on touchdown. */\n'
     b'            .base-part[data-part="ship"].is-built > .base-img { animation: base-land 2600ms cubic-bezier(.3, .7, .4, 1) forwards; }\n'
     b'            .base-part[data-part="ship"].is-built::after { animation-delay: 2050ms; }\n'),
    (b'            @keyframes base-dust {',
     b'            @keyframes base-land { 0% { opacity: 0; transform: translateY(-900%) scale(0.45); } 12% { opacity: 1; } 62% { transform: translateY(-30%) scale(1); } 74% { transform: translateY(-24%); } 84% { transform: translateY(0) scale(1.04, 0.95); } 92% { transform: translateY(-3%) scale(1); } 100% { opacity: 1; transform: none; } }\n'
     b'            @keyframes base-dust {'),
])
print("patched", ROOT)
