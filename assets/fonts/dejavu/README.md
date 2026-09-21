# PDF fonts: DejaVu Sans 2.37

Unmodified `DejaVuSans.ttf` and `DejaVuSans-Bold.ttf` from the official release:
https://github.com/dejavu-fonts/dejavu-fonts/releases/tag/version_2_37

Archive: `dejavu-fonts-ttf-2.37.zip`. The complete upstream LICENSE is included.
License: Bitstream Vera Font License, DejaVu modifications in the public domain,
and the upstream Arev/other glyph notices as reproduced in LICENSE.

SHA-256:

- DejaVuSans.ttf: `7da195a74c55bef988d0d48f9508bd5d849425c1770dba5d7bfc6ce9ed848954`
- DejaVuSans-Bold.ttf: `e6476c1b80502924294eed40894c5b18e06c181444ca953e5334262df9c27724`

These are repository assets, not system fonts. Next.js outputFileTracingIncludes
includes both files and LICENSE in the export route's server bundle. PDFKit
embeds a subset of each used font. No runtime network download is performed.

Coverage includes Latin/Polish, Greek, Cyrillic, Arabic, Hebrew and monochrome
U+1F600 (😀). This is not a claim that one font covers every Unicode script or
emoji sequence. Missing glyphs fail the export rather than silently substituting
question marks or empty boxes. There is no OS font fallback. New script coverage
must be added explicitly with bundled, licensed fonts and rendering tests.
