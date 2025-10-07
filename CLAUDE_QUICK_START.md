# Claude Quick Start Guide

## 🚀 Get Started in 3 Minutes

### Step 1: Get Your Anthropic API Key (2 minutes)

1. **Visit:** https://console.anthropic.com/settings/keys
2. **Sign in** or create account (free tier available)
3. **Click:** "Create Key"
4. **Copy** your key (starts with `sk-ant-`)

**Pricing:** Pay-as-you-go, no subscription required
- First $5 is often free credit
- $3 per 1M input tokens
- $15 per 1M output tokens
- **With caching: 90% discount on repeated prompts!**

---

### Step 2: Configure Extension (30 seconds)

1. **Open** extension settings (click gear icon)
2. **Select** "Anthropic Claude" from Provider dropdown
3. **Paste** your API key in "Anthropic API Key" field
4. **Click** "Save Anthropic Key"
5. **Select** model: "Claude 4.5 Sonnet" (recommended)

---

### Step 3: Generate Code (30 seconds)

1. **Capture** page normally
2. **Write** your variation description
3. **Click** "Generate Experiment Code"
4. **Watch** console logs for cache savings:
   ```
   💾 Prompt Cache Performance: { savings: '90%' }
   ```

---

## 🎯 What You Get

### Immediate Benefits

✅ **50 requests/minute** (vs OpenAI's 3-5)
✅ **No more rate limit errors**
✅ **Better code quality**
✅ **More consistent output**
✅ **90% cost savings** after first request

---

## 💰 Cost Comparison

**Your typical workflow (10 generations/day):**

| Provider | Daily Cost | Monthly Cost | With Cache |
|----------|-----------|--------------|------------|
| OpenAI GPT-4o-mini | $0.013 | $0.39 | N/A |
| **Claude with cache** | **$0.075** → **$0.009** | **$0.27** | ✅ **87% savings** |

**Verdict:** Claude is competitive + you get 10x better rate limits!

---

## 🔍 Verify It's Working

**Check Service Worker Console:**

1. Right-click extension icon → "Inspect service worker"
2. Generate code
3. Look for these logs:

```javascript
✅ Good signs:
🤖 AI Provider: { provider: 'anthropic', model: 'claude-sonnet-4-20250514' }
🔮 Calling Anthropic Claude
📥 Claude API Response: { stopReason: 'end_turn' }
💾 Prompt Cache Performance: { cacheRead: 2500, savings: '90%' }

❌ Issues to fix:
❌ Anthropic API key is missing
❌ Claude API error: 401 (invalid key)
```

---

## 🆚 Model Comparison

### Claude 4.5 Sonnet (Recommended)

**Best for:** Production, complex variations

**Pros:**
- Latest model (May 2025)
- Extended thinking enabled
- Best quality

**Speed:** ~5-7 seconds

---

### Claude 3.5 Sonnet (Stable Alternative)

**Best for:** High volume, stable workflows

**Pros:**
- Very stable
- Slightly faster
- Excellent quality

**Speed:** ~4-6 seconds

---

## 🐛 Common Issues

### Issue: "Anthropic API key is missing"

**Fix:**
1. Settings → Provider → Select "Anthropic Claude"
2. Scroll to "Anthropic API Key" section
3. Paste key (starts with `sk-ant-`)
4. Click "Save Anthropic Key"

---

### Issue: Rate limit with Claude

**Very rare!** But if it happens:
1. Wait 60 seconds
2. Temporarily switch to OpenAI in settings
3. Consider upgrading Anthropic tier

**Normal limits:**
- Free tier: 50 requests/min
- Paid: Much higher

---

### Issue: Empty response

**Check console for:**
```javascript
stopReason: 'max_tokens'  // Hit token limit
```

**Fix:** Simplify request or reduce variations

---

## 📊 Cache Performance

**How caching works:**

```
Request 1 (Cold):
├─ Element database: 2000 tokens @ $3/1M = $0.006
├─ Your description: 500 tokens @ $3/1M = $0.0015
└─ Total input: $0.0075

Request 2 (Warm - same database):
├─ Element database: 2000 tokens @ $0.30/1M = $0.0006 (cached!)
├─ Your description: 500 tokens @ $3/1M = $0.0015
└─ Total input: $0.0021 (72% savings!)

Requests 3-10: Same savings continue for 5 minutes
```

---

## 💡 Pro Tips

### 1. Let the cache warm up
First request is full price, subsequent are 90% off. Do multiple variations in one session!

### 2. Use Claude 4.5 for complex tasks
- Multiple elements
- Conditional logic
- Complex interactions

### 3. Use Claude 3.5 for simple tasks
- Single button changes
- Color swaps
- Text updates

### 4. Monitor cache performance
Watch console for:
```javascript
💾 Prompt Cache Performance: { savings: '90%' }
```

If savings drop, you may have changed element selection (cache expired).

---

## 🎯 Next Steps

1. ✅ Generate your first variation with Claude
2. ✅ Watch for cache savings in console
3. ✅ Compare quality to OpenAI
4. ✅ Enjoy 10x better rate limits!

**Questions?** Check [CLAUDE_IMPLEMENTATION.md](CLAUDE_IMPLEMENTATION.md) for full technical details.

---

## 🔗 Useful Links

- **Get API Key:** https://console.anthropic.com/settings/keys
- **Anthropic Docs:** https://docs.anthropic.com/
- **Pricing:** https://www.anthropic.com/pricing
- **Claude Models:** https://www.anthropic.com/claude

---

**You're all set! Start generating with Claude for better results and no rate limits.** 🚀
