// Media type enum constants — keep in sync with docs/MEDIATYPES_ENUM.md
// and the mediatypes table's 'type' column.

/** A folder tree of image files indexed with CLIP / BLIP / WD14. */
export const MEDIA_TYPE_IMAGE_COLLECTION = 1;

/** A folder tree of video files; preview frames extracted with ffmpeg, embeddings via CLIP. */
export const MEDIA_TYPE_VIDEO_COLLECTION = 2;

/** Reserved for a future music / audio collection type. */
export const MEDIA_TYPE_MUSIC_COLLECTION = 3;

/** A folder tree of document files (.txt, .md, .rst, .docx, .pdf) indexed for text search. */
export const MEDIA_TYPE_DOCUMENT_COLLECTION = 4;

/** Human-readable labels for each type value. */
export const MEDIA_TYPE_LABELS = {
  [MEDIA_TYPE_IMAGE_COLLECTION]: 'Image Collection',
  [MEDIA_TYPE_VIDEO_COLLECTION]: 'Video Collection',
  [MEDIA_TYPE_MUSIC_COLLECTION]: 'Music Collection',
  [MEDIA_TYPE_DOCUMENT_COLLECTION]: 'Document Collection',
};
