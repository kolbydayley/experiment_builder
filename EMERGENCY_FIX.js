// EMERGENCY FIX - Run this in the service worker console to clear bad settings
// Open chrome://extensions/ -> Click "Inspect service worker" -> Paste this in console

(async () => {
  console.log('🚨 EMERGENCY SETTINGS RESET');

  // Get current settings
  const current = await chrome.storage.local.get(['settings']);
  console.log('Current settings:', current.settings);

  // Force update
  const fixed = {
    preferCSS: true,
    includeDOMChecks: true,
    outputFormat: 'convert-format',
    provider: 'anthropic',
    authToken: current.settings?.authToken || '',
    anthropicApiKey: current.settings?.anthropicApiKey || '',
    model: 'claude-sonnet-4-20250514',
    enableFallback: true,
    fallbackProviders: [
      { provider: 'openai', model: 'gpt-4o' },
      { provider: 'openai', model: 'gpt-4o-mini' }
    ],
    generationHistory: current.settings?.generationHistory || []
  };

  await chrome.storage.local.set({ settings: fixed });
  console.log('✅ Settings forcibly reset to:', fixed);

  // Verify
  const verify = await chrome.storage.local.get(['settings']);
  console.log('✅ Verified settings now:', verify.settings);
})();
