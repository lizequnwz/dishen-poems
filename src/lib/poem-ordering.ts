export type DateOrderedPoem = {
  data: {
    id: string;
    writtenDate: string;
  };
};

export function comparePoemsNewestFirst<T extends DateOrderedPoem>(a: T, b: T) {
  return b.data.writtenDate.localeCompare(a.data.writtenDate) || a.data.id.localeCompare(b.data.id);
}
