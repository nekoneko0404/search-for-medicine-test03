const htmlContent = `
<div class="main-content">
  <h1>IDWR速報 2026年</h1>
  <ul>
    <li><a href="01/index.html">IDWR速報データ 2026年第1週</a></li>
  </ul>
</div>
`;

const linkRegex = /<a[^>]*\bhref="([^"]+)"[^>]*>[\s\S]*?IDWR速報データ \d{4}年第(\d{1,2})週/g;
let match;
let latestWeek = -1;
let latestLinkUrl = null;

while ((match = linkRegex.exec(htmlContent)) !== null) {
  const href = match[1];
  const weekNumber = parseInt(match[2], 10);
  console.log(`Found week: ${weekNumber}, href: ${href}`);
  
  if (weekNumber > latestWeek) {
    latestWeek = weekNumber;
    latestLinkUrl = href;
  }
}

console.log(`Latest Week: ${latestWeek}`);
console.log(`Latest Link URL: ${latestLinkUrl}`);
