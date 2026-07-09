**Bug Title:** First Request After Tab Unfreeze Lacks Cookies

**Bug Description:**
After a Chrome tab has been frozen (background, idle for 5+ minutes) and then becomes visible again, the first network request may be sent without a `Cookie` header, leading to authentication errors (401) and potential redirects to `/login`. This happens even though the cookies themselves are still present in the browser's store after the tab unfreezes.

**To Reproduce:**
1. Log in to the application.
2. Leave the tab idle in the background for over 5 minutes (e.g., open YouTube or another heavy site in a different tab).
3. Make the tab visible again.
4. Observe the first network request (e.g., from `TanStack Query`'s `refetchOnWindowFocus` or similar triggers). Check the request headers for the absence of the `Cookie` header.

**Expected Behavior:**
The first network request after the tab becomes visible should include the `Cookie` header, as the cookies remain valid and present in the browser.

**Actual Behavior:**
The first network request is sent without the `Cookie` header, causing authentication failures.

**Screenshots:**
[Add screenshots of DevTools Network tab showing the missing Cookie header on the first request after unfreezing]

**Environment:**
-   Browser: Chrome (specifically observed behavior related to tab freezing/unfreezing)
-   Application Version: [Specify version if applicable]
-   Your Steps to trigger behavior: [Briefly mention steps like logged in state + idle time]

**Potential Fix:**
Implemented a debounce mechanism in the SDK request interceptor to delay requests after a long idle period, allowing the cookie store to rehydrate. (_See PR #XXXX_)
