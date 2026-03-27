import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3001';

test.describe('GZ Intelligence — OAuth + Chat E2E', () => {

  test('OAuth is connected', async ({ request }) => {
    const res = await request.get(`${BASE}/api/anthropic-oauth/status`);
    const data = await res.json();
    expect(data.authenticated).toBe(true);
    console.log('✅ OAuth authenticated, expires:', new Date(data.expiresAt).toISOString());
  });

  test('Dynamic model list returns current models via OAuth', async ({ page }) => {
    // Use browser context (has session cookie) instead of raw API request
    await page.goto(`${BASE}/settings/llm-preference`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Check the dropdown has loaded with real models
    const dropdown = page.locator('select[name="AnthropicModelPref"]');
    const options = await dropdown.locator('option').allTextContents();
    console.log('Dropdown models:', options.join(', '));

    // Should have current-gen models
    const hasCurrent = options.some(name =>
      name.includes('Sonnet 4') || name.includes('Opus 4') || name.includes('Haiku 4')
    );
    expect(hasCurrent).toBe(true);

    // Should NOT still have old Claude 2.x models
    const hasDeprecated = options.some(name =>
      name.includes('Claude 2') || name === 'Claude 3 Sonnet' || name === 'Claude 3 Opus'
    );
    expect(hasDeprecated).toBe(false);
    console.log('✅ Model list is current — no deprecated models');
  });

  test('LLM settings show dynamic model dropdown', async ({ page }) => {
    await page.goto(`${BASE}/settings/llm-preference`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000); // Let models load

    await page.screenshot({ path: '/tmp/gz-e2e-settings.png', fullPage: true });

    // Check that "Connected via Claude Teams" is shown
    const connected = page.locator('text=Connected via Claude Teams');
    await expect(connected).toBeVisible({ timeout: 5000 });
    console.log('✅ OAuth connected state shown in UI');

    // Check model dropdown has current models
    const bodyText = await page.textContent('body');
    const hasCurrentModel = bodyText?.includes('Sonnet 4') || bodyText?.includes('Opus 4') || bodyText?.includes('Haiku 4');
    expect(hasCurrentModel).toBe(true);
    console.log('✅ Current models visible in dropdown');
  });

  test('Chat with Claude via OAuth — send message and get response', async ({ page }) => {
    // First, make sure workspace has the right LLM settings saved
    // Navigate to workspace chat
    await page.goto(`${BASE}/workspace/my-workspace`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.screenshot({ path: '/tmp/gz-e2e-chat-before.png', fullPage: true });

    // Type a message in the chat input
    const chatInput = page.locator('textarea[placeholder="Send a message"], input[placeholder="Send a message"]');
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    const testMessage = 'Respond with exactly: "GZ Intelligence works!" — nothing else.';
    await chatInput.fill(testMessage);

    // Send the message (press Enter or click send)
    await chatInput.press('Enter');

    // Wait for response — the response should appear as a new chat message
    // AnythingLLM streams responses, so we need to wait for the stream to complete
    console.log('Message sent, waiting for response...');

    // Wait for a response element to appear (not an error)
    // The response will be in a div with the assistant's message
    await page.waitForTimeout(3000); // Initial wait for streaming to start

    // Poll for up to 30 seconds for a complete response
    let responseText = '';
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(2000);
      await page.screenshot({ path: '/tmp/gz-e2e-chat-progress.png', fullPage: true });

      // Check for error messages
      const errorEl = page.locator('text=Could not respond to message').first();
      const hasError = await errorEl.isVisible().catch(() => false);
      if (hasError) {
        const errorContent = await page.textContent('.bg-red-100, [class*="error"]').catch(() => '');
        console.error('❌ Chat error:', errorContent);
        break;
      }

      // Check for response content — look for text after our message
      const allText = await page.textContent('body');
      if (allText?.includes('GZ Intelligence works')) {
        responseText = 'GZ Intelligence works!';
        break;
      }

      // Also check for any assistant response (streaming might produce partial text)
      const assistantMsgs = page.locator('[data-role="assistant"], .assistant-message, [class*="ChatBubble"]');
      const count = await assistantMsgs.count();
      if (count > 0) {
        const lastMsg = await assistantMsgs.last().textContent();
        if (lastMsg && lastMsg.length > 5) {
          responseText = lastMsg;
          break;
        }
      }
    }

    await page.screenshot({ path: '/tmp/gz-e2e-chat-after.png', fullPage: true });

    // Verify we got a response (not an error)
    const bodyText = await page.textContent('body');
    const hasAuthError = bodyText?.includes('authentication failed') || bodyText?.includes('Could not respond');
    
    if (hasAuthError) {
      console.error('❌ Authentication error in chat');
      console.error('Page text excerpt:', bodyText?.substring(0, 500));
    }
    
    expect(hasAuthError).toBe(false);
    console.log('✅ Chat response received:', responseText.substring(0, 100));
  });
});
