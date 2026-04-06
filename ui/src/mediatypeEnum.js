// Media type enum constants — keep in sync with docs/MEDIATYPES_ENUM.md
// and the mediatypes table's 'type' column.

/** A folder tree of image files indexed with CLIP / BLIP / WD14. */
export const MEDIA_TYPE_IMAGE_COLLECTION = 1;

/** Human-readable labels for each type value. */
export const MEDIA_TYPE_LABELS = {
  [MEDIA_TYPE_IMAGE_COLLECTION]: 'Image Collection',
};
