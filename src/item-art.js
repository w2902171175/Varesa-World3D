// Original, code-drawn convenience-store goods. No external images or fonts.
const CACHE = new Map();
const SIZE = 512;
const INK = '#3c5056';
const PAPER = '#fff2d6';
const DEFAULTS = {
  drink: '#81b8ad', coffee: '#aa795b', snack: '#dfab7c', onigiri: '#71968a',
  bento: '#87a896', oden: '#cf9e6f', icecream: '#b6a3c7', umbrella: '#8eb8bb',
  wrappers: '#aaaeb0', receipt: '#75978c',
};

function validColor(value, fallback) {
  if (typeof value !== 'string' || !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) return fallback;
  const color = value.toLowerCase();
  return color.length === 4 ? '#' + [...color.slice(1)].map((digit) => digit + digit).join('') : color;
}

function tint(color, amount) {
  const target = amount >= 0 ? 255 : 0;
  const weight = Math.abs(amount);
  const channels = [1, 3, 5].map((offset) => {
    const value = parseInt(color.slice(offset, offset + 2), 16);
    return Math.round(value + (target - value) * weight).toString(16).padStart(2, '0');
  });
  return '#' + channels.join('');
}

function gradient(c, x1, y1, x2, y2, colors) {
  const g = c.createLinearGradient(x1, y1, x2, y2);
  colors.forEach((color, index) => g.addColorStop(index / (colors.length - 1), color));
  return g;
}

function shape(c, draw, fill, stroke = INK, width = 5) {
  c.beginPath(); draw(c); c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke && width) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
}

function rounded(c, x, y, w, h, r, fill, stroke = INK, width = 5) {
  shape(c, () => {
    c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
  }, fill, stroke, width);
}

function oval(c, x, y, rx, ry, fill, stroke = INK, width = 5, angle = 0) {
  shape(c, () => c.ellipse(x, y, rx, ry, angle, 0, Math.PI * 2), fill, stroke, width);
}

function stroke(c, draw, color = INK, width = 5) {
  c.beginPath(); draw(c); c.strokeStyle = color; c.lineWidth = width; c.stroke();
}

function shadow(c, x = 256, y = 417, rx = 133, ry = 25) {
  c.save(); c.translate(x, y); c.scale(rx, ry);
  const g = c.createRadialGradient(0, 0, 0.04, 0, 0, 1);
  g.addColorStop(0, 'rgba(28,51,62,.19)'); g.addColorStop(0.65, 'rgba(28,51,62,.07)'); g.addColorStop(1, 'rgba(28,51,62,0)');
  oval(c, 0, 0, 1, 1, g, null, 0); c.restore();
}

function leaf(c, x, y, size, color, angle = -0.4) {
  c.save(); c.translate(x, y); c.rotate(angle);
  shape(c, () => { c.moveTo(-size * 0.6, size * 0.4); c.quadraticCurveTo(-size, -size * 0.7, size * 0.65, -size * 0.6); c.quadraticCurveTo(size * 0.8, size * 0.55, -size * 0.6, size * 0.4); }, color, tint(color, -0.3), 3);
  stroke(c, () => { c.moveTo(-size * 0.5, size * 0.35); c.lineTo(size * 0.45, -size * 0.4); }, tint(color, 0.45), 3);
  c.restore();
}

function can(c, color) {
  shadow(c, 260, 421, 106, 21);
  c.save(); c.translate(256, 260); c.rotate(-0.065); c.translate(-256, -260);
  shape(c, () => { c.moveTo(180, 141); c.bezierCurveTo(183, 111, 329, 111, 332, 141); c.lineTo(332, 378); c.bezierCurveTo(325, 411, 187, 411, 180, 378); }, gradient(c, 180, 0, 332, 0, [tint(color, -0.08), tint(color, 0.35), color, tint(color, -0.22)]));
  shape(c, () => { c.moveTo(181, 217); c.quadraticCurveTo(255, 236, 331, 212); c.lineTo(331, 309); c.quadraticCurveTo(258, 329, 181, 312); }, PAPER, null, 0);
  oval(c, 256, 268, 35, 32, tint(color, 0.25), null, 0);
  leaf(c, 256, 264, 24, tint(color, -0.15));
  stroke(c, () => { c.moveTo(210, 330); c.quadraticCurveTo(256, 343, 307, 330); }, tint(color, -0.25), 6);
  oval(c, 256, 379, 73, 16, '#a9beba', '#587376', 4);
  stroke(c, () => { c.moveTo(191, 377); c.quadraticCurveTo(255, 396, 320, 378); }, '#d8e6db', 4);
  oval(c, 256, 141, 76, 23, '#d6e1d7');
  oval(c, 256, 141, 63, 15, '#a4b9b6', '#829897', 3);
  oval(c, 259, 143, 21, 10, '#e4ede1', '#728b8b', 3, -0.12);
  oval(c, 266, 142, 8, 5, '#718b8c', null, 0);
  stroke(c, () => { c.moveTo(196, 174); c.lineTo(196, 201); }, '#fff6dc', 7);
  c.restore();
}

function bottle(c, color) {
  shadow(c, 259, 424, 108, 22);
  shape(c, () => { c.moveTo(220, 108); c.lineTo(220, 144); c.bezierCurveTo(218, 163, 176, 172, 176, 205); c.lineTo(176, 383); c.quadraticCurveTo(176, 414, 256, 414); c.quadraticCurveTo(336, 414, 336, 383); c.lineTo(336, 205); c.bezierCurveTo(336, 172, 294, 163, 292, 144); c.lineTo(292, 108); }, gradient(c, 176, 0, 336, 0, [tint(color, 0.26), tint(color, 0.65), tint(color, 0.2), tint(color, -0.1)]));
  rounded(c, 184, 215, 144, 178, 25, gradient(c, 184, 0, 328, 0, [tint(color, 0.15), tint(color, 0.42), color]), null, 0);
  shape(c, () => { c.moveTo(177, 235); c.quadraticCurveTo(256, 252, 335, 235); c.lineTo(335, 329); c.quadraticCurveTo(256, 345, 177, 329); }, PAPER, null, 0);
  leaf(c, 254, 281, 36, color, -0.25); leaf(c, 280, 286, 20, tint(color, -0.15), 0.6);
  stroke(c, () => { c.moveTo(211, 316); c.lineTo(300, 316); }, tint(color, -0.1), 5);
  rounded(c, 217, 77, 78, 40, 9, tint(color, -0.15));
  for (let x = 228; x < 294; x += 10) stroke(c, () => { c.moveTo(x, 84); c.lineTo(x, 108); }, tint(color, 0.34), 3);
  oval(c, 256, 78, 37, 8, tint(color, 0.4), INK, 4);
  stroke(c, () => { c.moveTo(201, 202); c.quadraticCurveTo(199, 220, 199, 226); c.moveTo(195, 356); c.lineTo(195, 379); }, '#f5fff0', 8);
  stroke(c, () => { c.moveTo(232, 133); c.lineTo(232, 144); }, '#f5fff0', 6);
}

function coffee(c, color) {
  shadow(c, 256, 419, 119, 23);
  shape(c, () => { c.moveTo(149, 164); c.lineTo(175, 371); c.quadraticCurveTo(256, 416, 337, 371); c.lineTo(363, 164); }, gradient(c, 152, 0, 358, 0, ['#d8c6a8', '#fff0cd', '#f2dfbb', '#c8b391']));
  shape(c, () => { c.moveTo(160, 243); c.quadraticCurveTo(256, 267, 352, 243); c.lineTo(342, 328); c.quadraticCurveTo(256, 353, 170, 328); }, gradient(c, 160, 0, 352, 0, [tint(color, -0.13), tint(color, 0.17), color]), null, 0);
  oval(c, 256, 294, 37, 35, PAPER, tint(color, -0.26), 4);
  oval(c, 256, 294, 15, 24, '#947257', null, 0, 0.45);
  stroke(c, () => { c.moveTo(260, 273); c.bezierCurveTo(239, 289, 273, 294, 251, 315); }, '#f1d7ad', 4);
  rounded(c, 140, 143, 232, 31, 14, '#617271');
  oval(c, 256, 140, 116, 25, '#a4b5aa');
  oval(c, 256, 130, 103, 22, '#d5ddd0', '#718982', 4);
  oval(c, 275, 125, 20, 5, '#61746e', null, 0, -0.05);
  stroke(c, () => { c.moveTo(174, 145); c.quadraticCurveTo(235, 161, 336, 144); }, '#edf3e3', 4);
  stroke(c, () => { c.moveTo(194, 190); c.lineTo(199, 223); }, '#fff9e6', 8);
  for (const x of [230, 277]) stroke(c, () => { c.moveTo(x, 99); c.bezierCurveTo(x - 15, 81, x + 17, 72, x + 5, 53); }, 'rgba(173,192,190,.65)', 6);
}

function snack(c, color) {
  shadow(c, 257, 422, 144, 25);
  c.save(); c.translate(256, 256); c.rotate(0.045); c.translate(-256, -256);
  shape(c, () => { c.moveTo(154, 105); c.lineTo(360, 105); c.lineTo(348, 145); c.bezierCurveTo(381, 237, 356, 329, 364, 397); c.lineTo(147, 397); c.bezierCurveTo(157, 319, 129, 228, 163, 145); }, gradient(c, 145, 0, 365, 0, [tint(color, -0.2), tint(color, 0.35), color, tint(color, -0.14)]));
  rounded(c, 157, 108, 199, 19, 4, tint(color, -0.26), null, 0);
  rounded(c, 150, 378, 211, 16, 4, tint(color, -0.21), null, 0);
  for (let x = 169; x < 350; x += 16) {
    stroke(c, () => { c.moveTo(x, 108); c.lineTo(x, 122); c.moveTo(x - 4, 382); c.lineTo(x - 4, 394); }, tint(color, 0.23), 3);
  }
  rounded(c, 180, 181, 153, 162, 23, PAPER, tint(color, -0.3), 4);
  rounded(c, 204, 202, 105, 13, 6, tint(color, -0.18), null, 0);
  for (const [x, y, a] of [[242, 271, -0.5], [277, 279, 0.4], [253, 304, -0.1]]) {
    oval(c, x, y, 26, 19, '#e8bb6e', '#b78b4c', 3, a);
    stroke(c, () => { c.moveTo(x - 13, y - 2); c.quadraticCurveTo(x, y - 10, x + 13, y - 2); }, '#ffe2a0', 4);
    for (let i = 0; i < 3; i++) oval(c, x - 9 + i * 9, y + 5, 1.5, 2, '#b28b51', null, 0);
  }
  stroke(c, () => { c.moveTo(174, 149); c.lineTo(185, 169); c.moveTo(340, 352); c.lineTo(350, 365); }, tint(color, -0.3), 3);
  stroke(c, () => { c.moveTo(172, 184); c.quadraticCurveTo(160, 229, 168, 278); }, tint(color, 0.65), 6);
  c.restore();
}

function onigiri(c) {
  shadow(c, 257, 419, 146, 23);
  shape(c, () => { c.moveTo(122, 361); c.lineTo(222, 143); c.quadraticCurveTo(256, 76, 291, 143); c.lineTo(390, 361); c.quadraticCurveTo(416, 414, 355, 414); c.lineTo(157, 414); c.quadraticCurveTo(98, 414, 122, 361); }, gradient(c, 100, 150, 386, 405, ['#fff7df', '#fff3d4', '#dccfaf']), '#66746b', 6);
  for (let row = 0; row < 9; row++) for (let col = 0; col < 9; col++) {
    const y = 177 + row * 24, x = 148 + col * 26 + (row % 2) * 6;
    if (Math.abs(x - 256) < (y - 100) * 0.43 && (x < 206 || x > 304 || y < 240)) oval(c, x, y, 4, 2, '#d6cba9', null, 0, (row + col) * 0.31);
  }
  shape(c, () => { c.moveTo(216, 235); c.quadraticCurveTo(256, 226, 296, 235); c.lineTo(315, 410); c.quadraticCurveTo(256, 420, 198, 410); }, gradient(c, 204, 0, 310, 0, ['#3c6354', '#4f7964', '#294d43']), '#25443e', 5);
  for (let y = 258; y < 402; y += 21) stroke(c, () => { c.moveTo(215, y); c.lineTo(289, y - 3); }, '#73917a', 2);
  for (const x of [226, 245, 273, 291]) stroke(c, () => { c.moveTo(x, 244); c.lineTo(x + 3, 399); }, 'rgba(27,58,47,.32)', 3);
  stroke(c, () => { c.moveTo(162, 326); c.lineTo(199, 242); }, '#fffcea', 9);
}

function bento(c, color) {
  shadow(c, 259, 415, 177, 29);
  c.save(); c.translate(256, 264); c.rotate(-0.12); c.translate(-256, -264);
  rounded(c, 104, 155, 311, 244, 31, '#354e4e', '#273e42', 6);
  rounded(c, 111, 149, 298, 234, 27, gradient(c, 0, 149, 0, 384, ['#a4b0a1', '#dae0c9', '#82998e']), INK, 5);
  rounded(c, 122, 161, 276, 209, 19, '#50625a', null, 0);
  rounded(c, 131, 170, 146, 190, 13, '#ffedce', '#e0caa3', 3);
  for (let y = 185; y < 350; y += 18) for (let x = 142; x < 267; x += 17) oval(c, x + ((y / 18) % 2) * 3, y, 5, 2, (x + y) % 3 ? '#fff8df' : '#e4d0a7', null, 0, 0.3);
  oval(c, 208, 261, 21, 20, '#c47b65', '#9f624e', 3); oval(c, 203, 255, 7, 5, '#e5a48b', null, 0);
  rounded(c, 287, 172, 101, 101, 13, '#e7c594', null, 0);
  for (const [x, y, a] of [[319, 203, -0.32], [350, 214, 0.15], [324, 243, 0.45]]) {
    oval(c, x, y, 25, 18, '#d7a66b', '#a47a49', 3, a);
    stroke(c, () => { c.moveTo(x - 13, y - 4); c.lineTo(x + 11, y + 5); }, '#f3ce8b', 4);
  }
  rounded(c, 287, 283, 101, 77, 12, '#d4d4a9', null, 0);
  for (const [x, y, r] of [[308, 307, 17], [332, 306, 18], [322, 326, 20]]) oval(c, x, y, r, r * 0.83, color, '#547761', 3);
  for (const [x, y] of [[306, 305], [328, 302], [320, 323]]) oval(c, x - 3, y - 4, 6, 4, tint(color, 0.35), null, 0);
  oval(c, 361, 331, 17, 15, '#df9474', '#b97c59', 3); oval(c, 361, 331, 7, 6, '#f4ba7d', null, 0);
  stroke(c, () => { c.moveTo(127, 156); c.lineTo(385, 156); c.moveTo(399, 184); c.lineTo(399, 321); }, '#f8f3dc', 5);
  c.restore();
  stroke(c, () => { c.moveTo(138, 121); c.lineTo(373, 90); c.moveTo(140, 135); c.lineTo(374, 105); }, '#b3956d', 9);
  stroke(c, () => { c.moveTo(140, 119); c.lineTo(371, 89); }, '#eed7a4', 3);
}

function oden(c, color) {
  shadow(c, 256, 418, 146, 26);
  shape(c, () => { c.moveTo(111, 235); c.bezierCurveTo(120, 346, 160, 408, 256, 409); c.bezierCurveTo(352, 408, 392, 346, 402, 235); }, gradient(c, 114, 0, 402, 0, [tint(color, -0.1), tint(color, 0.55), tint(color, 0.18), tint(color, -0.1)]));
  stroke(c, () => { c.moveTo(143, 330); c.quadraticCurveTo(256, 384, 371, 330); }, PAPER, 16);
  oval(c, 256, 229, 146, 54, '#f5e5bc');
  oval(c, 256, 229, 133, 44, '#b88b4e', '#946f43', 3);
  oval(c, 274, 243, 50, 22, '#e2b770', null, 0);
  oval(c, 206, 226, 39, 23, '#eee1b5', '#c0a475', 3, -0.15);
  oval(c, 205, 220, 35, 20, '#fff0c7', '#d9c39c', 2, -0.15);
  stroke(c, () => { c.moveTo(186, 218); c.lineTo(222, 226); c.moveTo(205, 205); c.lineTo(204, 235); }, '#e6d1a3', 2);
  shape(c, () => { c.moveTo(315, 202); c.lineTo(352, 244); c.lineTo(296, 244); }, '#9ca399', '#6d8075', 3);
  for (let i = 0; i < 8; i++) oval(c, 313 + (i % 3) * 10, 221 + Math.floor(i / 3) * 7, 1.4, 1.6, '#63786d', null, 0);
  stroke(c, () => { c.moveTo(156, 282); c.lineTo(331, 132); }, '#96764f', 9);
  for (const [x, y] of [[210, 235], [249, 201], [288, 167]]) {
    oval(c, x, y, 25, 22, '#e7cba0', '#b79468', 3, -0.25);
    oval(c, x - 6, y - 7, 9, 5, '#fff0c8', null, 0, -0.3);
  }
  stroke(c, () => { c.moveTo(131, 260); c.quadraticCurveTo(149, 291, 162, 302); }, '#fff4d4', 7);
}

function icecream(c, color) {
  shadow(c, 256, 423, 122, 24);
  shape(c, () => { c.moveTo(150, 280); c.lineTo(178, 390); c.quadraticCurveTo(255, 428, 334, 390); c.lineTo(362, 280); }, gradient(c, 150, 0, 360, 0, [tint(color, -0.06), tint(color, 0.42), color, tint(color, -0.13)]));
  shape(c, () => { c.moveTo(160, 321); c.quadraticCurveTo(256, 344, 351, 320); c.lineTo(341, 360); c.quadraticCurveTo(256, 385, 170, 360); }, PAPER, null, 0);
  oval(c, 255, 350, 20, 17, tint(color, 0.16), null, 0);
  stroke(c, () => { c.moveTo(252, 338); c.quadraticCurveTo(243, 349, 259, 359); }, PAPER, 4);
  oval(c, 256, 281, 107, 27, '#e6dfc8', '#718c87', 4);
  shape(c, () => {
    c.moveTo(170, 266); c.bezierCurveTo(150, 237, 175, 220, 199, 216);
    c.bezierCurveTo(173, 187, 202, 169, 223, 163);
    c.bezierCurveTo(212, 141, 247, 130, 259, 98);
    c.bezierCurveTo(298, 122, 298, 148, 285, 163);
    c.bezierCurveTo(321, 174, 335, 195, 313, 215);
    c.bezierCurveTo(344, 226, 358, 251, 341, 269);
    c.bezierCurveTo(318, 301, 195, 303, 170, 266);
  }, gradient(c, 170, 140, 343, 280, ['#fff9e1', '#fff0ce', '#dec8a4']), '#958a72', 5);
  stroke(c, () => { c.moveTo(194, 253); c.bezierCurveTo(228, 274, 291, 276, 329, 254); c.moveTo(211, 210); c.quadraticCurveTo(253, 231, 308, 208); c.moveTo(236, 164); c.quadraticCurveTo(260, 177, 285, 163); }, '#d9bf99', 5);
  stroke(c, () => { c.moveTo(205, 239); c.quadraticCurveTo(239, 252, 269, 248); c.moveTo(231, 195); c.lineTo(252, 201); }, '#fffcec', 6);
}

function umbrella(c, color) {
  shadow(c, 253, 429, 159, 23);
  c.save(); c.translate(258, 255); c.rotate(-0.43);
  stroke(c, () => { c.moveTo(0, -145); c.lineTo(0, 185); }, '#789195', 9);
  stroke(c, () => { c.moveTo(0, -100); c.lineTo(0, -168); c.bezierCurveTo(0, -209, 61, -211, 62, -175); c.lineTo(62, -159); }, '#435f66', 19);
  stroke(c, () => { c.moveTo(-3, -158); c.bezierCurveTo(-7, -196, 46, -207, 53, -178); }, '#a5bec0', 5);
  shape(c, () => { c.moveTo(-43, -101); c.quadraticCurveTo(0, -118, 43, -101); c.quadraticCurveTo(47, -4, 25, 136); c.lineTo(0, 171); c.lineTo(-25, 136); c.quadraticCurveTo(-47, -4, -43, -101); }, gradient(c, -44, 0, 44, 0, [tint(color, -0.19), tint(color, 0.42), color, tint(color, -0.22)]));
  for (const x of [-28, -13, 13, 28]) stroke(c, () => { c.moveTo(x, -99); c.quadraticCurveTo(x * 0.8, 18, x * 0.23, 151); }, tint(color, -0.27), 3);
  rounded(c, -37, 15, 74, 20, 6, tint(color, -0.3), INK, 3);
  oval(c, 20, 25, 5, 5, '#dce5da', '#789796', 2);
  stroke(c, () => { c.moveTo(-24, -86); c.lineTo(-23, -39); }, tint(color, 0.7), 5);
  stroke(c, () => { c.moveTo(0, 169); c.lineTo(0, 194); }, '#b8c9c7', 9);
  oval(c, 0, 196, 5, 5, '#465e65', null, 0); c.restore();
}

function wrappers(c, color) {
  shadow(c, 258, 397, 151, 29);
  shape(c, () => { c.moveTo(127, 184); c.lineTo(175, 196); c.lineTo(199, 158); c.lineTo(247, 180); c.lineTo(282, 163); c.lineTo(321, 201); c.lineTo(370, 190); c.lineTo(354, 236); c.lineTo(391, 267); c.lineTo(365, 304); c.lineTo(378, 349); c.lineTo(326, 350); c.lineTo(304, 390); c.lineTo(259, 366); c.lineTo(213, 390); c.lineTo(185, 347); c.lineTo(137, 349); c.lineTo(151, 305); c.lineTo(118, 269); c.lineTo(148, 236); }, gradient(c, 125, 170, 380, 365, ['#f4f1df', '#c2cfca', '#e8e8d6', '#a8bcb9']));
  shape(c, () => { c.moveTo(199, 211); c.lineTo(296, 193); c.lineTo(333, 260); c.lineTo(295, 335); c.lineTo(224, 357); c.lineTo(190, 298); }, tint(color, 0.15), '#798b87', 3);
  shape(c, () => { c.moveTo(211, 235); c.lineTo(287, 223); c.lineTo(307, 270); c.lineTo(277, 310); c.lineTo(221, 312); }, PAPER, null, 0);
  stroke(c, () => { c.moveTo(226, 260); c.lineTo(282, 250); c.moveTo(228, 279); c.lineTo(270, 273); }, tint(color, -0.2), 6);
  for (const points of [[[151, 207], [173, 261], [151, 312]], [[181, 334], [207, 298], [192, 251]], [[311, 212], [339, 254], [321, 285]], [[366, 276], [338, 308], [356, 336]], [[227, 185], [238, 214]], [[286, 338], [293, 368]]]) {
    stroke(c, () => { c.moveTo(...points[0]); points.slice(1).forEach((p) => c.lineTo(...p)); }, '#879d99', 4);
  }
  stroke(c, () => { c.moveTo(155, 191); c.lineTo(172, 221); c.moveTo(342, 303); c.lineTo(360, 335); }, '#fffbed', 5);
}

function receipt(c, color) {
  shadow(c, 265, 425, 123, 24);
  c.save(); c.translate(256, 256); c.rotate(0.045); c.translate(-256, -256);
  shape(c, () => { c.moveTo(162, 98); c.quadraticCurveTo(256, 83, 351, 102); c.lineTo(350, 398); for (let x = 350; x > 162; x -= 17) { c.lineTo(x - 8, 410); c.lineTo(x - 17, 398); } c.lineTo(158, 114); c.quadraticCurveTo(158, 104, 162, 98); }, gradient(c, 158, 0, 351, 0, ['#e3d8bd', '#fff6dd', '#fbedd0', '#d6c9aa']), '#82908a', 4);
  oval(c, 253, 141, 18, 18, color, null, 0);
  stroke(c, () => { c.moveTo(243, 141); c.lineTo(252, 133); c.lineTo(263, 141); c.moveTo(246, 140); c.lineTo(246, 150); c.lineTo(260, 150); c.lineTo(260, 140); }, '#fff4d8', 3);
  rounded(c, 209, 170, 89, 6, 3, color, null, 0);
  stroke(c, () => { c.moveTo(181, 195); c.lineTo(330, 195); }, '#b4b19c', 2);
  for (let row = 0; row < 5; row++) {
    rounded(c, 180, 212 + row * 18, 66 + (row % 3) * 12, 5, 2, '#7e8d83', null, 0);
    rounded(c, 303 - (row % 2) * 7, 212 + row * 18, 25 + (row % 2) * 7, 5, 2, '#7e8d83', null, 0);
  }
  stroke(c, () => { c.moveTo(180, 308); c.lineTo(330, 308); }, '#a5a78f', 2);
  rounded(c, 181, 321, 54, 8, 3, color, null, 0); rounded(c, 288, 321, 41, 8, 3, color, null, 0);
  for (let i = 0, x = 184; x < 330; i++) { const w = i % 3 === 0 ? 4 : 2; rounded(c, x, 353, w, i % 4 === 0 ? 24 : 20, 0.5, '#5b706c', null, 0); x += w + (i % 2 ? 4 : 3); }
  stroke(c, () => { c.moveTo(170, 107); c.quadraticCurveTo(255, 99, 340, 110); }, '#fffdf0', 4);
  c.restore();
}

const DRAW = { coffee, snack, onigiri, bento, oden, icecream, umbrella, wrappers, receipt };

export function getItemArt(item = {}) {
  const sourceKind = String(item.kind || 'snack').toLowerCase();
  const kind = ['wrapper', 'scrap', 'trash'].includes(sourceKind) ? 'wrappers' : sourceKind;
  const name = String(item.name || '');
  const color = validColor(item.color, DEFAULTS[kind] || DEFAULTS.snack);
  const key = JSON.stringify([kind, name, color]);
  if (CACHE.has(key)) return CACHE.get(key);
  if (typeof document === 'undefined') throw new Error('getItemArt requires a browser Canvas2D context');
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = SIZE;
  const c = canvas.getContext('2d');
  if (!c) throw new Error('Canvas2D is not available');
  c.lineCap = 'round'; c.lineJoin = 'round';
  if (kind === 'drink') (/茶|水|果汁|牛奶|tea|water|juice|milk|bottle/i.test(name) ? bottle : can)(c, color);
  else (DRAW[kind] || snack)(c, color);
  const url = canvas.toDataURL('image/png');
  if (CACHE.size >= 256) CACHE.delete(CACHE.keys().next().value);
  CACHE.set(key, url);
  return url;
}
