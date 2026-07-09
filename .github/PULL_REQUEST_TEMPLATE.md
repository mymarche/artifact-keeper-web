## Description

Implements a debounce mechanism to prevent the first request after a tab unfreeze from lacking cookies.

## Changes
- Adds a `visibilitychange` listener to track when a tab has been hidden for over `FREEZE_THRESHOLD_MS` (5 minutes).
- If the threshold is met upon tab becoming `visible`, a `cookieReady` promise is created with a `COOKIE_REHYDRATE_MS` (500ms) delay.
- The SDK request interceptor now `await`s `cookieReady` before proceeding, ensuring the cookie store is likely rehydrated. This prevents requests from being sent without cookies immediately after a long freeze.

## Related Issue:
[Link to the issue if created]

## How to test:
1. Apply the changes.
2. Log in.
3. Leave the tab idle in the background for over 5 minutes.
4. Make the tab visible again.
5. Observe network requests – the first request should now succeed (or at least include cookies), preventing the 401/redirect.

## Checklist:
- [x] Code changes have been tested locally.
- [x] Tests have been added or updated.
- [x] Documentation has been updated.
- [x] Changes are relevant to the issue/task.

## Notes:
This change addresses the specific scenario where Chrome's tab freezing causes the initial request after unfreezing to miss cookies. Other scenarios (like cookie eviction due to LRU or backend session expiry) are not directly targeted by this fix.
