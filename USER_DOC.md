# Using Introspect

This guide describes the UI implemented in this repository. It is based on code inspection; live Jellyfin journeys have not been reverified in this documentation pass. See [verification](docs/development.md#verification).

## Capability index

| Goal                                                | Entrypoint                                                    |
| --------------------------------------------------- | ------------------------------------------------------------- |
| Use a shared local profile or separate accounts     | [Access your journal](#access-your-journal)                   |
| Follow a Jellyfin device and its playback position  | [Follow playback](#follow-playback)                           |
| Read dialogue near the playhead                     | [Read subtitles](#read-subtitles)                             |
| Add, edit, delete, and highlight timed notes        | [Write and revisit notes](#write-and-revisit-notes)           |
| Search observed movies, episodes, and videos        | [Browse the library](#browse-the-library)                     |
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

Prerequisites: the operator has configured Jellyfin, and you can play a title on a Jellyfin device.

1. Start a movie, episode, or video in Jellyfin.
2. Open **Settings → Session to follow**. Select the intended device; selection saves immediately.
3. Open **Live**. The title, device, play/pause state, elapsed time, subtitles, and timeline follow that session.
4. Pause or seek in Jellyfin when you need to hold or change the scene. Introspect's play icon and progress bar display state; they do not control the player.

The selected Jellyfin user/device is remembered across visits. Before the first pairing, device names may be visible while the user, title, and position are hidden. With a configured Jellyfin user, playback can be selected automatically before you pin a device. Once a device is pinned, an idle device does not cause Introspect to switch to another playing device.

If the list is empty, open Jellyfin on the desired device and use **Refresh sessions**. Reload Settings if an existing list is stale. **Check services** refreshes service health, not the session list. If Live is empty, use **Choose device** or **Check again**. Persistent failures belong in [diagnostics](docs/operations.md#diagnostics).

## Read subtitles

The **Subtitle roll** on Live shows up to three nearby cues and highlights the active line. Introspect favors the text track selected in Jellyfin, then a preferred-language text track and other available text tracks. Change the active track in Jellyfin; Introspect has no track picker. The language preference only affects fallback selection.

If no text stream exists, add an SRT/VTT sidecar through your existing subtitle workflow and refresh the item's metadata in Jellyfin. Bazarr can supply sidecars when configured separately; Introspect does not start subtitle searches or downloads. Bitmap PGS/VobSub/DVB tracks are not OCR'd. Notes remain usable without subtitles.

After changing the language preference, reload Live to refetch cues. If a replaced sidecar still shows old text, ask the operator about the [subtitle cache](docs/operations.md#diagnostics).

## Write and revisit notes

Prerequisite: Live shows the desired title and media source.

1. If you want to anchor a thought to a fixed scene, pause in Jellyfin first. The timestamp is captured when you submit, not when you begin typing.
2. Enter up to 2,000 characters in **Quick note**, choose a color, and select **Add at …**.
3. Look for **Note placed on the timeline.** The note appears under **Notes in this film**, ordered by timestamp. Stored timestamps are rounded to whole seconds.
4. Use **Edit note**, change the text, and select **Save changes**; **Cancel editing** discards the edit. Use **Delete note** and confirm to remove it. There is no undo.

Existing notes become prominent during the configured reading window. You can view all notes for the current timeline even outside that window. The UI edits note text only; it has no control to retime or recolor an existing note.

To revisit old notes through the UI, play the same item and media source in Jellyfin and return to Live. Library cards open runtime settings, not a historical note reader. Different cuts keep separate timelines; missing notes can indicate a different account, source, or configured server address.

When a save fails, read the feedback beneath the composer and check the connection. For a failed edit, reopen the note editor before retrying. If notes fail to load, use the timeline's **Try again** button. Notes are stored on the server, and drafts are not an offline journal or a backup.

## Browse the library

Open **Library** to see titles Introspect has observed for your profile. A title can appear without notes. This is not a browse/search interface for the entire Jellyfin catalog.

- Search by title or series name with **Search titles**.
- Filter with **All**, **Films**, or **Shows**; other videos appear under All.
- Cards show note count, recent note activity, runtime, and an optional edition label.
- Use **Clear filters** for an empty search result or **Try again** after a loading error.

The API returns at most the 100 most recently observed timelines. The UI sorts that set by note activity; counts and searches cover only those returned items. There is no pagination, journal export/import, or timeline deletion UI.

## Manage runtimes and editions

1. Open **Library** and select the relevant title card. The **Runtime override** dialog applies to that specific media source.
2. Enter **Runtime in minutes** (0.1–1,440) and optionally an **Edition label** (up to 80 characters).
3. Select **Save runtime**. A manual override persists across later playback snapshots and affects the displayed duration and playhead clamp. It does not move note timestamps.
4. To return to Jellyfin metadata, select **Use automatic**. This also clears the edition label.

For an OMDb lookup, the operator must first configure `OMDB_API_KEY`. In the same dialog, enter the IMDb title ID (for example, `tt0133093`), select **Look up**, verify the returned title/runtime against the actual cut, then select **Save runtime**. Lookup alone does not save anything. On failure, check the ID and server configuration, or enter a manual duration.

OMDb supplies title-level metadata, not an edition-specific duration. It is an explicit lookup, not an automatic background fallback. A saved OMDb value is not preserved like a manual override: a later playback snapshot can replace it with Jellyfin's runtime or clear it if Jellyfin has none. See [runtime behavior](docs/architecture.md#timeline-and-runtime-rules).

## Set preferences

In **Settings → Reading window**, change the fields and select **Save preferences**. Wait for **Preferences saved.**

| Preference                  | Default         | UI choices or range                                                       |
| --------------------------- | --------------- | ------------------------------------------------------------------------- |
| Preferred subtitle language | English (`eng`) | English, Romanian, French, German, Spanish, Italian, Portuguese, Japanese |
| Show before                 | 2 seconds       | Whole seconds, 0–60                                                       |
| Keep after                  | 12 seconds      | Whole seconds, 1–120                                                      |
| Default note color          | Amber           | Amber, mint, lilac, rose, sky                                             |

The reading window highlights a note from its timestamp minus **Show before** until its timestamp plus **Keep after**. It does not hide other notes or change timestamps. Server addresses, keys, polling intervals, and authentication are operator settings, not editable here.

## Check connections

Open **Settings → Your media stack** and select **Check services**. Jellyfin and Bazarr checks contact those servers. OMDb's **Connected** badge only means a key is configured; **Look up** in the runtime dialog is the actual request. Bazarr being connected does not prove that a subtitle has been downloaded or indexed by Jellyfin.

The **API status** link checks Introspect's HTTP endpoint. It does not test playback, the database contents, or upstream integrations. See [operations](docs/operations.md) for configuration and failure recovery.

## Try demo mode

Ask the operator to set `DEMO_MODE=true`, restart the API, and reload the app. On a fresh profile with no conflicting Jellyfin user/device preference, Live shows a simulated **In the Mood for Love** session and synthetic subtitles. Demo notes and settings are real database writes; use a separate database for disposable experiments. [Development](docs/development.md#isolated-demo) includes an isolated startup command.
