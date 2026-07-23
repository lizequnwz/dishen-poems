# Three-Layer Audio and Ducking Design

Date: 2026-07-22
Status: implemented in `ba7a236`

## Goal

Extend the existing persistent site soundscape from two layers to three without making the reading experience busy or loud. Full-length guqin remains the musical foundation, one optional environmental recording remains the continuous ambience, and bamboo flute, singing bowl, or chimes appear only as sparse accents. Every layer remains silent until a user starts playback.

The seven assets selected in this design are explicitly approved by the site owner. They may enter the public catalog after automated license-metadata, file-integrity, size, loudness, and technical-quality checks pass. They do not require another listening-approval round. The seven previously downloaded Phase 3 candidates retain their existing candidate status.

## Architecture

Keep the current persistent native `HTMLAudioElement` implementation and add one persistent accent element. Do not introduce Web Audio in this phase. The player has three independently controlled roles:

1. `music`: full-length guqin tracks played sequentially with playlist repeat.
2. `ambient`: at most one looping rain, stream, forest, or bird preset.
3. `accent`: at most one non-looping bamboo flute, singing bowl, or chime recording.

The accent scheduler runs only while the main layer is actively playing, the document is visible, and an accent mode is enabled. It must be cancelled when playback pauses, the document becomes hidden, or the persisted player is destroyed. Returning to a visible document never restarts playback automatically.

## Approved Assets

### Main playlist additions

- `zuiyu-changwan`: Charlie Huang, *Zuiyu Changwan / The Evening Song of the Drunken Fisherman*, CC BY-SA 3.0, source `https://commons.wikimedia.org/wiki/File:Guqin-Zuiyu_Changwan.ogg`.
- `yangguan-sandie`: Charlie Huang, *Yangguan Sandie / Three Refrains on the Yang Pass Theme*, CC BY-SA 3.0, source `https://commons.wikimedia.org/wiki/File:Guqin-Yangguan_Sandie.ogg`.

### Accent additions

- `dizi-sample`: Gorgoroth6669, *DiZi Chinese Flute Sample*, CC0, source `https://commons.wikimedia.org/wiki/File:DiZi_Chinese_Flute_Sample.ogg`.
- `singing-bowl-struck`: BambooBeast, *Singing Bowl 1*, public domain, source `https://commons.wikimedia.org/wiki/File:SingingBowl1.ogg`.
- `singing-bowl-rubbed`: BambooBeast, *Singing Bowl 2*, public domain, source `https://commons.wikimedia.org/wiki/File:SingingBowl2.ogg`.
- `windchimes-short`: Esc861, *Windchimes*, public domain, source `https://commons.wikimedia.org/wiki/File:Windchimes.ogg`.
- `koshi-chimes`: Membeth, *Windglockenspiel Koshi*, CC0, source `https://commons.wikimedia.org/wiki/File:Windglockenspiel.Koshi.ogg`.

The 17-second dizi recording is an accent, not a playlist track. The 58-second Koshi recording is converted into one or more restrained 8-15 second excerpts with fades. The attribution record must identify any excerpting, fades, loudness processing, and MP3 transcoding. No Indian bansuri or Japanese shakuhachi recording is labeled as Chinese dizi or xiao.

## Catalog Interfaces

Extend `AudioAsset.role` with `accent`. Add an accent family to accent assets: `flute`, `bowl`, or `chimes`.

Add an `AccentPreset` interface with a stable id, a display title, and one or more asset ids. The public playback catalog exposes only approved accent assets and presets. Candidate preview continues to expose only candidate assets.

Extend `AudioPreference` with:

- `accentMode`: `off | mixed | flute | bowl | chimes`;
- `accentVolume`: a value from zero to one;
- `accentMuted`: boolean.

The default accent mode is `off`. The selection, volume, and mute state persist across navigation and hard refresh. Playback state does not persist across hard refresh.

The approval record for each new asset uses `approvalStatus: approved`, the implementation date as `approvedAt`, and `site-owner-direct-approval` as `approvedBy`. `review.listening` is `approved` because the owner explicitly waived the additional listening gate for these seven named sources. Automated checks still must pass before promotion.

## Scheduling and Selection

After the user starts the main layer, an enabled accent mode waits 45-90 seconds before the first accent. Subsequent accents wait 120-240 seconds after the previous accent has ended. Random intervals are allowed at runtime because they affect playback experience, not build output.

Only one accent plays at a time. In `mixed` mode, the scheduler chooses among all three families without repeating the same asset twice in succession. A family-specific mode restricts selection to that family. Failed assets are removed from the current session's pool. If every asset in the selected mode fails, the accent layer turns off and reports a non-blocking status message; the music and ambient layers continue.

## Loudness and Ducking

Before publication, create MP3 derivatives and run a two-pass loudness analysis/normalization appropriate to each role. Record the conversion command and resulting checksum in the manifest. Reject files with decoding errors, unexpectedly clipped output, invalid duration, or a size at or above 25 MiB.

The browser always derives effective volume from the saved user volume. Starting an accent applies a temporary multiplier rather than changing the preference:

- main music multiplier: `0.45`, approximately -7 dB;
- ambient multiplier: `0.71`, approximately -3 dB;
- accent multiplier: `1.0` at the saved accent volume.

Ramp into the ducked state over 600 ms. Start the accent after the ramp has begun so the transient never competes with full-volume music. When the accent ends or fails, restore the main and ambient layers over 1,800 ms. A new user volume change during a duck updates the base volume immediately while retaining the active multiplier. Muting always wins over ducking.

Use `requestAnimationFrame` volume interpolation around the existing media elements. Cancel an older ramp before starting a new one. Clamp every assigned media volume to `[0, 1]`. Do not allow an accent error, scheduler error, or volume-ramp error to stop the main playlist.

## Player Interface

Keep the existing transport and ambient controls. Add a compact accent group containing:

- a selector for Off, Mixed, Bamboo flute, Singing bowl, and Chimes;
- an accent mute button;
- an accent volume slider.

The controls use bilingual labels and accessible names. The live status region announces accent failures or automatic shutdown but does not announce every scheduled accent. The player remains usable on narrow mobile screens and must not obscure poem text. With JavaScript disabled, the existing first-approved-guqin native-control fallback remains sufficient; there is no accent fallback.

## Deployment and Attribution

Download only MP3 derivatives or generate local MP3 derivatives from the licensed sources; do not publish OGG originals. Approved files live under the public audio directory and are included in the production build. The development-only candidate endpoint remains for the seven earlier unapproved assets.

The credits page is generated from the manifest and includes creator, work title, original Wikimedia Commons page, license, retrieval date, approval record, hosted MP3 checksum, and transformation notes. CC BY-SA attribution must link to the applicable license and identify modifications.

## Error and Lifecycle Behavior

- No audio request occurs before a user gesture.
- A failed main track advances to the next main track; all-main failure stops playback.
- A failed ambient asset disables only ambience.
- A failed accent asset is skipped for the session; all-selected-accent failure disables accents.
- Backgrounding pauses all three layers, clears the scheduler, cancels ramps, and does not resume automatically.
- Astro navigation retains all three audio elements through `transition:persist`.
- Hard refresh restores selections and volumes but leaves every layer paused.

## Tests and Acceptance

Unit tests cover catalog approval records, accent preset references, preference migration from the two-layer schema, mode validation, selection without immediate repetition, duck multipliers, and clamped effective volume.

Browser-level behavior is checked for:

- zero media requests before a gesture;
- one accent at a time;
- correct attack and release ducking;
- user volume changes during ducking;
- scheduling cancellation on pause and backgrounding;
- playback persistence across internal Astro navigation;
- hard-refresh paused state;
- isolated accent failure;
- keyboard, focus, ARIA, narrow mobile layout, and reduced motion.

The phase is complete only after all new assets pass integrity and size checks, the attribution page contains complete records, Astro check passes, all unit tests pass, and a static production build succeeds.

## Out of Scope

- Continuous bamboo-flute playlist tracks until a suitably licensed, culturally accurate, full-length Chinese recording is found.
- Web Audio graph processing, compressors, or sample-accurate automation.
- Per-poem accent scheduling or automatic accent selection from poem imagery.
- Re-approval or publication of the seven previously downloaded candidates.
