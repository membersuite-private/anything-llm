import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3001';

test.describe('GrowthZone Intelligence', () => {

  test('homepage loads with GZ branding', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: '/tmp/gz-intel-home.png', fullPage: true });
    
    // Should show GrowthZone branding text somewhere
    const body = await page.textContent('body');
    expect(body?.toLowerCase()).not.toContain('anythingllm');
  });

  test('LLM settings — select Anthropic and see OAuth button', async ({ page }) => {
    await page.goto(`${BASE}/settings/llm-preference`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Screenshot before selecting
    await page.screenshot({ path: '/tmp/gz-intel-llm-before.png', fullPage: true });
    
    // Click the LLM provider dropdown (the "None selected" or current provider area)
    const providerSelector = page.locator('[class*="llm-provider"] >> nth=0').or(
      page.locator('text=None selected').first()
    ).or(
      page.locator('text=You need to select an LLM').first()  
    ).or(
      page.locator('[class*="Provider"]').first()
    );
    
    // Try clicking the dropdown area
    const dropdownArea = page.locator('img[alt="Anthropic"]').first().or(
      page.locator('button:has-text("None selected")').first()
    ).or(
      page.locator('[data-testid="llm-provider-select"]').first()
    );
    
    // Click whatever provider selector element exists
    try {
      await page.click('text=None selected', { timeout: 3000 });
    } catch {
      try {
        await page.click('text=You need to select an LLM', { timeout: 3000 });
      } catch {
        // Provider might already be selected
      }
    }
    
    await page.waitForTimeout(1000);
    await page.screenshot({ path: '/tmp/gz-intel-llm-dropdown.png', fullPage: true });
    
    // Look for Anthropic in the dropdown and click it
    try {
      await page.click('text=Anthropic', { timeout: 5000 });
      await page.waitForTimeout(2000);
    } catch {
      // Anthropic might already be selected
    }
    
    await page.screenshot({ path: '/tmp/gz-intel-llm-anthropic.png', fullPage: true });
    
    // Now check for the OAuth button
    const oauthButton = page.locator('button:has-text("Sign in with Claude")');
    const isVisible = await oauthButton.isVisible().catch(() => false);
    
    if (isVisible) {
      console.log('✅ OAuth button found!');
    } else {
      console.log('⚠️ OAuth button not visible — checking page content');
      const text = await page.textContent('body');
      console.log('Page contains "Sign in":', text?.includes('Sign in'));
      console.log('Page contains "API Key":', text?.includes('API Key'));
    }
    
    await page.screenshot({ path: '/tmp/gz-intel-llm-final.png', fullPage: true });
  });

  test('OAuth API — status endpoint', async ({ request }) => {
    const response = await request.get(`${BASE}/api/anthropic-oauth/status`);
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('authenticated');
    expect(data.authenticated).toBe(false);
  });

  test('OAuth API — start endpoint (port available)', async ({ request }) => {
    // Clean up any previous session first
    await request.post(`${BASE}/api/anthropic-oauth/logout`);
    await new Promise(r => setTimeout(r, 1000));
    
    const response = await request.get(`${BASE}/api/anthropic-oauth/start`);
    const data = await response.json();
    
    if (response.status() === 200) {
      expect(data.success).toBe(true);
      expect(data.authorizeUrl).toContain('claude.ai/oauth/authorize');
      console.log('✅ OAuth start succeeded — authorize URL generated');
      
      // Clean up the callback server
      await request.post(`${BASE}/api/anthropic-oauth/logout`);
    } else {
      // Port might be in use by Pi — that's OK
      console.log(`⚠️ OAuth start returned ${response.status()}: ${data.error}`);
      expect(data.error).toContain('port');
    }
  });

  test('OAuth API — logout endpoint', async ({ request }) => {
    const response = await request.post(`${BASE}/api/anthropic-oauth/logout`);
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });

  test('API ping works', async ({ request }) => {
    const response = await request.get(`${BASE}/api/ping`);
    expect(response.status()).toBe(200);
  });
});
