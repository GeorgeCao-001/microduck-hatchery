OpenCV.js 4.13.0, official OpenCV documentation build (2025-12-31).

- Download: https://docs.opencv.org/4.x/opencv.js (redirected official documentation asset, downloaded 2026-10-18).
- Version verified with `cv.getBuildInformation()`: 4.13.0.
- SHA-256: `63366510248adf3a7eddf3e793dd825404efb7df3749f4d6f8557c7fa4ca8aa0`.
- License: Apache-2.0, accompanying LICENSE from opencv/opencv tag 4.13.0.
- Local, pinned asset. Loaded only when a user selects a vision filter; no CDN request at runtime.
- Browser adapter follows the already imported official Microduck `spaces/vision-demo/filters.py` at 5323046: Canny 80/180, motion threshold 18 and 5x5 dilation, sparse Lucas–Kanade flow with 200 corners. No camera capture, firmware, ISP or control changes.
