# Video Toolbox

a tauri-powered (formerly electron) desktop application for common video and audio processing tasks. basically its just another ffmpeg wrapper with a gui, BUT theres extra things

## Current Features

this toolbox is a collection of utilities that i think might be useful (kinda).

- **Single & Batch Conversion**: convert videos between common formats (MP4, MKV, AVI, MOV, WebM, etc.). you can do them one by one or point it at a whole folder.
- **Video Trimmer**: straightforward tool to cut the parts you need. It includes waveform and spectrogram previews. (the windows photos trimmer is lowkey smoother tho)
- **Audio Extraction**: extract high-quality audio tracks from video files into MP3, AAC, FLAC, and more.
- **Media Downloader**: simple interface for saving videos or audio from many popular online platforms (powered by `yt-dlp`).
- **Image to PDF**: small utility to combine images (PNG, JPG, WEBP, etc.) into a single PDF file.
- **Metadata Inspector**: view the technical specs of any media file.


## Under the Hood

the app is built with things:

- **Framework**: [tauri v2](https://v2.tauri.app/)
- **Frontend**: good old fashioned vanilla html, css, and javascript. (because im dumb)
- **Processing Engine**: [ffmpeg](https://ffmpeg.org/)

## Getting Started

### Prerequisites

you'll need the standard tauri development requirements:
- [Node.js](https://nodejs.org/)
- [Rust](https://www.rust-lang.org/tools/install)
- [FFmpeg binaries](https://ffmpeg.org/download.html) (the app looks for these in the `bin/` directory or on your system path)

### Development

1. clone repo
2. install dependencies:
   ```bash
   npm install
   ```
3. run the app in development mode:
   ```bash
   npm run dev
   ```

### Building

to create a production version for your platform:
```bash
npm run build
```

---

*note: this is mainly for personal use and is being refined on and off. feel free to use it, but keep in mind it's a work in progress!!! it might be finicky sometimes, and the code is kinda messy (im not a professional and i vibecoded a lot of it). i'm trying to make it look good tho :)*

