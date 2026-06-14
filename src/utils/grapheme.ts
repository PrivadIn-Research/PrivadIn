type SegmenterLike = new (
  locale?: string,
  options?: { granularity?: "grapheme" },
) => {
  segment(value: string): Iterable<{ segment: string }>;
};

function graphemes(value: string) {
  const Segmenter = (Intl as unknown as { Segmenter?: SegmenterLike }).Segmenter;
  if (Segmenter) {
    return Array.from(new Segmenter(undefined, { granularity: "grapheme" }).segment(value), (part) => part.segment);
  }

  return Array.from(value);
}

export function countGraphemes(value: string) {
  return graphemes(value).length;
}

export function sliceGraphemes(value: string, maxLength: number) {
  return graphemes(value).slice(0, maxLength).join("");
}
