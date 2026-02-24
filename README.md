# Apartment Messenger - ImmoScout24 Edition

A Chrome extension that automatically monitors ImmoScout24 for new apartment listings and contacts landlords on your behalf.

## Features

- **Auto-monitoring** - Continuously checks your search results for new listings
- **Smart messaging** - Automatically personalizes greetings based on landlord's name
- **Form auto-fill** - Fills out the contact form with your saved details
- **Manual mode** - Option to review messages before sending
- **Rate limiting** - Prevents getting blocked with configurable delays

## Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked** and select this folder

## Setup

1. Click the extension icon in your toolbar
2. **Settings tab:**
   - Paste your ImmoScout24 search URL
   - Write your message (greeting is added automatically)
   - Choose auto-send or manual mode
3. **Form tab:**
   - Fill in your personal details (used for the contact form)
4. **Advanced tab:**
   - Adjust check interval and rate limits

## How It Works

1. The extension periodically checks your search results page
2. When new listings appear, it opens each one
3. Extracts the landlord's name and adds appropriate greeting:
   - "Sehr geehrte Frau [Name]," or "Sehr geehrter Herr [Name],"
   - Falls back to "Sehr geehrte Damen und Herren," if name not found
4. Fills out the contact form with your details
5. Either sends automatically or waits for your review (based on settings)

## Settings

| Setting           | Description                                              |
| ----------------- | -------------------------------------------------------- |
| Search URL        | Your ImmoScout24 search results page                     |
| Message           | Your message to landlords (greeting added automatically) |
| Send Mode         | Auto-send or fill form for manual review                 |
| Check Interval    | How often to check for new listings (60-3600 sec)        |
| Max Messages/Hour | Rate limit to avoid blocks                               |
| Min Delay         | Minimum wait between messages                            |

## File Structure

```
├── manifest.json    # Extension configuration
├── background.js    # Service worker (monitoring logic)
├── content.js       # Page interaction scripts
├── popup.html       # Extension popup UI
├── popup.js         # Popup functionality
└── icons/           # Extension icons
```

## Tips

- Make sure you're logged into ImmoScout24
- Use manual mode first to verify everything works correctly
- Keep check intervals reasonable (60+ seconds recommended)
- The extension works best with search result pages

## Troubleshooting

**Extension not detecting listings?**
- Verify your search URL is correct
- Make sure you're on the search results page (not a single listing)

**Messages not sending?**
- Check that you're logged into ImmoScout24
- Try manual mode to see if forms are being filled correctly
- Check browser console for errors (F12 → Console)

**Getting blocked?**
- Increase the check interval
- Lower max messages per hour
- Increase minimum delay between messages

## Disclaimer

This tool is for personal use. Please use responsibly and respect ImmoScout24's terms of service. The extension may need updates if the website structure changes.

## License

MIT License - feel free to modify and share.
