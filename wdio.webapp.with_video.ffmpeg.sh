#!/bin/sh
# Enveloppe TEMPORAIRE de ffmpeg pour wdio.webapp.with_video.conf.ts : le service DevTools de WDIO passe `-vsync cfr` à ffmpeg, option
# supprimée par ffmpeg 9 (Homebrew 9.0.2 : « Unrecognized option 'vsync' », que le service rapporte à tort comme « ffmpeg binary not
# found on PATH »). On la remplace par son successeur `-fps_mode`, puis on délègue au ffmpeg du PATH.
n=$#
while [ "$n" -gt 0 ]; do
  a=$1; shift; n=$((n - 1))
  [ "$a" = "-vsync" ] && a="-fps_mode"
  set -- "$@" "$a"
done
exec "$(command -v -p ffmpeg 2>/dev/null || echo /opt/homebrew/bin/ffmpeg)" "$@"
