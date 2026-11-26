# GPT Task Manager architecture

Manifest V3 extension; all data stays in chrome.storage.local. A ChatGPT adapter observes public DOM UI signals only. The service worker validates sender and messages, owns per-tab state and notification deduplication, and restores state after worker restarts. No conversation content, tokens, cookies, network interception, external services, or remote code are used.

Completion is allowed only after an observed active generation in the same conversation; ambiguous, reloaded, stopped, and disconnected states must not become completion. Detection depends on ChatGPT's changing DOM and requires real-service validation before release.
