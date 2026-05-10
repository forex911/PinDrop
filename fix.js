const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// The mangled UTF-8 double/triple encoding artifacts
html = html.replace(/ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â /g, '—');
html = html.replace(/ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢/g, '→');
html = html.replace(/ÃƒÂ¢Ã¢â‚¬â€œÃ‚Â¸/g, '▸');
html = html.replace(/ÃƒÂ¢Ã…â€œÃ¢â‚¬Å“/g, '✓');
html = html.replace(/ÃƒÂ¢Ã‹â€ Ã…Â¾/g, '∞');
html = html.replace(/Ãƒâ€šÃ‚Â·/g, '·');
html = html.replace(/ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â€ /g, '↗');
html = html.replace(/ÃƒÂ¢Ã¢â‚¬Â —/g, '↗');
html = html.replace(/ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬/g, '—');
html = html.replace(/Ã¢â‚¬â€/g, '—');
html = html.replace(/Ã¢â€ â€™/g, '→');
html = html.replace(/Ã‚Â·/g, '·');

// General fix for any leftover weirdness
html = html.replace(/ÃƒÂ¢.*? /g, '— ');
html = html.replace(/Ãƒâ€šÃ‚Â·/g, '·');
html = html.replace(/Ã¢â‚¬â€œ/g, '—');
html = html.replace(/Ã¢â‚¬â€/g, '—');

fs.writeFileSync('index.html', html, 'utf8');
console.log('Fixed encoding pass 2');
