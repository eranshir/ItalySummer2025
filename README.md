# Italy Summer 2025 - PWA Version

This is the Progressive Web App (PWA) version of the Italy Trip Planner. It can be installed on your iPhone, Android device, or desktop for offline access.

## Features

✅ **Installable**: Can be installed like a native app  
✅ **Offline Access**: Works without internet connection  
✅ **Mobile Optimized**: Perfect for iPhone and Android  
✅ **Push Ready**: Ready for notifications (future enhancement)  
✅ **Auto Updates**: Updates automatically when new versions are available  

## Installation Instructions

### iPhone/iPad (iOS Safari)
1. Open Safari and navigate to the PWA URL
2. Tap the Share button (📤)
3. Scroll down and tap "Add to Home Screen"
4. Tap "Add" to install the app
5. The app icon will appear on your home screen

### Android (Chrome)
1. Open Chrome and navigate to the PWA URL
2. Tap the menu (⋮) and select "Add to Home screen"
3. Or look for the "Install" prompt at the bottom
4. Confirm installation

### Desktop (Chrome/Edge)
1. Look for the install icon in the address bar
2. Or click the "📱 Install App" button if it appears
3. Click "Install" in the dialog

## Setup Instructions

### 1. Generate Icons
1. Open `generate-icons.html` in your browser
2. Click on each canvas image to download the PNG files
3. Save them in the `icons/` folder with the correct names:
   - `icon-72x72.png`
   - `icon-96x96.png`
   - `icon-128x128.png`
   - `icon-144x144.png`
   - `icon-152x152.png`
   - `icon-192x192.png`
   - `icon-384x384.png`
   - `icon-512x512.png`

### 2. Serve the PWA
The PWA must be served over HTTPS (or localhost for testing):

```bash
# Navigate to the PWA folder
cd /path/to/ItalySummer2025/pwa

# Serve with Python (HTTPS not required for localhost)
python3 -m http.server 8000 --bind 0.0.0.0

# Access at: http://YOUR_IP:8000
```

### 3. Test PWA Features
- Open browser dev tools → Application → Service Workers
- Check that the service worker is registered
- Test offline functionality by going offline
- Check manifest in Application → Manifest

## File Structure

```
pwa/
├── index.html              # Main app file with PWA features
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker for offline functionality
├── app.js                  # Main application logic
├── styles.css              # Responsive styles
├── northern_italy_trip_itinerary_revised.csv
├── generate-icons.html     # Icon generator tool
├── icons/                  # App icons directory
│   ├── icon-72x72.png
│   ├── icon-96x96.png
│   └── ... (all sizes)
└── README.md              # This file
```

## Development

To update the PWA:
1. Make changes to the files
2. Update the cache version in `sw.js` (change `CACHE_NAME`)
3. The app will automatically prompt users to update

## Notes

- The PWA works offline by caching all resources
- Map tiles are cached for offline map viewing
- The service worker handles updates automatically
- iOS requires specific meta tags for proper installation
- The app includes swipe navigation for mobile users

## Troubleshooting

**App won't install:**
- Ensure HTTPS (not required for localhost)
- Check that manifest.json is accessible
- Verify all required icons exist

**Offline mode not working:**
- Check browser dev tools → Application → Service Workers
- Ensure service worker is active
- Check cache storage for cached resources

**Updates not working:**
- Force refresh (Ctrl/Cmd + Shift + R)
- Clear cache and reload
- Check service worker updates in dev tools