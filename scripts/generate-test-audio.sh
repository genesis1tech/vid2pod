#!/bin/bash
ffmpeg -f lavfi -i "sine=frequency=440:duration=10" \
  -acodec libmp3lame -ab 128k -ar 44100 -ac 1 \
  tests/fixtures/sample-episode.mp3 -y 2>/dev/null

echo "Created tests/fixtures/sample-episode.mp3 (10s, 440Hz sine, 128kbps MP3)"
