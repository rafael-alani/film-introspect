import { ActionIcon, Button, Text, Textarea, Tooltip } from "@mantine/core";
import { IconCheck, IconEdit, IconTrash, IconX } from "@tabler/icons-react";
import {
  formatTimestamp,
  momentRatings,
  noteColors,
  type Note,
  type UpdateNoteInput,
} from "@film-introspect/contracts";
import { useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { MomentControls } from "./moment-controls";

export function TimedNote({
  note,
  position,
  lead,
  trail,
  onUpdate,
  onDelete,
  pending,
  reading = false,
  versionLabel,
}: {
  note: Note;
  position: number;
  lead: number;
  trail: number;
  onUpdate: (note: Note, input: UpdateNoteInput) => Promise<unknown>;
  onDelete: (note: Note) => void;
  pending: boolean;
  reading?: boolean;
  versionLabel?: string | undefined;
}) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(note.body);
  useBlocker({
    shouldBlockFn: () =>
      editing &&
      body !== note.body &&
      !window.confirm("Discard your note changes?"),
    enableBeforeUnload: editing && body !== note.body,
  });
  const isNear =
    note.atSeconds >= position - trail && note.atSeconds <= position + lead;
  const saveChanges = (input: UpdateNoteInput) => {
    void onUpdate(note, { ...(editing ? { body: body.trim() } : {}), ...input })
      .then(() => setEditing(false))
      .catch(() => {});
  };

  return (
    <article
      className={`timed-note note-${note.color}${isNear ? " active" : ""}`}
    >
      <div className="note-time">
        <span className={`note-dot note-${note.color}`} />
        {formatTimestamp(note.atSeconds)}
      </div>
      <div className="note-body">
        {editing ? (
          <Textarea
            aria-label="Edit note"
            autosize
            minRows={2}
            maxRows={8}
            value={body}
            maxLength={2000}
            disabled={pending}
            onChange={(event) => setBody(event.currentTarget.value)}
          />
        ) : (
          <>
            {note.body && <Text>{note.body}</Text>}
            <Text size="sm" c="dimmed">
              {noteColors.find((item) => item.value === note.color)?.label}
              {note.rating !== null &&
                ` · ${note.rating}/10 ${momentRatings.find((item) => item.value === note.rating)?.label}`}
            </Text>
          </>
        )}
        {versionLabel && <Text className="note-version">{versionLabel}</Text>}
        {(!reading || editing) && (
          <>
            <MomentControls
              color={note.color}
              rating={note.rating}
              disabled={pending}
              onColor={(color) => saveChanges({ color })}
              onRating={(rating) => saveChanges({ rating })}
            />
            {note.rating !== null && (
              <Button
                variant="subtle"
                size="compact-sm"
                color="gray"
                disabled={pending}
                onClick={() => saveChanges({ rating: null })}
              >
                Clear rating
              </Button>
            )}
          </>
        )}
      </div>
      <div className="note-actions">
        {editing ? (
          <>
            <Tooltip label="Save changes">
              <ActionIcon
                variant="subtle"
                color="green"
                disabled={pending}
                onClick={() => saveChanges({ body: body.trim() })}
                aria-label="Save changes"
              >
                <IconCheck size={16} />
              </ActionIcon>
            </Tooltip>
            <ActionIcon
              variant="subtle"
              color="gray"
              disabled={pending}
              onClick={() => {
                setBody(note.body);
                setEditing(false);
              }}
              aria-label="Cancel editing"
            >
              <IconX size={16} />
            </ActionIcon>
          </>
        ) : (
          <>
            <ActionIcon
              variant="subtle"
              color="gray"
              disabled={pending}
              onClick={() => {
                setBody(note.body);
                setEditing(true);
              }}
              aria-label="Edit note"
            >
              <IconEdit size={16} />
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              color="red"
              onClick={() => onDelete(note)}
              loading={pending}
              aria-label="Delete note"
            >
              <IconTrash size={16} />
            </ActionIcon>
          </>
        )}
      </div>
    </article>
  );
}
