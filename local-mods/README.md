# 9Router local mods

This directory contains the reusable overlay and automation scripts for the custom hamsa0x7 9Router build.

- `overlay/` is copied onto a fresh upstream checkout.
- `apply-overlay.ps1` applies the overlay to an existing checkout.
- `build-install-from-upstream.ps1` clones current upstream into a temp folder, applies the overlay, builds, and installs globally on this machine.

The GitHub workflow clones upstream, applies `overlay/`, builds the CLI package, publishes a `.tgz` release asset, and the local `9router` CLI auto-updates from `hamsa0x7/9router` releases.
