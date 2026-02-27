import { useState, useEffect } from "react";
import { getTags, DirectusTag } from "../services/directus";
import { IS_DEMO_MODE } from "../config";

export interface TagGroup {
  sheetTags: DirectusTag[];
  groupTags: DirectusTag[];
  otherTags: DirectusTag[];
}

export function useTags(): { tags: TagGroup; loading: boolean } {
  const [tags, setTags] = useState<TagGroup>({
    sheetTags: [],
    groupTags: [],
    otherTags: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (IS_DEMO_MODE) {
      setLoading(false);
      return;
    }

    getTags()
      .then((all) => {
        setTags({
          sheetTags: all.filter((t) => t.name.startsWith("גיליון: ")),
          groupTags: all.filter((t) => t.name.startsWith("קבוצה: ")),
          otherTags: all.filter(
            (t) =>
              !t.name.startsWith("גיליון: ") &&
              !t.name.startsWith("קבוצה: "),
          ),
        });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return { tags, loading };
}
