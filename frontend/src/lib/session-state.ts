import { useEffect, useState } from "react";

type SetStateAction<T> = T | ((previousState: T) => T);

export type SessionStateKey<T> = {
  storageKey: string;
  parse: (rawValue: string) => T;
  serialize: (value: T) => string;
};

export function createSessionStateKey<T>(
  storageKey: string,
  options?: {
    parse?: (rawValue: string) => T;
    serialize?: (value: T) => string;
  },
): SessionStateKey<T> {
  return {
    storageKey,
    parse: options?.parse ?? ((rawValue) => JSON.parse(rawValue) as T),
    serialize: options?.serialize ?? ((value) => JSON.stringify(value)),
  };
}

export function useSessionState<T>(
  key: SessionStateKey<T>,
  initialState: T | (() => T),
): [T, (nextState: SetStateAction<T>) => void] {
  const [state, setState] = useState<T>(() => getInitialSessionState(key, initialState));

  useEffect(() => {
    setState(getInitialSessionState(key, initialState));
  }, [initialState, key]);

  const setSessionState = (nextState: SetStateAction<T>) => {
    setState((previousState) => {
      const resolvedState =
        typeof nextState === "function"
          ? (nextState as (previousState: T) => T)(previousState)
          : nextState;

      if (canUseSessionStorage()) {
        try {
          globalThis.sessionStorage.setItem(key.storageKey, key.serialize(resolvedState));
        } catch {
          return resolvedState;
        }
      }

      return resolvedState;
    });
  };

  return [state, setSessionState];
}

function resolveInitialState<T>(initialState: T | (() => T)): T {
  return typeof initialState === "function" ? (initialState as () => T)() : initialState;
}

function getInitialSessionState<T>(key: SessionStateKey<T>, initialState: T | (() => T)): T {
  const resolvedInitialState = resolveInitialState(initialState);

  if (!canUseSessionStorage()) {
    return resolvedInitialState;
  }

  try {
    const persistedValue = globalThis.sessionStorage.getItem(key.storageKey);
    if (persistedValue === null) {
      return resolvedInitialState;
    }

    return key.parse(persistedValue);
  } catch {
    return resolvedInitialState;
  }
}

function canUseSessionStorage(): boolean {
  return typeof window !== "undefined";
}

export const sessionStateKeys = {
  taskInput: (taskId: string) => createSessionStateKey<string>(`task-input:${taskId}`),
};
