# Third-party notices

Lasty includes the following software in its installers.

## Tectonic 0.17.0

The Tectonic LaTeX engine is shipped unmodified as a separate program next to the Lasty executable.

- Project: https://tectonic-typesetting.github.io/
- Source code: https://github.com/tectonic-typesetting/tectonic/tree/tectonic%400.17.0
- Copyright the Tectonic Project contributors

Tectonic is derived from TeX, XeTeX and other parts of TeX Live and links libraries such as HarfBuzz, ICU, FreeType, Graphite2, libpng and zlib. These components are available under their own open-source licenses, listed in the Tectonic source code.

LaTeX packages that Tectonic downloads at runtime are not part of Lasty and keep their own licenses.

```
(Tectonic is licensed under the MIT License. Elements of the system from which
it is derived are licensed under an extremely wide variety of open-source
licenses.)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the “Software”), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Spelling dictionaries

The Hunspell dictionaries for spell checking are shipped unmodified as separate data files in the `dictionaries` folder, each next to its license file.

- English (`en.aff`, `en.dic`): from the `dictionary-en` package (https://github.com/wooorm/dictionaries), derived from SCOWL. Licensed under MIT and BSD terms, see `en.LICENSE`.
- German (`de.aff`, `de.dic`): from the `dictionary-de` package, derived from igerman98 by Björn Jacke. Licensed under GPL-2.0 or GPL-3.0, see `de.LICENSE`. The source is available at https://www.j3e.de/ispell/igerman98/.

## PDF.js

The PDF preview uses PDF.js (https://mozilla.github.io/pdf.js/), Copyright Mozilla Foundation, licensed under the Apache License 2.0.

## Other components

Lasty's frontend is built with open-source libraries including React, Monaco Editor, Tailwind CSS and the Geist font, and its backend with Tauri and the Rust crates listed in `src-tauri/Cargo.lock`. Their licenses are available in their respective packages.
