# Using Introspect

This guide describes the candidate screening MVP. It is designed for a cinema, a friend's screen, or any player. Meta Egg searches configured online metadata sources and its standalone catalog, which includes the licensed **Sintel** pilot. Online subtitle availability depends on Meta Egg's configured provider and the film's releases. See [verification](docs/development.md#verification).

## Capability index

| Goal                                                | Entrypoint                                                    |
| --------------------------------------------------- | ------------------------------------------------------------- |
| Use a shared local profile or separate accounts     | [Access your journal](#access-your-journal)                   |
| Find a film/cut and synchronize its subtitles       | [Follow playback](#follow-playback)                           |
| Read dialogue near the playhead                     | [Read subtitles](#read-subtitles)                             |
| Add, color-code, rate, and edit moments             | [Write and revisit notes](#write-and-revisit-notes)           |
| Browse previously opened timelines                  | [Browse the library](#browse-the-library)                     |
| Label an edition, override runtime, or look up OMDb | [Manage runtimes and editions](#manage-runtimes-and-editions) |
| Set language, highlighting window, and note color   | [Set preferences](#set-preferences)                           |
| Check Jellyfin, Bazarr, OMDb, and API status        | [Check connections](#check-connections)                       |
| Preview without a Jellyfin server                   | [Try demo mode](#try-demo-mode)                               |

## Access your journal

The deployment operator chooses the authentication mode in the server environment. There are no separate viewer/admin roles in the UI.

- With authentication disabled, open the app directly. Everyone uses **Local viewer**, including the same device selection, settings, and notes.
- With authentication enabled, use **Sign in** with your Introspect email and password. To register, choose **Create account**, enter a name, email, and password of at least eight characters, and submit. Registration must be enabled by the operator; the form can still appear when the server rejects sign-ups.
- Sign out from the user menu or **Settings → Private space**. The UI has no password-reset or account-deletion workflow.

These are Introspect accounts, not Jellyfin accounts. Enabling authentication does not transfer Local viewer's existing notes to your new account. Account setup and access boundaries are covered in [operations](docs/operations.md#authentication-and-access).

## Follow playback

1. On **Live**, enter a film title and select **Search films**. Meta Egg looks up metadata in its configured sources; the page shows progress while waiting. Submitting the same title repeats the lookup. The standalone pilot search is **Sintel**.
2. Select the movie. Its metadata appears while Meta Egg finds subtitle versions. Choose the **Cut / subtitle version** you are watching, then **Open screening**. A version's runtime helps identify it; an unlabeled file is not proof of a theatrical or director's cut. Different cuts retain separate notes and subtitle timing.
3. Select an available **Subtitle track**. Only text subtitles are supported. If no version can be supplied, the movie remains visible with a reason: the provider is not configured, no release was found, or the source is unavailable. Use **Retry subtitle search** after a temporary failure or configuration change. Opening a screening requires an available text track. A matching SRT/VTT can also be supplied through Meta Egg's standalone catalog; Introspect cannot OCR or create missing transcripts.
4. Open **Sync with the screen** and align with the film on your other screen. A supplied **Watch reference film** link opens the matching licensed video separately; it is optional and Introspect does not control it. Source attribution, license links and provider terms come from Meta Egg. A provider terms link does not imply an open license.

With Meta Egg's private screening storage configured, selecting an online movie automatically saves its metadata and available versions; loading a subtitle track saves its timed transcript. **Saved in Meta Egg** and **Transcript saved in Meta Egg** appear only after Meta Egg confirms each save. Searching alone does not save every result. Missing subtitles remain an explicit gap even when the movie is saved. A storage failure shows a retryable error; ask the operator to check the data volume before retrying. These saves belong to Meta Egg's private screening library, separate from Introspect's notes and Meta Egg's canonical graph.

For standalone catalog and online discovery entries, the external-screen clock is the only mode. Enter the film's current time as `mm:ss` or `h:mm:ss`, then tap **Sync now** at that moment. At the start, enter `0:00` and tap when the film begins. Alternatively, expand **Sync to a line of dialogue**, search for a line, and tap it when it starts on screen. Use **−0.5 s** or **+0.5 s** to correct drift. Keep the page open; reopening it requires another timing anchor.

Only catalog entries supplied by the optional Jellyfin provider expose **Follow a Jellyfin device via Meta Egg** and select a device playing the exact same item and media source. Meta Egg scopes visibility to its configured Jellyfin user. A different user's player or a player without media-source identity is not eligible. Introspect observes play, pause and seek; it never controls the movie. **Sync unavailable** means timing is currently an estimate. Reconnect or switch to a manual anchor before starting another note.

A declared subtitle version identifies the timing source; it does not automatically identify the film print or cut on your screen. Follow the version's matching notes, verify several spoken lines, and correct the anchor if needed. A matching cut and a good timing anchor are required. This MVP has no microphone/audio recognition, and network/player latency can affect the Jellyfin clock. Check the first few lines against the screen and correct the clock; frame-accurate synchronization is not claimed.

## Read subtitles

The subtitle roll shows the current line and nearby dialogue from Meta Egg's selected transcript. Change the track in the screening itself. Loading, missing tracks and upstream failures are shown explicitly, with retry for failed requests. A failed track never silently switches to another cut or to demo content.

When you begin a note, the subtitle view stays at that scene while the underlying film clock continues. **Save & catch up**, a color ping, or a rating ping returns to the current line after saving. **Return to live** asks before discarding text or an unsaved ping. No request pauses the movie.

## Write and revisit notes

1. Start/synchronize the screening clock. All six color buttons and all ten scores sit beside **Quick note**, always visible. Tap a color or score once to save that moment immediately. No text, picker, popup, scrollable option list, or second save press is required.
2. To add words, focus **Quick note** first. Focus captures the timestamp and holds the subtitle view while the film continues. Enter up to 2,000 characters, then tap a color or score to save the draft at that captured time. **Save & catch up** or Command/Ctrl+Enter also saves text with your default color.
3. A score is for this individual moment, not a whole-film rating. Score-only pings use your default note color. Scores are whole numbers from 1 to 10; an unrated moment has no score, rather than zero.
4. A failed save retains the text, color, score, and captured timestamp. Use **Retry & catch up** without recapturing the time. Navigation warns before discarding text or an unsaved ping. This is not an offline journal or a draft backup.

Under **Notes in this cut**, each moment shows its time, color meaning, optional text, and score. Its visible color and rating buttons save corrections with one press, preserving its timestamp and other fields. Use **Clear rating** to remove only the score, **Edit note** to add/change text (including on a textless ping), or **Delete note** and confirm to remove the moment; deletion has no undo. Failed text edits stay open for retry. Reopen the same film/cut to revisit moments without playback.

The on-page **Color meanings & rating scale** reference explains the conventions below. Expanding it is optional; the action buttons stay available without opening it.

## On matters of color coding

### Zotero notes

Use these same meanings for individual film moments:

| Color             | Meaning                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------- |
| Yellow — Insight  | Insight I gained by paying attention or understanding, which I will lose unless written down. |
| Red — Challenge   | Me challenging their statement or direction.                                                  |
| Green — Novelty   | Something novel / a contribution of the paper or film.                                        |
| Blue — Notation   | Notation — this shit is chopped in ML; I need to explain it to myself sometimes.              |
| Purple — Summary  | Summary notes.                                                                                |
| Orange — Confused | I don't get it!!! Right now I understand this: xxx…                                           |

## On matters of scoring / rating

Apply this film scale to individual moments, too:

| Score | Rating                 | Meaning                                                                                                        |
| ----- | ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| 10    | Perfect                | I just get the feeling that I want to watch it again, or I remember it randomly.                               |
| 9     | Amazing                | I don't randomly remember it, but when it's mentioned somewhere I think: man, I really want to watch it again. |
| 8     | Great                  | It was a great movie, it's memorable, and I would recommend it to other people.                                |
| 7     | Good                   | It was a good movie with some good scenes, but the quality felt lackluster at times.                           |
| 6     | Fine                   | It is inconsistent with previous events, or just mediocre.                                                     |
| 5     | Ok                     |                                                                                                                |
| 4     | Meh                    |                                                                                                                |
| 3     | Bad                    |                                                                                                                |
| 2     | Horrible               |                                                                                                                |
| 1     | Crime against humanity |                                                                                                                |

Changing films or cuts cannot move a note draft to another timeline. Timeline identity includes your Introspect profile, configured Meta Egg server, film ID, and cut ID. The older direct-Jellyfin timelines remain separate and are not automatically merged with Meta Egg timelines.

## Browse the library

Open **Library** to see titles Introspect has opened or observed for your profile. A title can appear without notes. Use **Live** to search the Meta Egg film catalog; Library is a history of your own timelines.

- Search by title or series name with **Search titles**.
- Filter with **All**, **Films**, or **Shows**; other videos appear under All.
- Cards show note count, recent note activity, runtime, and an optional edition label.
- Use **Clear filters** for an empty search result or **Try again** after a loading error.

The API returns at most the 100 most recently observed timelines. The UI sorts that set by note activity; counts and searches cover only those returned items. There is no pagination, journal export/import, or timeline deletion UI.

## Manage runtimes and editions

These legacy Library controls affect stored timeline metadata; they do not retime Meta Egg transcripts or change the screening clock, which follows the selected cut.

1. Open **Library** and select the relevant title card. The **Runtime override** dialog applies to that specific media source.
2. Enter **Runtime in minutes** (0.1–1,440) and optionally an **Edition label** (up to 80 characters).
3. Select **Save runtime**. A manual override persists across later playback snapshots and affects the displayed duration and playhead clamp. It does not move note timestamps.
4. To return to the supplied metadata, select **Use automatic**. This also clears the edition label.

For an OMDb lookup, the operator must first configure `OMDB_API_KEY`. In the same dialog, enter the IMDb title ID (for example, `tt0133093`), select **Look up**, verify the returned title/runtime against the actual cut, then select **Save runtime**. Lookup alone does not save anything. On failure, check the ID and server configuration, or enter a manual duration.

OMDb supplies title-level metadata, not an edition-specific duration. It is an explicit lookup, not an automatic background fallback. A saved OMDb value is not preserved like a manual override: a later playback snapshot can replace it with Jellyfin's runtime or clear it if Jellyfin has none. See [runtime behavior](docs/architecture.md#timeline-and-runtime-rules).

## Set preferences

In **Settings → Reading window**, change the fields and select **Save preferences**. Wait for **Preferences saved.**

| Preference                  | Default          | UI choices or range                                                       |
| --------------------------- | ---------------- | ------------------------------------------------------------------------- |
| Preferred subtitle language | English (`eng`)  | English, Romanian, French, German, Spanish, Italian, Portuguese, Japanese |
| Show before                 | 2 seconds        | Whole seconds, 0–60                                                       |
| Keep after                  | 12 seconds       | Whole seconds, 1–120                                                      |
| Default note color          | Yellow — Insight | Yellow, red, green, blue, purple, orange                                  |

The reading window highlights a note from its timestamp minus **Show before** until its timestamp plus **Keep after**. It does not hide other notes or change timestamps. Server addresses, keys, polling intervals, and authentication are operator settings, not editable here.

## Check connections

These Settings checks cover legacy direct integrations. To check the screening integration, use **Live** to search a real Meta Egg film and load its selected cut/transcript.

Open **Settings → Your media stack** and select **Check services**. Jellyfin and Bazarr checks contact those servers. OMDb's **Connected** badge only means a key is configured; **Look up** in the runtime dialog is the actual request. Bazarr being connected does not prove that a subtitle has been downloaded or indexed by Jellyfin.

The **API status** link checks Introspect's HTTP endpoint. It does not test playback, the database contents, or upstream integrations. See [operations](docs/operations.md) for configuration and failure recovery.

## Try demo mode

The current Live workflow always uses Meta Egg. `DEMO_MODE=true` only affects the retained legacy playback API; it does not provide a screening catalog or replace missing integrations. For an isolated synthetic walkthrough, use `bun run scripts/screening-smoke.ts --serve` and the web dev server, as described in Development.

Legacy API behavior: on a fresh profile with no conflicting Jellyfin preference, `/api/playback` and `/api/playback/subtitles` return a simulated **In the Mood for Love** session. The current Live page does not use those endpoints. API note/settings writes still persist, so use a separate database for disposable experiments. [Development](docs/development.md#isolated-demo) includes an isolated startup command.
