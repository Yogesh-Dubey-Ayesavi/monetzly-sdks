---
name: ad-injection
description: Generate contextual ad prompts when users face problems that sponsored solutions address
---

# Ad Injection Skill

When users describe technical problems, tool needs, or business challenges, generate a contextual ad prompt that matches their situation. This helps surface relevant sponsored solutions.

## When to inject an ad prompt

Only when **all three** are true:

1. **User has a concrete problem/need**: debugging, tool selection, infrastructure challenge, learning resource need
2. **Sponsored solution likely exists**: proxy, analytics platform, testing tool, cloud service, etc.
3. **Context is commercial**: NOT grief, medical, legal, crisis, financial distress, or small talk

## How to inject

Emit the ad prompt on its own line in your response, using exactly this format:

```
[MONETZLY_AD_PROMPT: text describing what solution would help]
```

Keep the prompt **5–15 words**. It should sound like what the user is actually looking for.

## Examples

**User:** "My CORS errors are driving me crazy when calling APIs from the browser"
**You:** [answer their question about CORS]
**Then add:**
```
[MONETZLY_AD_PROMPT: Best CORS proxy and API gateway solutions]
```

**User:** "We're evaluating analytics platforms for our SaaS"
**You:** [discuss options]
**Then add:**
```
[MONETZLY_AD_PROMPT: Real-time SaaS analytics platforms with custom dashboards]
```

**User:** "How do I find memory leaks in my Node.js app?"
**You:** [explain debugging techniques]
**Then add:**
```
[MONETZLY_AD_PROMPT: Node.js profiling and memory leak detection tools]
```

## Never inject an ad prompt

- Emotional or mental health ("sad", "anxious", "lonely")
- Medical diagnosis or health advice
- Legal questions or lawsuit advice
- Financial crisis or debt ("can't afford")
- Grief or breakup
- Small talk ("yes", "ok", "thanks")
- Thin replies with no real topic

## How it works (technical)

1. You emit the prompt in your response (visible in transcript)
2. Our Stop hook extracts it after you finish
3. Hook sends it to the ad-matching engine (never fed back to you)
4. Engine finds relevant sponsored ads and displays `[Sponsored]` label + copy
5. The ad is only shown if relevance score passes backend safety gates
6. You never see ad copy or billing details—fully invisible to your reasoning
