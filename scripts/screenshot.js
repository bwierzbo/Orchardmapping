const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  // Set viewport size
  await page.setViewport({ width: 1920, height: 1080 });

  // Navigate to the page
  console.log('Navigating to http://localhost:3000/orchard/manytrees...');
  await page.goto('http://localhost:3000/orchard/manytrees', {
    waitUntil: 'networkidle2',
    timeout: 60000
  });

  // Wait a bit for map to load
  console.log('Waiting for map to load...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Click "Enter Edit Mode" button
  console.log('Clicking Enter Edit Mode button...');
  try {
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const editButton = buttons.find(btn => btn.textContent.includes('Enter Edit Mode'));
      if (editButton) editButton.click();
    });
    await new Promise(resolve => setTimeout(resolve, 2000));
  } catch (e) {
    console.log('Could not click edit mode button:', e.message);
  }

  // Take screenshot
  console.log('Taking screenshot...');
  await page.screenshot({ path: '/tmp/orchard-screenshot.png', fullPage: false });

  console.log('Screenshot saved to /tmp/orchard-screenshot.png');

  await browser.close();
})();
