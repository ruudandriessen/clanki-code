export interface User {
  id: string;
  name: string;
}

export interface Order {
  id: string;
  userId: string;
}

export const DEFAULT_PAGE_SIZE = 20;
