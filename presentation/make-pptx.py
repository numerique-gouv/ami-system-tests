#!/usr/bin/env python3
"""
Assemble les PNG d'un dossier en un fichier PPTX (1 image par slide, 16:9).
Usage : python3 make-pptx.py <dossier-png> <output.pptx>
"""
import sys
from pathlib import Path
from pptx import Presentation
from pptx.util import Emu


def main():
    if len(sys.argv) != 3:
        print("Usage: make-pptx.py <dossier-png> <output.pptx>")
        sys.exit(1)

    png_dir = Path(sys.argv[1])
    output = Path(sys.argv[2])

    pngs = sorted(png_dir.glob("*.png"))
    if not pngs:
        print(f"Aucun PNG trouvé dans {png_dir}")
        sys.exit(1)

    # 16:9 en EMU (914400 EMU = 1 inch, 10 x 5.625 inches)
    width  = Emu(9144000)
    height = Emu(5143500)

    prs = Presentation()
    prs.slide_width  = width
    prs.slide_height = height

    blank_layout = prs.slide_layouts[6]  # layout "Blank"

    for png in pngs:
        slide = prs.slides.add_slide(blank_layout)
        slide.shapes.add_picture(str(png), Emu(0), Emu(0), width, height)

    output.parent.mkdir(parents=True, exist_ok=True)
    prs.save(str(output))
    print(f"✅ {len(pngs)} slides → {output}")


if __name__ == "__main__":
    main()
