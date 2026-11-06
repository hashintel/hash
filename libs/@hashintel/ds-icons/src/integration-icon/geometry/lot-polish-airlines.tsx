/* Adapted from Soaring Symbols. Bounds and theme colors adjusted; app tiles composed. Brand names and artwork remain trademarks of their respective owners.

MIT License

Copyright (c) 2024 Anh Thang

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
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
SOFTWARE. */
export const markLight = ({ id: _id }: { id: string }) => (
  <g fill="#252668">
    <path d="M12 0C5.38 0 0 5.38 0 12s5.38 12 12 12 12-5.38 12-12S18.62 0 12 0Zm0 .8c1.223 0 2.398.2 3.5.563l-3.121 6.278-3 6-8.152 1.418A11.178 11.178 0 0 1 .8 12C.8 5.82 5.82.8 12 .8Zm4.418.907C20.404 3.423 23.199 7.389 23.199 12c0 6.18-5.019 11.2-11.199 11.2-5.061 0-9.341-3.368-10.727-7.981h7.849l7.077 6.96c.4-.42.64-.977.64-1.577 0-.7-.319-1.342-.859-1.762l-4.718-3.621h11.437c.02-.08.062-.178.082-.278a1.78 1.78 0 0 1-1.402-.863h-2.7l.2.281h.922l.46.582H15.18c0-.08-.02-.18-.02-.28-.16-1-1.12-1.7-2.12-1.54l-1.821.277 5.402-9c.2-.36.32-.779.32-1.199 0-.554-.19-1.078-.523-1.492z" />
  </g>
);
export const markDark = ({ id: _id }: { id: string }) => (
  <g fill="#7172CC">
    <path d="M12 0C5.38 0 0 5.38 0 12s5.38 12 12 12 12-5.38 12-12S18.62 0 12 0Zm0 .8c1.223 0 2.398.2 3.5.563l-3.121 6.278-3 6-8.152 1.418A11.178 11.178 0 0 1 .8 12C.8 5.82 5.82.8 12 .8Zm4.418.907C20.404 3.423 23.199 7.389 23.199 12c0 6.18-5.019 11.2-11.199 11.2-5.061 0-9.341-3.368-10.727-7.981h7.849l7.077 6.96c.4-.42.64-.977.64-1.577 0-.7-.319-1.342-.859-1.762l-4.718-3.621h11.437c.02-.08.062-.178.082-.278a1.78 1.78 0 0 1-1.402-.863h-2.7l.2.281h.922l.46.582H15.18c0-.08-.02-.18-.02-.28-.16-1-1.12-1.7-2.12-1.54l-1.821.277 5.402-9c.2-.36.32-.779.32-1.199 0-.554-.19-1.078-.523-1.492z" />
  </g>
);
export const logoLight = ({ id: _id }: { id: string }) => (
  <svg viewBox="0 21.10174 64 21.79651" fill="#252668">
    <path d="M6.117 21.164 0 42.832l29.563.004h.195A10.837 10.837 0 0 0 40.594 32a7.725 7.725 0 0 0-1.102-3.988h7.393l-4.2 14.82h7.88l4.2-14.82h7.32L64 21.164H26.898A10.837 10.837 0 0 0 16.061 32a7.724 7.724 0 0 0 1.101 3.988H9.793l4.203-14.824H6.117zm22.211 6.334a4.502 4.502 0 0 1 1.39.22 4.502 4.502 0 0 1 .07.034l-2.503 5.02v.003l-3.256.5A4.5 4.5 0 0 1 23.826 32a4.502 4.502 0 0 1 4.502-4.502zm1.598.322a4.502 4.502 0 0 1 2.678 5.446.705.705 0 0 1-.524-.332h-1.078l.082.11h.371l.184.231h-2.034a.739.739 0 0 0-.736-.738.78.78 0 0 0-.115.008l-.73.113 2.158-3.596a.93.93 0 0 0 .13-.476.944.944 0 0 0-.386-.766zm-1.883 5.569h4.521a4.502 4.502 0 0 1-2.486 2.71.894.894 0 0 0 .195-.558.88.88 0 0 0-.341-.701l-1.889-1.451zm-3.996.002h3.133l2.806 2.752a4.502 4.502 0 0 1-1.658.359 4.5 4.5 0 0 1-4.281-3.111z" />
  </svg>
);
export const logoDark = ({ id: _id }: { id: string }) => (
  <svg viewBox="0 21.10174 64 21.79651" fill="#7172CC">
    <path d="M6.117 21.164 0 42.832l29.563.004h.195A10.837 10.837 0 0 0 40.594 32a7.725 7.725 0 0 0-1.102-3.988h7.393l-4.2 14.82h7.88l4.2-14.82h7.32L64 21.164H26.898A10.837 10.837 0 0 0 16.061 32a7.724 7.724 0 0 0 1.101 3.988H9.793l4.203-14.824H6.117zm22.211 6.334a4.502 4.502 0 0 1 1.39.22 4.502 4.502 0 0 1 .07.034l-2.503 5.02v.003l-3.256.5A4.5 4.5 0 0 1 23.826 32a4.502 4.502 0 0 1 4.502-4.502zm1.598.322a4.502 4.502 0 0 1 2.678 5.446.705.705 0 0 1-.524-.332h-1.078l.082.11h.371l.184.231h-2.034a.739.739 0 0 0-.736-.738.78.78 0 0 0-.115.008l-.73.113 2.158-3.596a.93.93 0 0 0 .13-.476.944.944 0 0 0-.386-.766zm-1.883 5.569h4.521a4.502 4.502 0 0 1-2.486 2.71.894.894 0 0 0 .195-.558.88.88 0 0 0-.341-.701l-1.889-1.451zm-3.996.002h3.133l2.806 2.752a4.502 4.502 0 0 1-1.658.359 4.5 4.5 0 0 1-4.281-3.111z" />
  </svg>
);
