#!/bin/sh
# Exports the Z-Anatomy objects used by build-muscles.ts (needs Blender 4.2 and
# Z-Anatomy's Startup.blend in scripts/.cache/zanatomy). Embedded scripts in the
# .blend are not run (--disable-autoexec); only our export script runs.
set -e
BLENDER=${BLENDER:-blender}
DIR=scripts/.cache/zanatomy
"$BLENDER" -b --disable-autoexec "$DIR/Z-Anatomy/Startup.blend" \
  --python scripts/blender/export_objects.py -- "$DIR/request.json" "$DIR/export"
